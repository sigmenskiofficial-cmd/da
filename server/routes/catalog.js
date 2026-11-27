// Public catalog + playback API.
import express from 'express';
import { getMedia, getList, getSchedule, getGenres, currentSeason, getJikanEpisodes, metadataHealth, searchMedia, SORT_KEYS } from '../lib/anilist.js';
import { toAnime, toDetail, FORMATS, STATUSES, SEASONS } from '../lib/normalize.js';
import { availabilityIndex, resolvePlayback, episodeAvailability, listProviders, unavailablePlayback } from '../streaming/core.js';
import { catalogSummary, findEntry } from '../streaming/sources.js';
import { recordVerification } from '../streaming/providers/officialYoutube.js';
import { mutate, db } from '../lib/store.js';
import { rateLimit } from '../lib/rateLimit.js';

export const catalogRouter = express.Router();

const readLimit = rateLimit({ windowMs: 60_000, max: 240, keyPrefix: 'catalog' });
const writeLimit = rateLimit({ windowMs: 60_000, max: 40, keyPrefix: 'playback-write' });

catalogRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'aniyashi', version: '5.0.0', time: new Date().toISOString() });
});

catalogRouter.get('/meta', readLimit, async (_req, res, next) => {
  try {
    const genres = await getGenres().catch(() => []);
    res.json({
      formats: FORMATS,
      statuses: STATUSES,
      seasons: SEASONS,
      sorts: Object.keys(SORT_KEYS),
      genres,
      currentSeason: currentSeason(),
      years: Array.from({ length: 66 }, (_, i) => new Date().getUTCFullYear() + 1 - i),
      metadata: await metadataHealth().catch(() => ({ state: 'unknown' })),
    });
  } catch (err) {
    next(err);
  }
});

