// Live anime metadata client.
//
// Primary provider: AniList GraphQL (public, no credentials required).
// Secondary provider: Jikan (MyAnimeList) used only for per-episode titles when reachable.
// Nothing here is seeded or mocked: every record comes from the live API, with short-lived
// caching (not mirroring) as allowed by the provider's terms.
import { createCache, sleep, fetchWithTimeout } from './cache.js';

const ANILIST_ENDPOINT = process.env.ANILIST_ENDPOINT || 'https://graphql.anilist.co';
const JIKAN_ENDPOINT = process.env.JIKAN_ENDPOINT || 'https://api.jikan.moe/v4';

const cache = createCache({ ttlMs: 120_000, max: 900 });
const inflight = new Map();

export class MetadataError extends Error {
  constructor(message, status = 502, detail = null) {
    super(message);
    this.name = 'MetadataError';
    this.status = status;
    this.detail = detail;
  }
}

const MEDIA_CORE = `
fragment MediaCore on Media {
  id
  idMal
  type
  format
  status
  episodes
  duration
  season
  seasonYear
  title { romaji english native }
  synonyms
  coverImage { extraLarge large medium color }
  bannerImage
  averageScore
  meanScore
  popularity
  favourites
  genres
  isAdult
  description(asHtml: false)
  startDate { year month day }
  nextAiringEpisode { episode airingAt timeUntilAiring }
  studios(isMain: true) { nodes { id name } }
}`;

const SEARCH_QUERY = `
query Search($page: Int, $perPage: Int, $search: String, $genres: [String], $year: Int,
            $season: MediaSeason, $format: MediaFormat, $status: MediaStatus,
            $minScore: Int, $sort: [MediaSort], $isAdult: Boolean) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage lastPage hasNextPage perPage }
    media(type: ANIME, search: $search, genre_in: $genres, seasonYear: $year, season: $season,
          format: $format, status: $status, averageScore_greater: $minScore, sort: $sort,
          isAdult: $isAdult) { ...MediaCore }
  }
}
${MEDIA_CORE}`;

const DETAIL_QUERY = `
query Detail($id: Int) {
  Media(id: $id, type: ANIME) {
    ...MediaCore
    endDate { year month day }
    trailer { id site }
    tags { name rank isMediaSpoiler }
    relations {
      edges {
        relationType
        node { id idMal type format episodes status seasonYear title { romaji english } coverImage { large } averageScore }
      }
    }
    recommendations(perPage: 14, sort: RATING_DESC) {
      nodes { rating mediaRecommendation { id type format episodes seasonYear title { romaji english } coverImage { large } averageScore } }
    }
    characters(perPage: 12, sort: [ROLE, RELEVANCE, ID]) {
      edges {
        role
        node { id name { full } image { large } }
        voiceActors(language: JAPANESE) { id name { full } image { large } }
      }
    }
    staff(perPage: 8) { edges { role node { id name { full } image { large } } } }
    externalLinks { site url type }
    streamingEpisodes { title thumbnail url site }
  }
}
${MEDIA_CORE}`;

const SCHEDULE_QUERY = `
query Schedule($from: Int, $to: Int, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { total currentPage lastPage hasNextPage }
    airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
      id
      airingAt
      episode
      media { ...MediaCore }
    }
  }
}
${MEDIA_CORE}`;

const GENRE_QUERY = `query { GenreCollection }`;

async function gql(query, variables = {}, timeoutMs = 15_000) {
  let res;
  try {
    res = await fetchWithTimeout(
      ANILIST_ENDPOINT,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'aniyashi/5.0 (anime catalog client)',
        },
        body: JSON.stringify({ query, variables }),
      },
      timeoutMs,
    );
  } catch (err) {
    throw new MetadataError('The metadata service could not be reached', 503, String(err?.message || err));
  }

  if (res.status === 429) throw new MetadataError('Metadata provider rate limit reached', 429);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new MetadataError('Metadata provider returned an unreadable response', 502, text.slice(0, 200));
  }
  if (Array.isArray(json.errors) && json.errors.length) {
    throw new MetadataError(json.errors[0]?.message || 'Metadata query failed', 502);
  }
  if (!res.ok) throw new MetadataError(`Metadata provider responded ${res.status}`, 502);
  return json.data;
}

async function cachedGql(key, query, variables, ttlMs) {
  const hit = cache.get(key);
  if (hit) return hit;
  if (inflight.has(key)) return inflight.get(key);

  const task = (async () => {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const data = await gql(query, variables);
        cache.set(key, data, ttlMs);
        return data;
      } catch (err) {
        lastError = err;
        const retryable = err.status === 429 || err.status === 503 || err.status >= 500;
        if (!retryable || attempt === 2) throw err;
        await sleep(500 * 2 ** attempt);
      }
    }
    throw lastError;
  })();

  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}

