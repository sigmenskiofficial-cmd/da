#!/usr/bin/env node
// Discovers full-episode uploads on official publisher channels and verifies that each one
// is still public and embeddable. Output: data/discovered-candidates.json (a review artifact).
//
// Only the rights holder's own channel is crawled, and only videos that YouTube's oEmbed
// endpoint confirms as embeddable are written out. Nothing is invented.
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.join(process.cwd(), 'data', 'discovered-candidates.json');

const CHANNELS = [
  { handle: '@AnimeonTMSOfficialChannel', publisher: 'TMS Entertainment', rightsNote: 'Uploaded by TMS Entertainment on its official channel.' },
  { handle: '@GundamInfo', publisher: 'Bandai Namco Filmworks', rightsNote: 'Uploaded by GundamInfo, the official Gundam channel.' },
  { handle: '@vizmedia', publisher: 'VIZ Media', rightsNote: 'Uploaded by VIZ Media on its official channel.' },
];

const EPISODE_PATTERN = /(?:^|\s)(?:episode|ep\.?|e)\s*#?\s*(\d{1,4})(?:\D|$)/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; aniyashi-source-discovery/1.0)',
      'Accept-Language': 'en-US,en;q=0.9',
      Cookie: 'SOCS=CAI; PREF=hl=en&gl=US',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

function extractVideoIds(html) {
  const ids = new Set();
  const patterns = [/"videoId":"([A-Za-z0-9_-]{11})"/g, /\/watch\?v=([A-Za-z0-9_-]{11})/g];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html))) ids.add(match[1]);
  }
  return [...ids];
}

async function oembed(videoId) {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { ok: false, state: res.status === 401 || res.status === 403 ? 'embedding-prohibited' : res.status === 404 ? 'not-found' : `http-${res.status}` };
    const json = await res.json();
    return { ok: true, state: 'embeddable', title: json.title, authorName: json.author_name, authorUrl: json.author_url, thumbnail: json.thumbnail_url };
  } catch (err) {
    return { ok: false, state: 'unreachable', detail: String(err?.message || err) };
  }
}

function episodeNumber(title) {
  const match = EPISODE_PATTERN.exec(title || '');
  return match ? Number(match[1]) : null;
}

const results = [];

for (const channel of CHANNELS) {
  const pageUrl = `https://www.youtube.com/${channel.handle}/videos?hl=en&gl=US`;
  let html;
  try {
    html = await fetchText(pageUrl);
  } catch (err) {
    results.push({ channel, error: `channel page unavailable: ${err.message}`, videos: [] });
    console.log(`[discover] ${channel.handle}: page unavailable (${err.message})`);
    continue;
  }

  const ids = extractVideoIds(html).slice(0, 40);
  console.log(`[discover] ${channel.handle}: ${ids.length} candidate video ids`);
  const videos = [];

  for (const id of ids) {
    const check = await oembed(id);
    if (check.ok) {
      videos.push({
        videoId: id,
        title: check.title,
        authorName: check.authorName,
        authorUrl: check.authorUrl,
        episode: episodeNumber(check.title),
        thumbnail: check.thumbnail,
        embeddable: true,
      });
    }
    await sleep(200);
  }

  results.push({ channel, pageUrl, videoCount: ids.length, videos });
  console.log(`[discover] ${channel.handle}: ${videos.length} embeddable videos`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), note: 'Review artifact. Verified embeddable uploads from official publisher channels.', channels: results }, null, 2),
);
console.log(`[discover] wrote ${OUT}`);

for (const entry of results) {
  const episodes = (entry.videos ?? []).filter((video) => video.episode);
  if (episodes.length) {
    console.log(`\n${entry.channel.handle} — episode-like uploads:`);
    for (const video of episodes.slice(0, 30)) console.log(`  EP${video.episode}  ${video.videoId}  ${video.title}`);
  }
}
