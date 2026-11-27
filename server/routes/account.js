// Accounts, personal lists and real watch progress.
import express from 'express';
import {
  SESSION_COOKIE,
  createSession,
  destroySession,
  hashPassword,
  requireUser,
  sanitizeUser,
  validateRegistration,
  verifyPassword,
} from '../lib/auth.js';
import { db, mutate, newId } from '../lib/store.js';
import { rateLimit } from '../lib/rateLimit.js';

export const accountRouter = express.Router();

const authLimit = rateLimit({ windowMs: 60_000, max: 12, keyPrefix: 'auth' });
const writeLimit = rateLimit({ windowMs: 60_000, max: 120, keyPrefix: 'account' });

function cookieOptions(req) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 30 * 86_400_000,
  };
}

accountRouter.post('/auth/register', authLimit, (req, res) => {
  const { errors, valid, username, email } = validateRegistration(req.body ?? {});
  if (!valid) {
    res.status(400).json({ error: 'Please correct the highlighted fields.', fields: errors });
    return;
  }
  const store = db();
  const exists = store.users.some(
    (user) => user.username.toLowerCase() === username.toLowerCase() || (email && user.email && user.email.toLowerCase() === email.toLowerCase()),
  );
  if (exists) {
    res.status(409).json({ error: 'That username or email is already registered.' });
    return;
  }

  const isFirstUser = store.users.length === 0;
  const user = {
    id: newId(),
    username,
    displayName: username,
    email,
    passwordHash: hashPassword(req.body.password),
    role: isFirstUser ? 'admin' : 'member',
    titlePreference: 'romaji',
    theme: 'default',
    createdAt: new Date().toISOString(),
  };
  mutate((s) => {
    s.users.push(user);
  });
  const token = createSession(user.id, req);
  res.cookie(SESSION_COOKIE, token, cookieOptions(req));
  res.status(201).json({
    user: sanitizeUser(user),
    note: isFirstUser ? 'This account is the administrator of this aniyashi instance.' : null,
  });
});

accountRouter.post('/auth/login', authLimit, (req, res) => {
  const identifier = String(req.body?.identifier ?? req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  const store = db();
  const user = store.users.find(
    (candidate) =>
      candidate.username.toLowerCase() === identifier.toLowerCase() ||
      (candidate.email && candidate.email.toLowerCase() === identifier.toLowerCase()),
  );
  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: 'Those credentials do not match an account.' });
    return;
  }
  const token = createSession(user.id, req);
  res.cookie(SESSION_COOKIE, token, cookieOptions(req));
  res.json({ user: sanitizeUser(user) });
});

