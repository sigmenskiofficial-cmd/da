// Authentication: scrypt password hashing, opaque session tokens, role-based access.
import crypto from 'node:crypto';
import { db, mutate, newId } from './store.js';

export const SESSION_COOKIE = 'aniyashi_session';
const SESSION_TTL_MS = 30 * 86_400_000;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hash] = parts;
  const expected = Buffer.from(hash, 'hex');
  const candidate = crypto.scryptSync(String(password), salt, expected.length);
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const chunk of String(header).split(';')) {
    const index = chunk.indexOf('=');
    if (index < 0) continue;
    const key = chunk.slice(0, index).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(chunk.slice(index + 1).trim());
  }
  return out;
}

export function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName ?? user.username,
    email: user.email ?? null,
    role: user.role,
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio ?? null,
    titlePreference: user.titlePreference ?? 'romaji',
    theme: user.theme ?? 'default',
    createdAt: user.createdAt,
  };
}

export function createSession(userId, req) {
  const token = crypto.randomBytes(32).toString('base64url');
  mutate((store) => {
    store.sessions = store.sessions.filter((session) => Date.parse(session.expiresAt) > Date.now());
    store.sessions.push({
      id: newId('sess'),
      token,
      userId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
      userAgent: String(req?.headers?.['user-agent'] ?? '').slice(0, 180),
    });
  });
  return token;
}

export function destroySession(token) {
  if (!token) return;
  mutate((store) => {
    store.sessions = store.sessions.filter((session) => session.token !== token);
  });
}

export function destroyAllSessions(userId) {
  mutate((store) => {
    store.sessions = store.sessions.filter((session) => session.userId !== userId);
  });
}

export function userFromRequest(req) {
  const token = parseCookies(req.headers?.cookie)[SESSION_COOKIE];
  if (!token) return null;
  const store = db();
  const session = store.sessions.find((item) => item.token === token);
  if (!session) return null;
  if (Date.parse(session.expiresAt) < Date.now()) return null;
  return store.users.find((user) => user.id === session.userId) ?? null;
}

export function attachUser(req, _res, next) {
  req.user = userFromRequest(req);
  next();
}

export function requireUser(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: 'Sign in to use this feature.', code: 'auth-required' });
    return;
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: 'Sign in to use this feature.', code: 'auth-required' });
    return;
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Administrator access is required.', code: 'admin-required' });
    return;
  }
  next();
}

export function validateRegistration({ username, email, password }) {
  const errors = {};
  const name = String(username || '').trim();
  if (!/^[A-Za-z0-9_.-]{3,24}$/.test(name)) errors.username = 'Use 3–24 letters, numbers, dots, dashes or underscores.';
  const mail = String(email || '').trim();
  if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) errors.email = 'Enter a valid email address.';
  if (String(password || '').length < 8) errors.password = 'Use at least 8 characters.';
  return { errors, valid: Object.keys(errors).length === 0, username: name, email: mail || null };
}
