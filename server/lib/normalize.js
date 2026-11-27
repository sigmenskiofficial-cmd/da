// Normalizes provider records into the internal aniyashi representation.
// Missing values stay null — nothing is invented.

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
};

export function stripHtml(input) {
  if (!input || typeof input !== 'string') return null;
  const text = input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;|&#0?\d+;/gi, (entity) => ENTITIES[entity] ?? entity)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}

export function toAnime(media) {
  if (!media) return null;
  const title = {
    romaji: media.title?.romaji ?? null,
    english: media.title?.english ?? null,
    native: media.title?.native ?? null,
  };
  title.display = title.english || title.romaji || title.native || 'Untitled';

  return {
    id: media.id,
    idMal: media.idMal ?? null,
    title,
    synonyms: Array.isArray(media.synonyms) ? media.synonyms.filter(Boolean) : [],
    cover: media.coverImage?.extraLarge || media.coverImage?.large || null,
    coverMedium: media.coverImage?.large || media.coverImage?.medium || null,
    accent: media.coverImage?.color || null,
    banner: media.bannerImage || null,
    format: media.format ?? null,
    status: media.status ?? null,
    episodes: media.episodes ?? null,
    duration: media.duration ?? null,
    season: media.season ?? null,
    seasonYear: media.seasonYear ?? null,
    year: media.seasonYear ?? media.startDate?.year ?? null,
    startDate: media.startDate ?? null,
    score: media.averageScore ?? null,
    meanScore: media.meanScore ?? null,
    popularity: media.popularity ?? null,
    favourites: media.favourites ?? null,
    genres: Array.isArray(media.genres) ? media.genres : [],
    isAdult: Boolean(media.isAdult),
    description: stripHtml(media.description),
    studio: media.studios?.nodes?.[0]?.name ?? null,
    nextEpisode: media.nextAiringEpisode
      ? { episode: media.nextAiringEpisode.episode, airingAt: media.nextAiringEpisode.airingAt }
      : null,
  };
}

export function toRelation(edge) {
  if (!edge?.node || edge.node.type !== 'ANIME') return null;
  return {
    relationType: edge.relationType ?? 'RELATED',
    anime: {
      id: edge.node.id,
      idMal: edge.node.idMal ?? null,
      title: {
        romaji: edge.node.title?.romaji ?? null,
        english: edge.node.title?.english ?? null,
        display: edge.node.title?.english || edge.node.title?.romaji || 'Untitled',
      },
      cover: edge.node.coverImage?.large ?? null,
      coverMedium: edge.node.coverImage?.large ?? null,
      format: edge.node.format ?? null,
      episodes: edge.node.episodes ?? null,
      status: edge.node.status ?? null,
      year: edge.node.seasonYear ?? null,
      score: edge.node.averageScore ?? null,
      genres: [],
    },
  };
}

export function toDetail(media) {
  const base = toAnime(media);
  if (!base) return null;

  const relations = (media.relations?.edges ?? []).map(toRelation).filter(Boolean);
  const recommendations = (media.recommendations?.nodes ?? [])
    .map((node) => node?.mediaRecommendation)
    .filter((node) => node && node.type === 'ANIME')
    .map((node) => toAnime({ ...node, genres: node.genres ?? [] }));

  const characters = (media.characters?.edges ?? [])
    .filter((edge) => edge?.node)
    .map((edge) => ({
      id: edge.node.id,
      name: edge.node.name?.full ?? 'Unknown',
      image: edge.node.image?.large ?? null,
      role: edge.role ?? null,
      voiceActor: edge.voiceActors?.[0]
        ? { name: edge.voiceActors[0].name?.full ?? null, image: edge.voiceActors[0].image?.large ?? null }
        : null,
    }));

  const staff = (media.staff?.edges ?? [])
    .filter((edge) => edge?.node)
    .map((edge) => ({
      id: edge.node.id,
      name: edge.node.name?.full ?? 'Unknown',
      image: edge.node.image?.large ?? null,
      role: edge.role ?? null,
    }));

  return {
    ...base,
    endDate: media.endDate ?? null,
    tags: (media.tags ?? []).filter((tag) => !tag.isMediaSpoiler).map((tag) => ({ name: tag.name, rank: tag.rank })),
    trailer: media.trailer?.site === 'youtube' && media.trailer?.id ? media.trailer.id : null,
    relations,
    recommendations,
    characters,
    staff,
    externalLinks: (media.externalLinks ?? [])
      .filter((link) => link?.url && /^https?:\/\//i.test(link.url))
      .map((link) => ({ site: link.site ?? null, url: link.url, type: link.type ?? null })),
    streamingEpisodes: (media.streamingEpisodes ?? [])
      .filter((ep) => ep?.url && /^https?:\/\//i.test(ep.url))
      .map((ep) => ({ title: ep.title ?? null, thumbnail: ep.thumbnail ?? null, url: ep.url, site: ep.site ?? null })),
    studios: (media.studios?.nodes ?? []).map((studio) => studio.name),
  };
}

export const FORMATS = ['TV', 'TV_SHORT', 'MOVIE', 'OVA', 'ONA', 'SPECIAL', 'MUSIC'];
export const STATUSES = ['RELEASING', 'FINISHED', 'NOT_YET_RELEASED', 'CANCELLED', 'HIATUS'];
export const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];

export function humanizeEnum(value) {
  if (!value) return null;
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