accountRouter.post('/auth/logout', (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  destroySession(token);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

accountRouter.get('/auth/me', (req, res) => {
  res.json({ user: sanitizeUser(req.user), isAdmin: req.user?.role === 'admin' });
});

accountRouter.patch('/me', requireUser, writeLimit, (req, res) => {
  const { displayName, bio, titlePreference, theme, avatarUrl } = req.body ?? {};
  const updated = mutate((store) => {
    const user = store.users.find((candidate) => candidate.id === req.user.id);
    if (!user) return null;
    if (typeof displayName === 'string' && displayName.trim()) user.displayName = displayName.trim().slice(0, 40);
    if (typeof bio === 'string') user.bio = bio.slice(0, 400);
    if (titlePreference === 'romaji' || titlePreference === 'english') user.titlePreference = titlePreference;
    if (typeof theme === 'string' && /^[a-z-]{3,20}$/.test(theme)) user.theme = theme;
    if (typeof avatarUrl === 'string' && (/^https?:\/\//.test(avatarUrl) || avatarUrl === '')) user.avatarUrl = avatarUrl || null;
    return sanitizeUser(user);
  });
  res.json({ user: updated });
});

/* ------------------------------- watch progress ------------------------------ */

function progressKey(userId, animeId, episodeNumber) {
  return `${userId}:${animeId}:${episodeNumber}`;
}

accountRouter.get('/me/progress', requireUser, (req, res) => {
  const rows = db().progress.filter((row) => row.userId === req.user.id);
  res.json({ items: rows });
});

accountRouter.post('/me/progress', requireUser, writeLimit, (req, res) => {
  const { animeId, animeTitle, animeCover, episodeNumber, positionSeconds, durationSeconds, completed, audioLanguage } = req.body ?? {};
  const id = Number(animeId);
  const episode = Number(episodeNumber);
  if (!Number.isFinite(id) || !Number.isFinite(episode)) {
    res.status(400).json({ error: 'animeId and episodeNumber are required.' });
    return;
  }
  const position = Math.max(0, Number(positionSeconds) || 0);
  const duration = Math.max(0, Number(durationSeconds) || 0);
  const record = mutate((store) => {
    const key = progressKey(req.user.id, id, episode);
    const index = store.progress.findIndex((row) => row.key === key);
    const next = {
      key,
      userId: req.user.id,
      animeId: id,
      animeTitle: String(animeTitle || '').slice(0, 200) || null,
      animeCover: typeof animeCover === 'string' && /^https?:\/\//.test(animeCover) ? animeCover : null,
      episodeNumber: episode,
      positionSeconds: Math.round(position),
      durationSeconds: Math.round(duration),
      percent: duration > 0 ? Math.min(100, Math.round((position / duration) * 100)) : 0,
      completed: Boolean(completed) || (duration > 0 && position / duration > 0.92),
      audioLanguage: audioLanguage ?? null,
      updatedAt: new Date().toISOString(),
    };
    if (index >= 0) store.progress[index] = next;
    else store.progress.push(next);
    store.progress = store.progress.slice(-3000);
    return next;
  });
  res.json({ item: record });
});

accountRouter.delete('/me/progress/:animeId/:episodeNumber', requireUser, writeLimit, (req, res) => {
  const key = progressKey(req.user.id, Number(req.params.animeId), Number(req.params.episodeNumber));
  mutate((store) => {
    store.progress = store.progress.filter((row) => row.key !== key);
  });
  res.json({ ok: true });
});

accountRouter.get('/me/continue-watching', requireUser, (req, res) => {
  const rows = db()
    .progress.filter((row) => row.userId === req.user.id && !row.completed && row.positionSeconds > 15)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 12);
  res.json({ items: rows });
});

/* --------------------------------- lists ----------------------------------- */

function listOps(collection) {
  return {
    get(req, res) {
      const rows = db()[collection].filter((row) => row.userId === req.user.id);
      res.json({ items: rows.sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt))) });
    },
    post(req, res) {
      const { animeId, animeTitle, animeCover, format, year, episodes, score } = req.body ?? {};
      const id = Number(animeId);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: 'animeId is required.' });
        return;
      }
      const item = mutate((store) => {
        const existing = store[collection].find((row) => row.userId === req.user.id && row.animeId === id);
        if (existing) return existing;
        const row = {
          id: newId(),
          userId: req.user.id,
          animeId: id,
          animeTitle: String(animeTitle || '').slice(0, 200) || null,
          animeCover: typeof animeCover === 'string' && /^https?:\/\//.test(animeCover) ? animeCover : null,
          format: format ?? null,
          year: year ?? null,
          episodes: episodes ?? null,
          score: score ?? null,
          addedAt: new Date().toISOString(),
        };
        store[collection].push(row);
        return row;
      });
      res.json({ item });
    },
    remove(req, res) {
      const id = Number(req.params.animeId);
      mutate((store) => {
        store[collection] = store[collection].filter((row) => !(row.userId === req.user.id && row.animeId === id));
      });
      res.json({ ok: true });
    },
  };
}

const watchlistOps = listOps('watchlist');
const favoriteOps = listOps('favorites');

accountRouter.get('/me/watchlist', requireUser, watchlistOps.get);
accountRouter.post('/me/watchlist', requireUser, writeLimit, watchlistOps.post);
accountRouter.delete('/me/watchlist/:animeId', requireUser, writeLimit, watchlistOps.remove);

accountRouter.get('/me/favorites', requireUser, favoriteOps.get);
accountRouter.post('/me/favorites', requireUser, writeLimit, favoriteOps.post);
accountRouter.delete('/me/favorites/:animeId', requireUser, writeLimit, favoriteOps.remove);

/* --------------------------------- stats ----------------------------------- */

accountRouter.get('/me/stats', requireUser, (req, res) => {
  const store = db();
  const rows = store.progress.filter((row) => row.userId === req.user.id);
  const watchedSeconds = rows.reduce((total, row) => total + Math.min(row.positionSeconds, row.durationSeconds || row.positionSeconds), 0);
  res.json({
    episodesStarted: rows.length,
    episodesCompleted: rows.filter((row) => row.completed).length,
    watchTimeSeconds: watchedSeconds,
    watchlist: store.watchlist.filter((row) => row.userId === req.user.id).length,
    favorites: store.favorites.filter((row) => row.userId === req.user.id).length,
    recent: rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 10),
  });
});

accountRouter.get('/me/export', requireUser, (req, res) => {
  const store = db();
  res.setHeader('Content-Disposition', 'attachment; filename="aniyashi-export.json"');
  res.json({
    exportedAt: new Date().toISOString(),
    user: sanitizeUser(req.user),
    progress: store.progress.filter((row) => row.userId === req.user.id),
    watchlist: store.watchlist.filter((row) => row.userId === req.user.id),
    favorites: store.favorites.filter((row) => row.userId === req.user.id),
  });
});

accountRouter.delete('/me', requireUser, (req, res) => {
  mutate((store) => {
    store.users = store.users.filter((user) => user.id !== req.user.id);
    store.sessions = store.sessions.filter((session) => session.userId !== req.user.id);
    store.progress = store.progress.filter((row) => row.userId !== req.user.id);
    store.watchlist = store.watchlist.filter((row) => row.userId !== req.user.id);
    store.favorites = store.favorites.filter((row) => row.userId !== req.user.id);
  });
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});
