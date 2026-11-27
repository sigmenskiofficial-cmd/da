// Persistent application state.
//
// The Free hosting plan does not include a managed database, so aniyashi keeps its
// relational-ish state in a single JSON document with atomic writes. Every write is
// serialized through a queue so concurrent requests cannot interleave.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'app-state.json');

const DEFAULTS = {
  version: 1,
  users: [],
  sessions: [],
  progress: [],
  watchlist: [],
  favorites: [],
  reports: [],
  verifications: [],
  audit: [],
  settings: {
    announcement: null,
    directSources: [],
  },
};

function load() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...structuredClone(DEFAULTS), ...parsed, settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) } };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

let state = load();
let writeTimer = null;
let writing = false;

function flush() {
  writeTimer = null;
  if (writing) {
    writeTimer = setTimeout(flush, 50);
    return;
  }
  writing = true;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, STATE_FILE);
  } catch (err) {
    console.error('[store] failed to persist state:', err.message);
  } finally {
    writing = false;
  }
}

export function db() {
  return state;
}

export function persist() {
  if (writeTimer) return;
  writeTimer = setTimeout(flush, 150);
}

export function mutate(fn) {
  const result = fn(state);
  persist();
  return result;
}

export function newId() {
  return crypto.randomUUID();
}

export function stateInfo() {
  return {
    path: STATE_FILE,
    persisted: fs.existsSync(STATE_FILE),
    counts: {
      users: state.users.length,
      sessions: state.sessions.length,
      progress: state.progress.length,
      watchlist: state.watchlist.length,
      favorites: state.favorites.length,
      reports: state.reports.length,
      verifications: state.verifications.length,
    },
  };
}

export function audit(actorId, action, detail) {
  mutate((s) => {
    s.audit.unshift({ id: newId(), actorId: actorId ?? null, action, detail: detail ?? null, at: new Date().toISOString() });
    s.audit = s.audit.slice(0, 300);
  });
}
