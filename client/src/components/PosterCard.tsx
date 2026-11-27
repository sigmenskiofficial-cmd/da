import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiAnime, type Anime, type Detail } from '../lib/api';
import { episodeCountLabel, formatLabel, minutesLabel, stateLabel } from '../lib/format';
import { Cover, ScoreBadge } from './Bits';

const detailCache = new Map<number, Detail>();

async function loadDetail(id: number): Promise<Detail | null> {
  const cached = detailCache.get(id);
  if (cached) return cached;
  try {
    const data = await apiAnime(id);
    detailCache.set(id, data.anime);
    return data.anime;
  } catch {
    return null;
  }
}

export function useHoverPreview(anime: Anime) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const scheduleOpen = useCallback(() => {
    if (!window.matchMedia('(hover: hover)').matches) return;
    clearTimers();
    openTimer.current = window.setTimeout(async () => {
      const rect = cardRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = 330;
      const height = 360;
      let left = rect.right + 12;
      if (left + width > window.innerWidth - 12) left = Math.max(12, rect.left - width - 12);
      const top = Math.min(Math.max(12, rect.top - 20), Math.max(12, window.innerHeight - height - 12));
      setPosition({ left, top });
      setOpen(true);
      const data = await loadDetail(anime.id);
      if (data) setDetail(data);
    }, 300);
  }, [anime.id, clearTimers]);

  const scheduleClose = useCallback(() => {
    if (openTimer.current) window.clearTimeout(openTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 180);
  }, []);

  const keepOpen = useCallback(() => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);

  return { cardRef, detail, open, position, scheduleOpen, scheduleClose, keepOpen, setOpen };
}

