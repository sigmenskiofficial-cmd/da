import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiList, type Anime } from '../lib/api';
import { PosterGrid, RankSidebar } from '../components/PosterCard';
import { EmptyState, ErrorState, PageHead, Pagination, SkeletonGrid, useDocumentTitle } from '../components/Bits';

const PRESETS: Record<string, { title: string; kind: string; blurb: string }> = {
  trending: { title: 'Trending now', kind: 'trending', blurb: 'Titles gaining the most attention across the anime community right now.' },
  popular: { title: 'Popular anime', kind: 'popular', blurb: 'All-time popularity, straight from live metadata.' },
  'top-rated': { title: 'Top rated', kind: 'top-rated', blurb: 'The highest scoring anime in the catalog.' },
  upcoming: { title: 'Upcoming anime', kind: 'upcoming', blurb: 'Announced titles that have not aired yet.' },
  'recently-updated': { title: 'Recently updated', kind: 'recent', blurb: 'Titles with the most recent metadata activity.' },
  'latest-episodes': { title: 'Latest episodes', kind: 'recent', blurb: 'Recently broadcast episodes. Broadcast does not imply an available stream.' },
  movies: { title: 'Anime movies', kind: 'movies', blurb: 'Feature films in the catalog.' },
  seasonal: { title: 'This season', kind: 'seasonal', blurb: 'Currently airing season.' },
  airing: { title: 'Currently airing', kind: 'airing', blurb: 'Shows releasing episodes right now.' },
  schedule: { title: 'Schedule', kind: 'airing', blurb: 'Use the schedule page for broadcast times.' },
  'hidden-gems': { title: 'Hidden gems', kind: 'hidden-gems', blurb: 'Highly rated titles with lower popularity.' },
};

export default function ListPage({ preset }: { preset: string }) {
  const config = PRESETS[preset] ?? PRESETS.trending;
  const { page: pageParam } = useParams();
  const navigate = useNavigate();
  const page = Math.max(1, Number(pageParam) || 1);
  const [result, setResult] = useState<{ items: Anime[]; page: number; lastPage: number | null; hasNextPage: boolean; total: number | null } | null>(null);
  const [side, setSide] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useDocumentTitle(config.title);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiList(config.kind, { page, perPage: 40 })
      .then((data) => {
        if (cancelled) return;
        setResult(data);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [config.kind, page]);

  useEffect(() => {
    apiList('popular', { perPage: 10 })
      .then((data) => setSide(data.items))
      .catch(() => setSide([]));
  }, []);

  return (
    <div className="page page-wide">
      <div className="layout-main-side">
        <div>
          <PageHead title={config.title}>
            <span className="muted small">{config.blurb}</span>
          </PageHead>

          {error ? <ErrorState error={error} onRetry={() => window.location.reload()} /> : null}
          {loading ? (
            <SkeletonGrid count={18} />
          ) : result && result.items.length > 0 ? (
            <>
              <PosterGrid items={result.items} />
              <Pagination
                page={result.page}
                lastPage={result.lastPage}
                hasNextPage={result.hasNextPage}
                onChange={(next) => navigate(next === 1 ? `/${preset}` : `/${preset}/${next}`)}
              />
            </>
          ) : (
            !error && (
              <EmptyState title="Nothing to show here">
                The metadata provider returned no titles for this list right now. <Link to="/browse">Browse the full catalog</Link>.
              </EmptyState>
            )
          )}
        </div>
        <aside className="home-side">
          <RankSidebar items={side} title="Popular right now" link="/popular" />
        </aside>
      </div>
    </div>
  );
}
