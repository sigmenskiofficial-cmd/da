import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  apiContinueWatching,
  apiDeleteProgress,
  apiListRows,
  apiProgress,
  type ListRow,
  type ProgressRow,
} from '../lib/api';
import { guestProgress, removeGuestProgress } from '../lib/guest';
import { clock, episodeCountLabel, formatLabel, timeAgo } from '../lib/format';
import { useAuth } from '../state/auth';
import { Cover, EmptyState, ErrorState, PageHead, SkeletonGrid, useDocumentTitle } from '../components/Bits';

type Kind = 'watchlist' | 'favorites' | 'history' | 'continue-watching';

const TITLES: Record<Kind, { title: string; blurb: string }> = {
  watchlist: { title: 'Watchlist', blurb: 'Titles you saved to watch later.' },
  favorites: { title: 'Favorites', blurb: 'Your favorite anime.' },
  history: { title: 'Watch history', blurb: 'Every episode you have played, with real playback progress.' },
  'continue-watching': { title: 'Continue watching', blurb: 'Pick up exactly where you stopped.' },
};

export default function LibraryPage({ kind }: { kind: Kind }) {
  const config = TITLES[kind];
  const { user } = useAuth();
  useDocumentTitle(config.title);
  const [lists, setLists] = useState<ListRow[]>([]);
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        if (kind === 'watchlist' || kind === 'favorites') {
          if (!user) {
            setLists([]);
            return;
          }
          const data = await apiListRows(kind);
          if (!cancelled) setLists(data.items);
        } else if (!user) {
          const items = guestProgress();
          setRows(kind === 'continue-watching' ? items.filter((row) => !row.completed) : items);
        } else {
          const data = kind === 'continue-watching' ? await apiContinueWatching() : await apiProgress();
          if (!cancelled) setRows(data.items);
        }
        if (!cancelled) setError(null);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [kind, user]);

  async function remove(row: ProgressRow) {
    if (!user) removeGuestProgress(row.animeId, row.episodeNumber);
    else await apiDeleteProgress(row.animeId, row.episodeNumber).catch(() => undefined);
    setRows((items) => items.filter((item) => !(item.animeId === row.animeId && item.episodeNumber === row.episodeNumber)));
  }

  const signedOut = (kind === 'watchlist' || kind === 'favorites') && !user;

  return (
    <div className="page page-wide">
      <PageHead title={config.title}>
        <span className="muted small">{config.blurb}</span>
      </PageHead>

      {signedOut ? (
        <EmptyState title="Sign in to use your lists">
          Watchlists and favorites are stored on your account. <Link to="/login">Sign in</Link> or <Link to="/register">create an account</Link>. Progress
          for guests is kept on this device only.
        </EmptyState>
      ) : null}

      {error ? <ErrorState error={error} onRetry={() => window.location.reload()} /> : null}
      {loading && !signedOut ? <SkeletonGrid count={10} /> : null}

      {!loading && !signedOut && (kind === 'watchlist' || kind === 'favorites') ? (
        lists.length === 0 ? (
          <EmptyState title={`Nothing in your ${config.title.toLowerCase()} yet`}>
            Add anime from any poster or detail page. <Link to="/browse">Browse the catalog</Link>.
          </EmptyState>
        ) : (
          <div className="poster-grid">
            {lists.map((row) => (
              <Link key={row.animeId} className="poster-card" to={`/anime/${row.animeId}`}>
                <div className="poster-frame">
                  <Cover src={row.animeCover} alt={row.animeTitle ?? `Anime ${row.animeId}`} />
                </div>
                <div className="poster-body">
                  <span className="poster-title">{row.animeTitle}</span>
                  <span className="poster-meta">
                    {[formatLabel(row.format), row.year, episodeCountLabel(row.episodes)].filter(Boolean).join(' · ')}
                  </span>
                  <span className="poster-meta">Added {timeAgo(row.addedAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )
      ) : null}

      {!loading && !signedOut && (kind === 'history' || kind === 'continue-watching') ? (
        rows.length === 0 ? (
          <EmptyState title="No playback history yet">
            History is created only by real playback. <Link to="/browse">Find something to watch</Link>.
          </EmptyState>
        ) : (
          <div className="continue-grid">
            {rows.map((row) => (
              <article className="continue-card" key={`${row.animeId}-${row.episodeNumber}`}>
                <Link to={`/watch/${row.animeId}/${row.episodeNumber}`} className="continue-thumb">
                  <Cover src={row.animeCover} alt={row.animeTitle ?? 'Anime'} />
                  <span className="continue-progress" style={{ width: `${Math.min(100, Math.round(row.percent))}%` }} />
                </Link>
                <div className="continue-body">
                  <Link className="continue-title" to={`/watch/${row.animeId}/${row.episodeNumber}`}>
                    {row.animeTitle ?? `Anime ${row.animeId}`}
                  </Link>
                  <span className="poster-meta">
                    EP {row.episodeNumber} — {clock(row.positionSeconds)} / {clock(row.durationSeconds)}
                  </span>
                  <span className="poster-meta">
                    {row.completed ? 'Completed' : `${Math.round(row.percent)}% watched`} · {timeAgo(row.updatedAt)}
                  </span>
                  <div className="continue-actions">
                    <Link className="btn btn-sm btn-primary" to={`/watch/${row.animeId}/${row.episodeNumber}`}>
                      {row.completed ? 'Rewatch' : 'Resume'}
                    </Link>
                    <button className="btn btn-sm" type="button" onClick={() => remove(row)}>
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )
      ) : null}

      {!user && (kind === 'history' || kind === 'continue-watching') ? (
        <p className="muted small">Guest progress is stored on this device. Sign in to keep it across devices.</p>
      ) : null}
    </div>
  );
}
