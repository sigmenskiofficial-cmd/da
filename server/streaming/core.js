// ANIYASHI STREAMING CORE
//
// Provider-agnostic playback resolution. The core knows nothing about the frontend:
// it matches an anime to provider records, resolves a specific episode, ranks the usable
// sources and reports honest availability states. Adding an authorized provider means
// registering one more adapter here.
import { officialYoutubeProvider } from './providers/officialYoutube.js';
import { directMediaProvider } from './providers/direct.js';
import { catalogSummary, loadSources } from './sources.js';
import { db } from '../lib/store.js';
import { metadataHealth } from '../lib/anilist.js';

const providers = [officialYoutubeProvider, directMediaProvider];

const STATE_RANK = {
  'verified-playable': 5,
  'provider-available': 4,
  unverified: 3,
  'authentication-required': 1,
  'regional-restriction': 1,
  'temporarily-unavailable': 1,
  'embedding-prohibited': 0,
  'no-authorized-source': 0,
};

export function listProviders() {
  return providers.map((provider) => ({
    id: provider.id,
    providerName: provider.providerName,
    providerType: provider.providerType,
    rightsNote: provider.rightsNote,
    capabilities: provider.getCapabilities(),
    credentialsRequired: provider.getCapabilities().credentialsRequired,
  }));
}

export async function providerHealth() {
  return Promise.all(
    providers.map(async (provider) => {
      try {
        const health = await provider.checkHealth();
        return { id: provider.id, providerName: provider.providerName, ...health };
      } catch (err) {
        return {
          id: provider.id,
          providerName: provider.providerName,
          state: 'error',
          detail: String(err?.message || err),
          checkedAt: new Date().toISOString(),
        };
      }
    }),
  );
}

/** Availability for one episode without fetching playback information. */
export function episodeAvailability(media, episodeNumber) {
  const results = providers
    .map((provider) => {
      try {
        return { providerId: provider.id, providerName: provider.providerName, ...provider.validateAvailability(media, episodeNumber) };
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const playable = results
    .filter((item) => (STATE_RANK[item.state] ?? 0) >= 3)
    .sort((a, b) => (STATE_RANK[b.state] ?? 0) - (STATE_RANK[a.state] ?? 0));

  if (playable.length) return { ...playable[0], providers: results };
  return {
    state: results[0]?.state ?? 'no-authorized-source',
    verifiedAt: results[0]?.verifiedAt ?? null,
    detail: results[0]?.detail ?? 'No authorized provider supplies this episode.',
    providers: results,
  };
}

/** Map of episode number → availability state for a whole series (cheap, no network). */
export function availabilityIndex(media) {
  const map = {};
  for (const provider of providers) {
    let episodes = [];
    try {
      episodes = provider.discoverEpisodes(media) ?? [];
    } catch {
      episodes = [];
    }
    for (const episode of episodes) {
      const state = episodeAvailability(media, episode.number);
      const existing = map[episode.number];
      if (!existing || (STATE_RANK[state.state] ?? 0) > (STATE_RANK[existing.state] ?? 0)) {
        map[episode.number] = { state: state.state, verifiedAt: state.verifiedAt ?? null, providerId: provider.id };
      }
    }
  }
  return map;
}

export async function resolvePlayback(media, episodeNumber, { preferLanguage = null } = {}) {
  const attempts = [];
  const usable = [];

  for (const provider of providers) {
    try {
      const result = await provider.resolveEpisode(media, episodeNumber);
      if (result?.ok && result.source) {
        usable.push({ ...result.source, providerId: provider.id });
      } else {
        attempts.push({
          providerId: provider.id,
          providerName: provider.providerName,
          state: result?.state ?? 'no-authorized-source',
          reason: result?.reason ?? 'No source available.',
          availableEpisodes: result?.availableEpisodes ?? null,
        });
      }
    } catch (err) {
      attempts.push({
        providerId: provider.id,
        providerName: provider.providerName,
        state: 'provider-error',
        reason: 'The provider failed while resolving this episode.',
        detail: String(err?.message || err),
      });
    }
  }

  const ranked = usable.sort((a, b) => {
    const rank = (STATE_RANK[b.availability] ?? 0) - (STATE_RANK[a.availability] ?? 0);
    if (rank !== 0) return rank;
    if (preferLanguage) {
      const aLang = a.audioLanguage === preferLanguage ? 1 : 0;
      const bLang = b.audioLanguage === preferLanguage ? 1 : 0;
      if (aLang !== bLang) return bLang - aLang;
    }
    return 0;
  });

  return {
    ok: ranked.length > 0,
    episodeNumber: Number(episodeNumber),
    best: ranked[0] ?? null,
    sources: ranked,
    attempts,
    checkedAt: new Date().toISOString(),
  };
}

export function unavailablePlayback(media, episodeNumber, reason) {
  return {
    ok: false,
    episodeNumber: Number(episodeNumber),
    best: null,
    sources: [],
    attempts: [{ state: 'no-authorized-source', reason }],
    checkedAt: new Date().toISOString(),
  };
}

export async function diagnostics() {
  const store = db();
  const summary = catalogSummary();
  const health = await providerHealth();
  const metadata = metadataHealth();

  // Store keys are named `progress`/`watchlist`/... — read them defensively so an older
  // state document can never crash the diagnostics dashboard again.
  const progress = Array.isArray(store.progress) ? store.progress : [];
  const watchlist = Array.isArray(store.watchlist) ? store.watchlist : [];
  const users = Array.isArray(store.users) ? store.users : [];
  const verifications = Array.isArray(store.verifications) ? store.verifications : [];

  const verified = verifications.filter((item) => item.ok).length;
  const failed = verifications.filter((item) => !item.ok);
  const lastSync = summary.generatedAt ?? null;

  return {
    catalog: summary,
    providers: listProviders(),
    health,
    metadata,
    database: {
      driver: 'json-document',
      users: users.length,
      progressRecords: progress.length,
      watchlistRecords: watchlist.length,
      verificationRecords: verifications.length,
    },
    verification: {
      verifiedEpisodes: verified,
      failedSources: failed.length,
      lastVerifiedAt: verifications.map((item) => item.checkedAt).sort().at(-1) ?? null,
      lastError: failed.sort((a, b) => String(b.checkedAt).localeCompare(String(a.checkedAt)))[0] ?? null,
    },
    lastSynchronization: lastSync,
    sourceFile: loadSources().error ? 'missing' : 'loaded',
    notes: [
      'Metadata comes from the live AniList API; nothing in the catalog is seeded locally.',
      'Playback sources are limited to uploads published by rights holders on their own official channels.',
      'Anime without an authorized upload are shown as metadata-only, with availability labelled honestly.',
    ],
  };
}

export { STATE_RANK };
