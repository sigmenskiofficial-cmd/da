// Provider: official publisher uploads on YouTube.
//
// Every playback entry resolves to a documented YouTube IFrame embed for a video that was
// published by the rights holder's own channel and verified through oEmbed. The provider
// never invents identifiers and never proxies or restrips video.
import { findEntry } from '../sources.js';
import { verifyYouTube } from '../verify.js';
import { db, mutate } from '../../lib/store.js';

const PROVIDER_ID = 'official-youtube';

function verificationKey(animeId, episodeNumber) {
  return `${PROVIDER_ID}:${animeId}:${episodeNumber}`;
}

function readVerification(animeId, episodeNumber) {
  const record = db().verifications.find((item) => item.key === verificationKey(animeId, episodeNumber));
  return record ?? null;
}

export function recordVerification({ animeId, episodeNumber, ok, state, detail, source = 'player' }) {
  return mutate((store) => {
    const key = verificationKey(animeId, episodeNumber);
    const index = store.verifications.findIndex((item) => item.key === key);
    const record = {
      key,
      providerId: PROVIDER_ID,
      animeId,
      episodeNumber,
      ok: Boolean(ok),
      state: state || (ok ? 'verified-playable' : 'playback-error'),
      detail: detail ?? null,
      source,
      checkedAt: new Date().toISOString(),
    };
    if (index >= 0) store.verifications[index] = record;
    else store.verifications.push(record);
    store.verifications = store.verifications.slice(-2000);
    return record;
  });
}

function availabilityFor(animeId, episodeNumber, episode) {
  const verification = readVerification(animeId, episodeNumber);
  const fresh = verification && Date.now() - Date.parse(verification.checkedAt) < 30 * 86_400_000;
  if (fresh && verification.ok) {
    return { state: 'verified-playable', verifiedAt: verification.checkedAt, detail: verification.detail ?? null };
  }
  if (fresh && !verification.ok && verification.state === 'embedding-prohibited') {
    return { state: 'embedding-prohibited', verifiedAt: verification.checkedAt, detail: verification.detail ?? null };
  }
  if (episode.verifiedAt) {
    return { state: 'provider-available', verifiedAt: episode.verifiedAt, detail: 'Publisher embed verified when the catalog was synchronized.' };
  }
  return { state: 'unverified', verifiedAt: null, detail: 'Listed by the publisher; playback has not been confirmed yet.' };
}

export const officialYoutubeProvider = {
  id: PROVIDER_ID,
  providerName: 'Official publisher channels (YouTube)',
  providerType: 'embed',
  rightsNote: 'Streams are served by the publisher’s own YouTube player. aniyashi never re-hosts or proxies this video.',

  getCapabilities() {
    return {
      playbackTypes: ['youtube-embed'],
      discovery: true,
      languages: ['sub', 'dub'],
      subtitles: 'provider-controlled',
      qualitySelection: 'provider-controlled',
      regionControl: 'provider',
      credentialsRequired: false,
      paymentRequired: false,
      nativePlayer: false,
    };
  },

  async checkHealth() {
    const entry = findEntry({ id: null, title: { english: 'Sonic X' }, seasonYear: 2003 });
    const sample = entry?.episodes?.[0]?.videoId;
    if (!sample) return { state: 'empty', detail: 'No official sources configured yet.', checkedAt: new Date().toISOString() };
    const check = await verifyYouTube(sample);
    return {
      state: check.ok ? 'healthy' : check.state,
      detail: check.ok ? `Sample embed verified (${check.authorName ?? 'official channel'}).` : check.reason,
      checkedAt: check.checkedAt,
    };
  },

  matchAnime(media) {
    const entry = findEntry(media);
    if (!entry) return null;
    return {
      providerId: PROVIDER_ID,
      providerAnimeId: entry.id,
      title: entry.title,
      channel: entry.channel ?? null,
      rightsNote: entry.rightsNote ?? null,
      confidence: Number(entry.anilistId) && Number(entry.anilistId) === Number(media.id) ? 'exact-id' : 'title-year',
      entry,
    };
  },

  discoverEpisodes(media) {
    const match = this.matchAnime(media);
    if (!match) return [];
    return match.entry.episodes.map((episode) => ({
      number: Number(episode.number),
      title: episode.title ?? null,
      language: episode.language ?? null,
      durationSeconds: episode.durationSeconds ?? null,
    }));
  },

  async resolveEpisode(media, episodeNumber) {
    const match = this.matchAnime(media);
    if (!match) return { ok: false, state: 'no-authorized-source', reason: 'No official publisher upload is registered for this anime.' };
    const episode = match.entry.episodes.find((item) => Number(item.number) === Number(episodeNumber));
    if (!episode) {
      return {
        ok: false,
        state: 'no-authorized-source',
        reason: `The publisher has not released episode ${episodeNumber} on an official channel that aniyashi can embed.`,
        availableEpisodes: match.entry.episodes.map((item) => Number(item.number)),
      };
    }

    const availability = availabilityFor(media.id, episodeNumber, episode);
    return {
      ok: availability.state !== 'embedding-prohibited',
      state: availability.state,
      source: {
        providerId: PROVIDER_ID,
        providerName: 'Official publisher channel',
        providerType: 'embed',
        playbackType: 'youtube',
        embedId: episode.videoId,
        embedUrl: `https://www.youtube.com/embed/${episode.videoId}?enablejsapi=1&rel=0&modestbranding=1`,
        watchUrl: `https://www.youtube.com/watch?v=${episode.videoId}`,
        title: episode.title ?? null,
        channel: match.entry.channel ?? null,
        rightsNote: match.entry.rightsNote ?? null,
        audioLanguage: episode.language ?? null,
        subtitleLanguages: [],
        qualities: null,
        region: 'publisher-controlled',
        availability: availability.state,
        verifiedAt: availability.verifiedAt,
        availabilityDetail: availability.detail,
        contentRights: match.entry.rightsNote ?? 'Official publisher upload',
        matchConfidence: match.confidence,
      },
    };
  },

  validateAvailability(media, episodeNumber) {
    const match = this.matchAnime(media);
    if (!match) return { state: 'no-authorized-source' };
    const episode = match.entry.episodes.find((item) => Number(item.number) === Number(episodeNumber));
    if (!episode) return { state: 'no-authorized-source' };
    return availabilityFor(media.id, episodeNumber, episode);
  },

  normalizeError(code) {
    const map = {
      2: { state: 'error', message: 'The video request contained invalid parameters.' },
      5: { state: 'error', message: 'The publisher’s HTML5 player reported an internal playback error.' },
      100: { state: 'unavailable', message: 'The publisher removed this video or made it private.' },
      101: { state: 'embedding-prohibited', message: 'The publisher does not allow this video to be embedded.' },
      150: { state: 'embedding-prohibited', message: 'The publisher does not allow this video to be embedded here.' },
      153: { state: 'client-identification', message: 'The player could not identify the embedding page. Reload the page or open it in a new tab.' },
    };
    return map[code] ?? { state: 'error', message: `The player reported error ${code}.` };
  },
};