const SORTS = {
  relevance: ['SEARCH_MATCH'],
  popularity: ['POPULARITY_DESC'],
  score: ['SCORE_DESC'],
  trending: ['TRENDING_DESC'],
  newest: ['START_DATE_DESC'],
  oldest: ['START_DATE'],
  title_az: ['TITLE_ROMAJI'],
  title_za: ['TITLE_ROMAJI_DESC'],
  favourites: ['FAVOURITES_DESC'],
};

export const SORT_KEYS = Object.keys(SORTS);

function clampPage(page) {
  const n = Number.parseInt(page, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 200);
}

function clampPerPage(perPage, fallback = 30) {
  const n = Number.parseInt(perPage, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 50);
}

/**
 * Live catalog search. Supports a free-text query plus genuine AniList filters.
 */
export async function searchMedia(params = {}) {
  const {
    q = '',
    page = 1,
    perPage = 30,
    genres = [],
    year = null,
    season = null,
    format = null,
    status = null,
    minScore = null,
    sort = null,
    includeAdult = false,
  } = params;

  const search = typeof q === 'string' ? q.trim().slice(0, 120) : '';
  const sortKey = sort && SORTS[sort] ? sort : search ? 'relevance' : 'popularity';

  const variables = {
    page: clampPage(page),
    perPage: clampPerPage(perPage),
    search: search || undefined,
    genres: Array.isArray(genres) && genres.length ? genres.slice(0, 4) : undefined,
    year: Number.isFinite(Number(year)) && Number(year) > 1900 ? Number(year) : undefined,
    season: season || undefined,
    format: format || undefined,
    status: status || undefined,
    minScore: Number.isFinite(Number(minScore)) ? Number(minScore) : undefined,
    sort: SORTS[sortKey],
    isAdult: includeAdult ? undefined : false,
  };

  const key = `search:${JSON.stringify(variables)}`;
  const data = await cachedGql(key, SEARCH_QUERY, variables, 120_000);
  const pageInfo = data?.Page?.pageInfo ?? {};
  return {
    page: pageInfo.currentPage ?? variables.page,
    perPage: pageInfo.perPage ?? variables.perPage,
    total: pageInfo.total ?? 0,
    lastPage: pageInfo.lastPage ?? null,
    hasNextPage: Boolean(pageInfo.hasNextPage),
    sort: sortKey,
    query: search,
    items: (data?.Page?.media ?? []).filter(Boolean),
  };
}

export async function getMedia(id) {
  const mediaId = Number.parseInt(id, 10);
  if (!Number.isFinite(mediaId) || mediaId <= 0) throw new MetadataError('Invalid anime identifier', 400);
  const data = await cachedGql(`detail:${mediaId}`, DETAIL_QUERY, { id: mediaId }, 900_000);
  if (!data?.Media) throw new MetadataError('Anime not found', 404);
  return data.Media;
}

export async function getList(kind, params = {}) {
  const page = clampPage(params.page ?? 1);
  const perPage = clampPerPage(params.perPage ?? 30);
  const base = { page, perPage, sort: ['POPULARITY_DESC'], isAdult: false };

  switch (kind) {
    case 'trending':
      base.sort = ['TRENDING_DESC'];
      break;
    case 'popular':
      base.sort = ['POPULARITY_DESC'];
      break;
    case 'top-rated':
      base.sort = ['SCORE_DESC'];
      base.minScore = 70;
      break;
    case 'upcoming':
      base.status = 'NOT_YET_RELEASED';
      base.sort = ['POPULARITY_DESC'];
      break;
    case 'airing':
      base.status = 'RELEASING';
      base.sort = ['TRENDING_DESC'];
      break;
    case 'movies':
      base.format = 'MOVIE';
      base.sort = ['POPULARITY_DESC'];
      break;
    case 'recent':
      base.sort = ['START_DATE_DESC'];
      base.status = 'FINISHED';
      break;
    case 'seasonal':
      base.season = params.season || currentSeason().season;
      base.year = Number(params.year) || currentSeason().year;
      base.sort = ['POPULARITY_DESC'];
      break;
    case 'genre':
      base.genres = [params.genre].filter(Boolean);
      base.sort = ['POPULARITY_DESC'];
      break;
    case 'classic':
      base.sort = ['SCORE_DESC'];
      base.year = 2005;
      base.minScore = 74;
      break;
    case 'hidden-gems':
      base.sort = ['SCORE_DESC'];
      base.minScore = 78;
      break;
    default:
      base.sort = ['POPULARITY_DESC'];
  }

  if (kind === 'classic') {
    // AniList has no "before year" filter; request the oldest high scoring titles instead.
    base.sort = ['START_DATE'];
    delete base.year;
  }

  const variables = {
    page: base.page,
    perPage: base.perPage,
    sort: base.sort,
    genres: base.genres,
    year: base.year,
    season: base.season,
    format: base.format,
    status: base.status,
    minScore: base.minScore,
    isAdult: false,
  };

  const key = `list:${kind}:${JSON.stringify(variables)}`;
  const data = await cachedGql(key, SEARCH_QUERY, variables, 300_000);
  const pageInfo = data?.Page?.pageInfo ?? {};
  return {
    page: pageInfo.currentPage ?? page,
    perPage: pageInfo.perPage ?? perPage,
    total: pageInfo.total ?? 0,
    lastPage: pageInfo.lastPage ?? null,
    hasNextPage: Boolean(pageInfo.hasNextPage),
    items: (data?.Page?.media ?? []).filter(Boolean),
  };
}