export function PosterCard({
  anime,
  progressPercent,
  watchedEpisodes,
  layout = 'grid',
}: {
  anime: Anime;
  progressPercent?: number;
  watchedEpisodes?: number;
  layout?: 'grid' | 'dense' | 'list';
}) {
  const { cardRef, detail, open, position, scheduleOpen, scheduleClose, keepOpen, setOpen } = useHoverPreview(anime);
  const available = anime.playback?.availableEpisodes ?? 0;
  const title = anime.title.display;
  const meta = [formatLabel(anime.format), anime.seasonYear ?? anime.year, episodeCountLabel(anime.episodes)].filter(Boolean);

  return (
    <>
      <div
        className={`poster-card${layout === 'list' ? ' is-list' : ''}`}
        ref={cardRef}
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
        onFocus={scheduleOpen}
        onBlur={scheduleClose}
      >
        <Link to={`/anime/${anime.id}`} className="poster-thumb" aria-label={`${title} details`}>
          <Cover src={anime.cover} fallback={anime.coverMedium} alt={title} />
          <div className="poster-badges">
            {available > 0 ? <span className="chip chip-verified">{available} playable</span> : null}
            {anime.isAdult ? <span className="chip chip-warn">18+</span> : null}
          </div>
          <ScoreBadge score={anime.score} />
          {typeof progressPercent === 'number' && progressPercent > 0 ? (
            <span className="poster-progress">
              <i style={{ width: `${Math.min(100, progressPercent)}%` }} />
            </span>
          ) : null}
        </Link>
        <div className="poster-body">
          <Link className="poster-title" to={`/anime/${anime.id}`}>
            {title}
          </Link>
          <div className="poster-meta">
            {meta.map((part) => (
              <span key={String(part)}>{part}</span>
            ))}
            {watchedEpisodes ? <span className="poster-ep">EP {watchedEpisodes} watched</span> : null}
          </div>
        </div>
      </div>

      {open && position ? (
        <div
          className="preview"
          style={{ left: position.left, top: position.top }}
          onMouseEnter={keepOpen}
          onMouseLeave={scheduleClose}
          role="dialog"
          aria-label={`${title} preview`}
        >
          <div className="preview-head">
            <Cover src={anime.coverMedium ?? anime.cover} alt={title} className="preview-thumb" />
            <div className="preview-body">
              <span className="preview-title">{title}</span>
              <div className="preview-chips">
                {anime.score ? <span className="chip chip-outline">★ {Math.round(anime.score)}%</span> : null}
                {anime.format ? <span className="chip chip-sub">{formatLabel(anime.format)}</span> : null}
                {anime.episodes ? <span className="chip chip-outline">{anime.episodes} eps</span> : null}
                {anime.duration ? <span className="chip chip-outline">{minutesLabel(anime.duration)}</span> : null}
              </div>
              <span className="muted small">
                {[anime.seasonYear ?? anime.year, anime.status ? stateLabel(anime.status) : null].filter(Boolean).join(' · ')}
              </span>
            </div>
          </div>

          {detail?.description ? <p className="preview-desc">{detail.description}</p> : <p className="preview-desc muted">Loading synopsis…</p>}

          <div className="preview-chips">
            {(detail?.genres ?? anime.genres).slice(0, 4).map((genre) => (
              <Link key={genre} className="chip chip-outline" to={`/genre/${encodeURIComponent(genre)}`}>
                {genre}
              </Link>
            ))}
            {available > 0 ? <span className="chip chip-verified">Official source available</span> : <span className="chip chip-muted">No official source</span>}
          </div>

          {detail?.synonyms && detail.synonyms.length > 0 ? <p className="preview-alt">Also known as: {detail.synonyms.slice(0, 2).join(' · ')}</p> : null}

          <div className="preview-actions">
            {available > 0 ? (
              <Link className="btn btn-sm btn-primary" to={`/watch/${anime.id}/1`} onClick={() => setOpen(false)}>
                Watch EP 1
              </Link>
            ) : null}
            <Link className="btn btn-sm" to={`/anime/${anime.id}`} onClick={() => setOpen(false)}>
              Details
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function PosterGrid({
  items,
  layout = 'grid',
  progressFor,
  watchedFor,
}: {
  items: Anime[];
  layout?: 'grid' | 'dense' | 'list';
  progressFor?: (anime: Anime) => number | undefined;
  watchedFor?: (anime: Anime) => number | undefined;
}) {
  return (
    <div className={`poster-grid${layout === 'dense' ? ' dense' : ''}${layout === 'list' ? ' list' : ''}`}>
      {items.map((anime) => (
        <PosterCard
          key={anime.id}
          anime={anime}
          layout={layout}
          progressPercent={progressFor?.(anime)}
          watchedEpisodes={watchedFor?.(anime)}
        />
      ))}
    </div>
  );
}

export function SectionRow({
  title,
  link,
  items,
  loading,
  emptyLabel,
  progressFor,
}: {
  title: string;
  link?: string;
  items: Anime[];
  loading?: boolean;
  emptyLabel?: string;
  progressFor?: (anime: Anime) => number | undefined;
}) {
  const visible = useMemo(() => items.slice(0, 14), [items]);
  if (!loading && visible.length === 0) return null;
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        <span className="spacer" />
        {link ? (
          <Link className="section-link" to={link}>
            View all →
          </Link>
        ) : null}
      </div>
      {loading ? (
        <div className="poster-grid">
          {Array.from({ length: 6 }).map((_, index) => (
            <div className="skeleton-card" key={index}>
              <div className="skeleton" style={{ aspectRatio: '2 / 3' }} />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="muted small">{emptyLabel ?? 'Nothing here yet.'}</p>
      ) : (
        <PosterGrid items={visible} progressFor={progressFor} />
      )}
    </section>
  );
}

export function RankSidebar({
  items,
  title = 'Popular anime',
  link = '/popular',
  tab = 'Popularity',
}: {
  items: Anime[];
  title?: string;
  link?: string;
  tab?: string;
}) {
  if (!items.length) return null;
  const [first, ...rest] = items.slice(0, 10);
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
        <span className="chip chip-outline">{tab}</span>
      </div>
      <div className="panel-body">
        <Link className="rank-item is-first" to={`/anime/${first.id}`}>
          <span className="rank-num">1</span>
          <Cover src={first.cover} alt={first.title.display} className="rank-thumb" />
          <span className="rank-body">
            <span className="rank-title">{first.title.display}</span>
            <span className="rank-meta">
              {[formatLabel(first.format), episodeCountLabel(first.episodes), first.score ? `★ ${Math.round(first.score)}%` : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
        </Link>
        {rest.map((anime, index) => (
          <Link className="rank-item" key={anime.id} to={`/anime/${anime.id}`}>
            <span className="rank-num">{index + 2}</span>
            <Cover src={anime.coverMedium ?? anime.cover} alt={anime.title.display} className="rank-thumb" />
            <span className="rank-body">
              <span className="rank-title">{anime.title.display}</span>
              <span className="rank-meta">
                {[formatLabel(anime.format), episodeCountLabel(anime.episodes)].filter(Boolean).join(' · ')}
              </span>
            </span>
          </Link>
        ))}
        {link ? (
          <Link className="section-link" to={link}>
            See full ranking →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
