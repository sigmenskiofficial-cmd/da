import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiList, apiMeta, apiSearch, type Anime, type MetaResponse, type PageResult } from '../lib/api';
import { readPrefs, writePrefs } from '../lib/guest';
import { PosterGrid, RankSidebar } from '../components/PosterCard';
import { EmptyState, ErrorState, PageHead, Pagination, SkeletonGrid, useDocumentTitle } from '../components/Bits';

type Filters = {
  q: string;
  genre: string;
  year: string;
  season: string;
  format: string;
  status: string;
  minScore: string;
  sort: string;
  page: string;
};

const EMPTY_FILTERS: Filters = { q: '', genre: '', year: '', season: '', format: '', status: '', minScore: '', sort: '', page: '1' };

export default function BrowsePage({ lockedGenre }: { lockedGenre?: string }) {
  const [params, setParams] = useSearchParams();
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [result, setResult] = useState<PageResult | null>(null);
  const [popular, setPopular] = useState<Anime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [layout, setLayout] = useState(() => readPrefs().layout);

  const filters = useMemo<Filters>(() => {
    const fromUrl: Filters = { ...EMPTY_FILTERS };
    (Object.keys(EMPTY_FILTERS) as (keyof Filters)[]).forEach((key) => {
      const value = params.get(key);
      if (value) fromUrl[key] = value;
    });
    if (lockedGenre) fromUrl.genre = lockedGenre;
    return fromUrl;
  }, [lockedGenre, params]);

  useDocumentTitle(lockedGenre ? `${lockedGenre} anime` : filters.q ? `Search: ${filters.q}` : 'Browse anime');

  useEffect(() => {
    apiMeta()
      .then(setMeta)
      .catch(() => setMeta(null));
    apiList('popular', { perPage: 10 })
      .then((data) => setPopular(data.items))
      .catch(() => setPopular([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const page = Number(filters.page) || 1;
    const request = filters.q
      ? apiSearch({
          q: filters.q,
          page,
          perPage: 30,
          genres: filters.genre || null,
          year: filters.year || null,
          season: filters.season || null,
          format: filters.format || null,
          status: filters.status || null,
          minScore: filters.minScore || null,
          sort: filters.sort || null,
        })
      : filters.genre
        ? apiList('genre', {
            genre: filters.genre,
            page,
            perPage: 30,
            year: filters.year || null,
            season: filters.season || null,
            format: filters.format || null,
            status: filters.status || null,
            minScore: filters.minScore || null,
            sort: filters.sort || null,
          })
        : apiSearch({
            page,
            perPage: 30,
            genres: filters.genre || null,
            year: filters.year || null,
            season: filters.season || null,
            format: filters.format || null,
            status: filters.status || null,
            minScore: filters.minScore || null,
            sort: filters.sort || null,
          });

    request
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
  }, [filters]);

  function update(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    if (!('page' in patch)) next.page = '1';
    const search = new URLSearchParams();
    (Object.keys(next) as (keyof Filters)[]).forEach((key) => {
      if (next[key] && next[key] !== '1') search.set(key, next[key]);
      else if (next[key] && key === 'page') search.set(key, next[key]);
    });
    setParams(search, { replace: true });
  }

  function reset() {
    setParams(new URLSearchParams(), { replace: true });
  }

  const genreOptions = (meta?.genres ?? []).map((genre) => (typeof genre === 'string' ? genre : genre.name));

  return (
    <div className="page page-wide">
      <div className="layout-main-side">
        <div>
          <PageHead title={lockedGenre ? `${lockedGenre} anime` : filters.q ? `Results for “${filters.q}”` : 'Browse anime'}>
            <div className="layout-switch" role="group" aria-label="Layout">
              {(['grid', 'dense', 'list'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`btn btn-sm${layout === mode ? ' is-on' : ''}`}
                  onClick={() => {
                    setLayout(mode);
                    writePrefs({ layout: mode });
                  }}
                >
                  {mode === 'grid' ? 'Grid' : mode === 'dense' ? 'Compact' : 'List'}
                </button>
              ))}
            </div>
          </PageHead>

          <div className="filter-bar">
            <div className="filter-row">
              <input
                className="input"
                type="search"
                placeholder="Search titles, English, Japanese or romaji"
                value={filters.q}
                aria-label="Search titles"
                onChange={(event) => update({ q: event.target.value })}
              />
              <select className="select" value={filters.genre} aria-label="Genre" onChange={(event) => update({ genre: event.target.value })}>
                <option value="">All genres</option>
                {genreOptions.map((genre) => (
                  <option key={genre} value={genre}>
                    {genre}
                  </option>
                ))}
              </select>
              <select className="select" value={filters.format} aria-label="Format" onChange={(event) => update({ format: event.target.value })}>
                <option value="">All formats</option>
                {(meta?.formats ?? []).map((format) => (
                  <option key={format} value={format}>
                    {format.replace('_', ' ')}
                  </option>
                ))}
              </select>
              <select className="select" value={filters.status} aria-label="Airing status" onChange={(event) => update({ status: event.target.value })}>
                <option value="">Any status</option>
                {(meta?.statuses ?? []).map((status) => (
                  <option key={status} value={status}>
                    {status.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="filter-row">
              <select className="select" value={filters.season} aria-label="Season" onChange={(event) => update({ season: event.target.value })}>
                <option value="">Any season</option>
                {(meta?.seasons ?? []).map((season) => (
                  <option key={season} value={season}>
                    {season}
                  </option>
                ))}
              </select>
              <select className="select" value={filters.year} aria-label="Year" onChange={(event) => update({ year: event.target.value })}>
                <option value="">Any year</option>
                {(meta?.years ?? []).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <select className="select" value={filters.minScore} aria-label="Minimum score" onChange={(event) => update({ minScore: event.target.value })}>
                <option value="">Any score</option>
                {[60, 70, 75, 80, 85, 90].map((score) => (
                  <option key={score} value={score}>
                    {score}% and above
                  </option>
                ))}
              </select>
              <select className="select" value={filters.sort} aria-label="Sort by" onChange={(event) => update({ sort: event.target.value })}>
                <option value="">Best match</option>
                {(meta?.sorts ?? []).map((sort) => (
                  <option key={sort} value={sort}>
                    {sort.replace(/_/g, ' ').toLowerCase()}
                  </option>
                ))}
              </select>
              <div className="filter-actions">
                <button className="btn btn-sm btn-primary" type="button" onClick={() => update({})}>
                  Apply
                </button>
                <button className="btn btn-sm" type="button" onClick={reset}>
                  Reset
                </button>
              </div>
            </div>
          </div>

          <div className="result-count">
            {loading ? 'Loading live results…' : result ? `${result.items.length} results on this page` : ''}
            {result?.total ? ` · ${result.total.toLocaleString()} matching titles in the live catalog` : ''}
            {meta?.metadata.state && meta.metadata.state !== 'ok' ? (
              <span className="chip chip-warn" title={meta.metadata.detail}>
                metadata provider: {meta.metadata.state}
              </span>
            ) : null}
          </div>

          {error ? <ErrorState error={error} onRetry={() => window.location.reload()} /> : null}

          {loading ? (
            <SkeletonGrid count={18} />
          ) : result && result.items.length > 0 ? (
            <>
              <PosterGrid items={result.items} layout={layout} />
              <Pagination
                page={result.page}
                lastPage={result.lastPage}
                hasNextPage={result.hasNextPage}
                onChange={(page) => update({ page: String(page) })}
              />
            </>
          ) : (
            !error && (
              <EmptyState title="No anime matched those filters">
                Try removing a filter, or search a different title. The catalog is queried live from AniList, so new titles appear without a
                redeploy.
              </EmptyState>
            )
          )}
        </div>

        <aside className="home-side">
          <RankSidebar items={popular} title="Popular right now" link="/popular" />
        </aside>
      </div>
    </div>
  );
}
