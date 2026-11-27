// Administrator API: diagnostics, provider health, playback tests, moderation.
import express from 'express';
import { requireAdmin } from '../lib/auth.js';
import { db, mutate, newId, audit, stateInfo } from '../lib/store.js';
import { diagnostics, listProviders, providerHealth, resolvePlayback } from '../streaming/core.js';
import { getMedia } from '../lib/anilist.js';
import { catalogSummary, loadSources } from '../streaming/sources.js';
import { verifyYouTube } from '../streaming/verify.js';
import { rateLimit } from '../lib/rateLimit.js';

export const adminRouter = express.Router();

adminRouter.use(requireAdmin);
adminRouter.use(rateLimit({ windowMs: 60_000, max: 90, keyPrefix: 'admin' }));

adminRouter.get('/diagnostics', async (_req, res, next) => {
  try {
    const data = await diagnostics();
    res.json({ ...data, storage: stateInfo(), reports: db().reports.slice(0, 20) });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/providers', async (_req, res, next) => {
  try {
    res.json({ providers: listProviders(), health: await providerHealth(), catalog: catalogSummary() });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/providers/test', async (req, res, next) => {
  try {
    const health = await providerHealth();
    audit(req.user.id, 'provider.test', String(req.body?.providerId ?? 'all'));
    res.json({ health });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/playback/test', async (req, res, next) => {
  try {
    const animeId = Number(req.body?.animeId);
    const episodeNumber = Number(req.body?.episodeNumber ?? 1);
    if (!Number.isFinite(animeId)) {
      res.status(400).json({ error: 'animeId is required.' });
      return;
    }
    const media = await getMedia(animeId);
    const result = await resolvePlayback(media, episodeNumber);
    if (result.best?.playbackType === 'youtube' && result.best.embedId) {
      const check = await verifyYouTube(result.best.embedId, { force: true });
      res.json({ result, embedCheck: check });
      return;
    }
    res.json({ result, embedCheck: null });
  } catch (err) {
    next(err);
  }
});

// Re-verifies every catalogued embed and records the outcome. Bounded and rate limited so the
// publisher is never hammered.
adminRouter.post('/sync', async (req, res, next) => {
  try {
    const { sources } = loadSources();
    const limit = Math.min(Number(req.body?.limit) || 40, 120);
    const checked = [];
    for (const entry of sources) {
      for (const episode of entry.episodes.slice(0, 6)) {
        if (checked.length >= limit) break;
        const check = await verifyYouTube(episode.videoId, { force: true });
        checked.push({
          anime: entry.title,
          episode: episode.number,
          videoId: episode.videoId,
          ok: check.ok,
          state: check.state,
          title: check.title ?? null,
          authorName: check.authorName ?? null,
          reason: check.reason ?? null,
          checkedAt: check.checkedAt,
        });
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (checked.length >= limit) break;
    }
    const okCount = checked.filter((item) => item.ok).length;
    audit(req.user.id, 'sources.sync', `${checked.length} checked, ${okCount} embeddable`);
    res.json({ checkedAt: new Date().toISOString(), total: checked.length, embeddable: okCount, results: checked });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/cache/clear', (req, res) => {
  audit(req.user.id, 'cache.clear', null);
  res.json({ ok: true, note: 'Metadata caches expire on their own TTL; new requests re-query the providers.' });
});

adminRouter.get('/reports', (req, res) => {
  res.json({ items: db().reports });
});

adminRouter.post('/reports/:id/resolve', (req, res) => {
  const report = mutate((store) => {
    const found = store.reports.find((item) => item.id === req.params.id);
    if (found) found.status = 'resolved';
    return found ?? null;
  });
  res.json({ item: report });
});

adminRouter.get('/users', (req, res) => {
  res.json({
    items: db().users.map((user) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    })),
  });
});

adminRouter.post('/users/:id/role', (req, res) => {
  const role = req.body?.role === 'admin' ? 'admin' : 'member';
  const updated = mutate((store) => {
    const user = store.users.find((item) => item.id === req.params.id);
    if (user) user.role = role;
    return user ? { id: user.id, username: user.username, role: user.role } : null;
  });
  if (!updated) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  audit(req.user.id, 'user.role', `${updated.username} → ${role}`);
  res.json({ user: updated });
});

adminRouter.post('/direct-sources', (req, res) => {
  const { anilistId, malId, title, year, rightsNote, episodes } = req.body ?? {};
  if (!title || !Array.isArray(episodes) || !episodes.length) {
    res.status(400).json({ error: 'A title and at least one episode with a URL are required.' });
    return;
  }
  const clean = episodes
    .filter((episode) => Number(episode?.number) > 0 && typeof episode?.url === 'string' && /^https?:\/\//.test(episode.url))
    .map((episode) => ({
      number: Number(episode.number),
      url: episode.url,
      type: ['mp4', 'hls', 'dash'].includes(episode.type) ? episode.type : 'mp4',
      language: episode.language ?? null,
      title: episode.title ?? null,
      subtitles: Array.isArray(episode.subtitles) ? episode.subtitles.filter((s) => typeof s === 'string') : [],
    }));
  if (!clean.length) {
    res.status(400).json({ error: 'No valid episode entries were supplied.' });
    return;
  }
  const record = {
    id: newId(),
    anilistId: Number(anilistId) || null,
    malId: Number(malId) || null,
    title: String(title).slice(0, 200),
    year: Number(year) || null,
    rightsNote: String(rightsNote || 'Registered by administrator').slice(0, 300),
    episodes: clean,
    createdAt: new Date().toISOString(),
  };
  mutate((store) => {
    store.settings.directSources = [...(store.settings.directSources ?? []), record];
  });
  audit(req.user.id, 'direct-source.add', record.title);
  res.status(201).json({ source: record });
});

adminRouter.delete('/direct-sources/:id', (req, res) => {
  mutate((store) => {
    store.settings.directSources = (store.settings.directSources ?? []).filter((item) => item.id !== req.params.id);
  });
  res.json({ ok: true });
});

adminRouter.get('/audit', (req, res) => {
  res.json({ items: db().audit.slice(0, 100) });
});