export async function getSchedule({ from, to, page = 1, perPage = 50 }) {
  const variables = {
    from: Math.floor(from / 1000),
    to: Math.floor(to / 1000),
    page: clampPage(page),
    perPage: clampPerPage(perPage, 50),
  };
  const key = `schedule:${JSON.stringify(variables)}`;
  const data = await cachedGql(key, SCHEDULE_QUERY, variables, 300_000);
  return (data?.Page?.airingSchedules ?? []).filter((entry) => entry?.media);
}

export async function getGenres() {
  const data = await cachedGql('genres', GENRE_QUERY, {}, 86_400_000);
  return data?.GenreCollection ?? [];
}

export function currentSeason(date = new Date()) {
  const month = date.getUTCMonth();
  const season = month < 3 ? 'WINTER' : month < 6 ? 'SPRING' : month < 9 ? 'SUMMER' : 'FALL';
  return { season, year: date.getUTCFullYear() };
}

/**
 * Secondary metadata provider. Jikan supplies per-episode titles for MyAnimeList ids.
 * It is optional: callers fall back to a numbered episode index when it is unavailable.
 */
let jikanBreakerUntil = 0;

export async function getJikanEpisodes(malId, { page = 1 } = {}) {
  const id = Number.parseInt(malId, 10);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, reason: 'no-mal-id', episodes: [] };
  if (Date.now() < jikanBreakerUntil) return { ok: false, reason: 'provider-unavailable', episodes: [] };

  const key = `jikan:episodes:${id}:${page}`;
  const hit = cache.get(key);
  if (hit) return hit;

  try {
    const res = await fetchWithTimeout(
      `${JIKAN_ENDPOINT}/anime/${id}/episodes?page=${page}`,
      { headers: { Accept: 'application/json', 'User-Agent': 'aniyashi/5.0' } },
      6000,
    );
    if (res.status === 429 || res.status >= 500) throw new Error(`status ${res.status}`);
    if (!res.ok) {
      const result = { ok: false, reason: 'not-found', episodes: [] };
      cache.set(key, result, 600_000);
      return result;
    }
    const json = await res.json();
    const result = {
      ok: true,
      hasNextPage: Boolean(json?.pagination?.has_next_page),
      episodes: (json?.data ?? []).map((ep) => ({
        number: ep.mal_id,
        title: ep.title || null,
        titleJapanese: ep.title_japanese || null,
        aired: ep.aired || null,
        filler: Boolean(ep.filler),
        recap: Boolean(ep.recap),
        score: ep.score ?? null,
      })),
    };
    cache.set(key, result, 3_600_000);
    return result;
  } catch {
    // Circuit breaker: stop hammering an unreachable provider for five minutes.
    jikanBreakerUntil = Date.now() + 300_000;
    return { ok: false, reason: 'provider-unavailable', episodes: [] };
  }
}

export function metadataHealth() {
  return {
    primary: { id: 'anilist', name: 'AniList GraphQL', endpoint: ANILIST_ENDPOINT, state: 'configured', credentialsRequired: false },
    secondary: {
      id: 'jikan',
      name: 'Jikan (MyAnimeList)',
      endpoint: JIKAN_ENDPOINT,
      state: Date.now() < jikanBreakerUntil ? 'temporarily-unavailable' : 'configured',
      credentialsRequired: false,
    },
    cacheEntries: cache.size,
  };
}
