// Verifies that an official YouTube upload still exists and still permits embedding.
//
// YouTube's oEmbed endpoint answers 200 only for videos that are public and embeddable,
// 401 when the owner disabled embedding and 404 when the video is gone. This gives an
// honest, documented signal without scraping the player or bypassing any restriction.
import { createCache, fetchWithTimeout } from '../lib/cache.js';

const cache = createCache({ ttlMs: 600_000, max: 400 });

const REASONS = {
  400: 'invalid-id',
  401: 'embedding-prohibited',
  403: 'embedding-prohibited',
  404: 'not-found',
};

export function isVideoId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{11}$/.test(value);
}

export async function verifyYouTube(videoId, { force = false } = {}) {
  if (!isVideoId(videoId)) {
    return { ok: false, embeddable: false, state: 'invalid-id', reason: 'The video identifier is malformed.', checkedAt: new Date().toISOString() };
  }
  if (!force) {
    const hit = cache.get(videoId);
    if (hit) return hit;
  }

  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
  let result;
  try {
    const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 8000);
    if (res.ok) {
      const json = await res.json();
      result = {
        ok: true,
        embeddable: true,
        state: 'embeddable',
        title: json.title ?? null,
        authorName: json.author_name ?? null,
        authorUrl: json.author_url ?? null,
        thumbnail: json.thumbnail_url ?? null,
        checkedAt: new Date().toISOString(),
      };
    } else {
      const state = REASONS[res.status] || 'unavailable';
      result = {
        ok: false,
        embeddable: false,
        state,
        reason:
          state === 'embedding-prohibited'
            ? 'The publisher does not allow this video to be embedded.'
            : state === 'not-found'
              ? 'The video is no longer available.'
              : `The provider responded ${res.status}.`,
        checkedAt: new Date().toISOString(),
      };
    }
  } catch (err) {
    result = {
      ok: false,
      embeddable: false,
      state: 'unreachable',
      reason: 'The video provider could not be reached for verification.',
      detail: String(err?.message || err),
      checkedAt: new Date().toISOString(),
    };
  }

  // Only cache definitive answers; a network blip must not look permanent.
  if (result.state !== 'unreachable') cache.set(videoId, result, result.ok ? 600_000 : 300_000);
  return result;
}
