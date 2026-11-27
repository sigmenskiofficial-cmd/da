// Provider: administrator-configured direct media sources (MP4 / HLS / DASH).
//
// This adapter is intentionally empty until an administrator registers a source the
// platform is actually allowed to serve. It exists so aniyashi is not tied to YouTube.
import { db } from '../../lib/store.js';

const PROVIDER_ID = 'direct-media';

function safeUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export const directMediaProvider = {
  id: PROVIDER_ID,
  providerName: 'Direct media (MP4 / HLS / DASH)',
  providerType: 'native',
  rightsNote: 'Only sources registered by an administrator with documented rights appear here.',

  getCapabilities() {
    return {
      playbackTypes: ['mp4', 'hls', 'dash'],
      discovery: false,
      languages: ['sub', 'dub'],
      subtitles: 'sidecar',
      qualitySelection: 'source-dependent',
      regionControl: 'source-dependent',
      credentialsRequired: false,
      paymentRequired: false,
      nativePlayer: true,
    };
  },

  async checkHealth() {
    const configured = this._entries().length;
    return {
      state: configured ? 'configured' : 'empty',
      detail: configured
        ? `${configured} administrator-registered source record(s).`
        : 'No direct media sources registered. Add one in Admin → Providers if you have distribution rights.',
      checkedAt: new Date().toISOString(),
    };
  },

  _entries() {
    const list = db().settings?.directSources;
    return Array.isArray(list) ? list : [];
  },

  matchAnime(media) {
    if (!media) return null;
    const entries = this._entries();
    const byId = entries.find((entry) => Number(entry.anilistId) === Number(media.id) && media.id);
    if (byId) return { providerId: PROVIDER_ID, providerAnimeId: byId.id, entry: byId, confidence: 'exact-id' };
    const malId = Number(media.idMal);
    const byMal = malId ? entries.find((entry) => Number(entry.malId) === malId) : null;
    if (byMal) return { providerId: PROVIDER_ID, providerAnimeId: byMal.id, entry: byMal, confidence: 'exact-id' };
    return null;
  },

  discoverEpisodes(media) {
    const match = this.matchAnime(media);
    if (!match) return [];
    return (match.entry.episodes ?? []).map((episode) => ({
      number: Number(episode.number),
      title: episode.title ?? null,
      language: episode.language ?? null,
    }));
  },

  async resolveEpisode(media, episodeNumber) {
    const match = this.matchAnime(media);
    if (!match) return { ok: false, state: 'no-authorized-source', reason: 'No direct source registered for this anime.' };
    const episode = (match.entry.episodes ?? []).find((item) => Number(item.number) === Number(episodeNumber));
    const url = safeUrl(episode?.url);
    if (!episode || !url) {
      return { ok: false, state: 'no-authorized-source', reason: `No direct source registered for episode ${episodeNumber}.` };
    }
    const playbackType = episode.type === 'hls' ? 'hls' : episode.type === 'dash' ? 'dash' : 'mp4';
    return {
      ok: true,
      state: 'provider-available',
      source: {
        providerId: PROVIDER_ID,
        providerName: 'Direct media',
        providerType: 'native',
        playbackType,
        url,
        title: episode.title ?? null,
        audioLanguage: episode.language ?? null,
        subtitleLanguages: Array.isArray(episode.subtitles) ? episode.subtitles : [],
        qualities: null,
        region: null,
        availability: 'provider-available',
        verifiedAt: episode.verifiedAt ?? null,
        contentRights: match.entry.rightsNote ?? 'Registered by administrator',
        matchConfidence: match.confidence,
      },
    };
  },

  validateAvailability(media, episodeNumber) {
    const match = this.matchAnime(media);
    if (!match) return { state: 'no-authorized-source' };
    const episode = (match.entry.episodes ?? []).find((item) => Number(item.number) === Number(episodeNumber));
    return episode?.url ? { state: 'provider-available' } : { state: 'no-authorized-source' };
  },

  normalizeError(code) {
    return { state: 'error', message: typeof code === 'string' ? code : `Media error ${code}` };
  },
};