catalogRouter.get('/search', readLimit, async (req, res, next) => {
  try {
    const genres = String(req.query.genres || '')
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean);
    const result = await searchMedia({
      q: req.query.q ?? '',
      page: req.query.page,
      perPage: req.query.perPage,
      genres,
      year: req.query.year,
      season: req.query.season,
      format: req.query.format,
      status: req.query.status,
      minScore: req.query.minScore,
      sort: req.query.sort,
      includeAdult: false,
    });
    res.json({
      ...result,
      items: result.items.map((media) => {
        const anime = toAnime(media);
        const entry = findEntry(media);
        return {
          ...anime,
          playback: entry
            ? { availableEpisodes: entry.episodes.length, provider: 'official-youtube' }
            : { availableEpisodes: 0, provider: null },
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

catalogRouter.get('/lists/:kind', readLimit, async (req, res, next) => {
  try {
    const allowed = ['trending', 'popular', 'top-rated', 'upcoming', 'airing', 'movies', 'recent', 'seasonal', 'genre', 'hidden-gems'];
    if (!allowed.includes(req.params.kind)) {
      res.status(404).json({ error: 'Unknown list.' });
      return;
    }
    const result = await getList(req.params.kind, {
      page: req.query.page,
      perPage: req.query.perPage,
      genre: req.query.genre,
      season: req.query.season,
      year: req.query.year,
    });
    res.json({
      ...result,
      items: result.items.map((media) => {
        const anime = toAnime(media);
        const entry = findEntry(media);
        return { ...anime, playback: { availableEpisodes: entry ? entry.episodes.length : 0, provider: entry ? 'official-youtube' : null } };
      }),
    });
  } catch (err) {
    next(err);
  }
});

catalogRouter.get('/schedule', readLimit, async (req, res, next) => {
  try {
    const now = Date.now();
    const from = Number(req.query.from) || now - 6 * 3_600_000;
    const to = Number(req.query.to) || now + 7 * 86_400_000;
    const entries = await getSchedule({ from, to, page: req.query.page, perPage: req.query.perPage ?? 50 });
    res.json({
      from,
      to,
      items: entries.map((entry) => ({
        id: entry.id,
        airingAt: entry.airingAt,
        episode: entry.episode,
        anime: toAnime(entry.media),
      })),
    });
  } catch (err) {
    next(err);
  }
});

catalogRouter.get('/random', readLimit, async (req, res, next) => {
  try {
    const page = 1 + Math.floor(Math.random() * 12);
    const list = await getList('popular', { page, perPage: 25 });
    const items = list.items.filter(Boolean);
    if (!items.length) {
      res.status(503).json({ error: 'The metadata provider returned no records.' });
      return;
    }
    const pick = items[Math.floor(Math.random() * items.length)];
    res.json({ anime: toAnime(pick) });
  } catch (err) {
    next(err);
  }
});

catalogRouter.get('/anime/:id', readLimit, async (req, res, next) => {
  try {
    const media = await getMedia(req.params.id);
    const detail = toDetail(media);
    const entry = findEntry(media);
    const availability = availabilityIndex(media);
    const values = Object.values(availability);
    res.json({
      anime: detail,
      playback: {
        hasAuthorizedSource: Boolean(entry),
        availableEpisodes: entry ? entry.episodes.length : 0,
        verifiedEpisodes: values.filter((item) => item.state === 'verified-playable').length,
        provider: entry ? 'official-youtube' : null,
        channel: entry?.channel ?? null,
        rightsNote: entry?.rightsNote ?? null,
        episodeStates: availability,
      },
    });
  } catch (err) {
    next(err);
  }
});

catalogRouter.get('/anime/:id/episodes', readLimit, async (req, res, next) => {
  try {
    const media = await getMedia(req.params.id);
    const availability = availabilityIndex(media);
    const total = Number(media.episodes) || null;

    let jikan = { ok: false, reason: 'not-requested', episodes: [] };
    if (media.idMal) jikan = await getJikanEpisodes(media.idMal);
    const titles = new Map(jikan.ok ? jikan.episodes.map((ep) => [Number(ep.number), ep]) : []);

    const items = [];
    if (total && total <= 700) {
      for (let n = 1; n <= total; n += 1) {
        const meta = titles.get(n) ?? null;
        items.push({
          number: n,
          title: meta?.title ?? null,
          titleJapanese: meta?.titleJapanese ?? null,
          aired: meta?.aired ?? null,
          filler: Boolean(meta?.filler),
          recap: Boolean(meta?.recap),
          availability: availability[n]?.state ?? 'no-authorized-source',
          verifiedAt: availability[n]?.verifiedAt ?? null,
        });
      }
    } else if (jikan.ok) {
      for (const meta of jikan.episodes) {
        items.push({
          number: Number(meta.number),
          title: meta.title ?? null,
          titleJapanese: meta.titleJapanese ?? null,
          aired: meta.aired ?? null,
          filler: Boolean(meta.filler),
          recap: Boolean(meta.recap),
          availability: availability[Number(meta.number)]?.state ?? 'no-authorized-source',
          verifiedAt: availability[Number(meta.number)]?.verifiedAt ?? null,
        });
      }
    }

    res.json({
      animeId: media.id,
      idMal: media.idMal ?? null,
      totalEpisodes: total,
      nextEpisode: media.nextAiringEpisode ? { episode: media.nextAiringEpisode.episode, airingAt: media.nextAiringEpisode.airingAt } : null,
      episodeTitleSource: jikan.ok ? 'jikan' : 'unavailable',
      episodeTitleNotice: jikan.ok
        ? null
        : 'Per-episode titles could not be retrieved from the secondary metadata provider, so a numbered episode index is shown. Titles are not invented.',
      availableEpisodes: items.filter((item) => item.availability !== 'no-authorized-source').length,
      verifiedEpisodes: items.filter((item) => item.availability === 'verified-playable').length,
      items,
    });
  } catch (err) {
    next(err);
  }
});

catalogRouter.get('/anime/:id/relations', readLimit, async (req, res, next) => {
  try {
    const media = await getMedia(req.params.id);
    const detail = toDetail(media);
    res.json({ relations: detail.relations, recommendations: detail.recommendations });
  } catch (err) {
    next(err);
  }
});

catalogRouter.get('/playback/:animeId/:episode', readLimit, async (req, res, next) => {
  try {
    const media = await getMedia(req.params.animeId);
    const episodeNumber = Number(req.params.episode);
    if (!Number.isFinite(episodeNumber) || episodeNumber <= 0) {
      res.status(400).json({ error: 'Invalid episode number.' });
      return;
    }
    const result = await resolvePlayback(media, episodeNumber, { preferLanguage: req.query.lang ?? null });
    res.json({ anime: toAnime(media), ...result });
  } catch (err) {
    next(err);
  }
});

// Availability for a single episode without resolving playback (used by the watch page rail).
catalogRouter.get('/availability/:animeId/:episode', readLimit, async (req, res, next) => {
  try {
    const media = await getMedia(req.params.animeId);
    res.json({ animeId: media.id, episodeNumber: Number(req.params.episode), ...episodeAvailability(media, Number(req.params.episode)) });
  } catch (err) {
    next(err);
  }
});

/**
 * Genuine player-event verification. The browser reports what the official player actually
 * did; we only accept reports for episodes that exist in the authorized source catalog.
 */
catalogRouter.post('/playback/verify', writeLimit, async (req, res, next) => {
  try {
    const { animeId, episodeNumber, state, detail, source } = req.body ?? {};
    const media = await getMedia(animeId);
    const entry = findEntry(media);
    const episode = entry?.episodes.find((item) => Number(item.number) === Number(episodeNumber));
    if (!entry || !episode) {
      res.status(404).json({ error: 'That episode is not in the authorized source catalog.' });
      return;
    }
    const ok = state === 'playing' || state === 'ready';
    const record = recordVerification({
      animeId: media.id,
      episodeNumber: Number(episodeNumber),
      ok,
      state: ok ? 'verified-playable' : state || 'playback-error',
      detail: typeof detail === 'string' ? detail.slice(0, 300) : null,
      source: source === 'player' ? 'player' : 'client-report',
    });
    res.json({ recorded: true, record });
  } catch (err) {
    next(err);
  }
});

catalogRouter.post('/playback/report', writeLimit, async (req, res, next) => {
  try {
    const { animeId, animeTitle, episodeNumber, providerId, message, code } = req.body ?? {};
    if (!animeId || !episodeNumber) {
      res.status(400).json({ error: 'animeId and episodeNumber are required.' });
      return;
    }
    const report = {
      id: `rep_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      animeId: Number(animeId),
      animeTitle: String(animeTitle || '').slice(0, 200) || null,
      episodeNumber: Number(episodeNumber),
      providerId: String(providerId || 'unknown').slice(0, 60),
      message: String(message || '').slice(0, 800) || null,
      code: code != null ? String(code).slice(0, 20) : null,
      userId: req.user?.id ?? null,
      at: new Date().toISOString(),
      status: 'open',
    };
    mutate((store) => {
      store.reports.unshift(report);
      store.reports = store.reports.slice(0, 500);
    });
    res.json({ recorded: true, id: report.id });
  } catch (err) {
    next(err);
  }
});

catalogRouter.get('/sources/summary', readLimit, (_req, res) => {
  res.json(catalogSummary());
});

catalogRouter.get('/providers', readLimit, (_req, res) => {
  res.json({ providers: listProviders(), reportCount: db().reports.length });
});

export { unavailablePlayback };
