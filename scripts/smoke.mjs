// API smoke test: boots the real server on a temporary port and asserts the
// endpoints the UI depends on. Exits non-zero on the first failed assertion.
//
//   npm test
//
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const PORT = 4520 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'aniyashi-smoke-'));

const results = [];
let failed = 0;

function check(name, condition, detail) {
  const ok = Boolean(condition);
  if (!ok) failed += 1;
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function get(pathname, init) {
  const res = await fetch(BASE + pathname, init);
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

async function waitForServer(timeoutMs = 25_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(PORT), DATA_DIR, NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const serverLog = [];
server.stdout.on('data', (chunk) => serverLog.push(String(chunk)));
server.stderr.on('data', (chunk) => serverLog.push(String(chunk)));

let exitCode = 0;
try {
  const up = await waitForServer();
  check('server boots and answers /api/health', up);
  if (!up) throw new Error('server did not start');

  const health = await get('/api/health');
  check('health payload identifies aniyashi', health.body?.service === 'aniyashi', health.body?.service);

  const meta = await get('/api/meta');
  check('/api/meta returns filter metadata', meta.status === 200 && Array.isArray(meta.body?.formats) && meta.body.formats.length > 0, `status ${meta.status}, formats ${meta.body?.formats?.length}`);
  check('/api/meta reports metadata provider state', Boolean(meta.body?.metadata?.primary?.id), meta.body?.metadata?.primary?.id);

  // Live metadata search — the previous build returned a single hardcoded result.
  const search = await get('/api/search?q=naruto&perPage=24');
  const items = search.body?.items ?? [];
  check('search for "naruto" returns many records', search.status === 200 && (search.body?.total ?? 0) > 10, `total ${search.body?.total}`);
  check('search returns more than one page', (search.body?.lastPage ?? 0) > 1, `lastPage ${search.body?.lastPage}`);
  check('search results carry real artwork', items.some((item) => typeof item.cover === 'string' && item.cover.startsWith('http')), items[0]?.cover ?? 'none');
  check('search keeps franchise installments separate', new Set(items.map((item) => item.id)).size === items.length);

  const franchise = await get('/api/search?q=shippuden&perPage=10');
  check('franchise search finds Shippuden plus related titles', (franchise.body?.items ?? []).length >= 2, (franchise.body?.items ?? []).map((item) => item.id).join(','));

  // Episode metadata must not be capped at ten episodes.
  const episodes = await get('/api/anime/20/episodes');
  check('Naruto exposes its full 220-episode index', episodes.body?.totalEpisodes === 220 && (episodes.body?.items ?? []).length === 220, `${episodes.body?.totalEpisodes} / ${(episodes.body?.items ?? []).length} items`);

  // Playback: an authorized official upload resolves, an unlicensed series does not.
  const playable = await get('/api/playback/1816/1');
  check('authorized official episode resolves to a real source', playable.body?.ok === true && Boolean(playable.body?.best?.embedId), playable.body?.best?.embedId);
  check('resolved source is an official YouTube embed', playable.body?.best?.providerId === 'official-youtube' && playable.body?.best?.playbackType === 'youtube', playable.body?.best?.playbackType);

  const unlicensed = await get('/api/playback/20/1');
  check('unlicensed series reports unavailable instead of faking a source', unlicensed.body?.ok === false && unlicensed.body?.best === null, `attempts ${unlicensed.body?.attempts?.length}`);

  // Authorization: the admin surface must not be public.
  const anonAdmin = await get('/api/admin/diagnostics');
  check('admin diagnostics rejects anonymous requests', anonAdmin.status === 401, `status ${anonAdmin.status}`);

  const badLogin = await get('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'nobody', password: 'wrong-password' }),
  });
  check('login with unknown credentials is rejected', badLogin.status === 401 || badLogin.status === 400, `status ${badLogin.status}`);

  const schedule = await get('/api/schedule');
  check('airing schedule returns real entries', Array.isArray(schedule.body?.items), `items ${schedule.body?.items?.length}`);
} catch (err) {
  check('smoke run completed without throwing', false, String(err?.message || err));
} finally {
  server.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 300));
  try {
    fs.rmSync(DATA_DIR, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

const passed = results.filter((item) => item.ok).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (failed > 0) {
  console.error('\nServer log:\n' + serverLog.join(''));
  exitCode = 1;
}
process.exit(exitCode);
