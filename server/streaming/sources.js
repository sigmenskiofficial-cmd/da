// Curated catalog of authorized official publisher uploads.
//
// The file data/official-sources.json only contains entries that were discovered from an
// official publisher channel and then verified with YouTube oEmbed (exists + embeddable).
// Nothing is generated: an entry without a real videoId never reaches the resolver.
import fs from 'node:fs';
import path from 'node:path';

const FILE = process.env.SOURCES_FILE || path.join(process.cwd(), 'data', 'official-sources.json');

let cached = { mtimeMs: -1, data: { sources: [] } };

export function loadSources() {
  try {
    const stat = fs.statSync(FILE);
    if (stat.mtimeMs === cached.mtimeMs) return cached.data;
    const raw = fs.readFileSync(FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const sources = (parsed.sources ?? []).filter(
      (entry) => entry && Array.isArray(entry.episodes) && entry.episodes.length > 0 && entry.episodes.every((ep) => ep?.videoId),
    );
    cached = { mtimeMs: stat.mtimeMs, data: { ...parsed, sources } };
    return cached.data;
  } catch {
    cached = { mtimeMs: -1, data: { sources: [], error: 'source catalog not found' } };
    return cached.data;
  }
}

export function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Finds the catalog entry for a metadata record using reliable identifiers first and a
 * strict title+year fallback. A loose single-word match is never accepted.
 */
export function findEntry(media) {
  if (!media) return null;
  const { sources } = loadSources();
  const anilistId = Number(media.id) || null;
  const malId = Number(media.idMal) || null;

  if (anilistId) {
    const byAnilist = sources.find((entry) => Number(entry.anilistId) === anilistId);
    if (byAnilist) return byAnilist;
  }
  if (malId) {
    const byMal = sources.find((entry) => Number(entry.malId) === malId);
    if (byMal) return byMal;
  }

  const candidates = new Set(
    [media.title?.english, media.title?.romaji, media.title?.native, ...(media.synonyms ?? [])]
      .filter(Boolean)
      .map(normalizeTitle),
  );
  if (!candidates.size) return null;

  const year = Number(media.seasonYear ?? media.startDate?.year ?? media.year) || null;

  for (const entry of sources) {
    const entryTitles = [entry.title, ...(entry.aliases ?? [])].filter(Boolean).map(normalizeTitle);
    const titleMatch = entryTitles.some((title) => title && candidates.has(title));
    if (!titleMatch) continue;
    if (entry.year && year && Math.abs(Number(entry.year) - year) > 1) continue;
    return entry;
  }
  return null;
}

export function catalogSummary() {
  const { sources, generatedAt } = loadSources();
  const episodes = sources.reduce((total, entry) => total + entry.episodes.length, 0);
  return {
    generatedAt: generatedAt ?? null,
    seriesCount: sources.length,
    episodeCount: episodes,
    series: sources.map((entry) => ({
      id: entry.id,
      title: entry.title,
      year: entry.year ?? null,
      anilistId: entry.anilistId ?? null,
      malId: entry.malId ?? null,
      channel: entry.channel ?? null,
      rightsNote: entry.rightsNote ?? null,
      episodes: entry.episodes.length,
      languages: [...new Set(entry.episodes.map((ep) => ep.language).filter(Boolean))],
    })),
  };
}
