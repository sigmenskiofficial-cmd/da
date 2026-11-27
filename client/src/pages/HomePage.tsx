import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  apiContinueWatching,
  apiList,
  apiSchedule,
  apiSources,
  type Anime,
  type ProgressRow,
  type SourceSummary,
} from '../lib/api';
import { guestContinueWatching } from '../lib/guest';
import { clock, dayTime, episodeCountLabel, formatLabel, playable, shortDate } from '../lib/format';
import { useAuth } from '../state/auth';
import { Hero } from '../components/Hero';
import { RankSidebar, SectionRow } from '../components/PosterCard';
import { Cover, ErrorState, SkeletonGrid, useDocumentTitle } from '../components/Bits';

type Lists = {
  trending: Anime[];
  seasonal: Anime[];
  topRated: Anime[];
  upcoming: Anime[];
  movies: Anime[];
  airing: Anime[];
  popular: Anime[];
  recent: Anime[];
};

const EMPTY_LISTS: Lists = {
  trending: [],
  seasonal: [],
  topRated: [],
  upcoming: [],
  movies: [],
  airing: [],
  popular: [],
  recent: [],
};

export default function HomePage() {
  useDocumentTitle('Home');
  const { user } = useAuth();
  const [lists, setLists] = useState<Lists>(EMPTY_LISTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [sources, setSources] = useState<SourceSummary | null>(null);
  const [schedule, setSchedule] = useState<{ id: number; airingAt: number; episode: number; anime: Anime }[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      apiList('trending', { perPage: 20 }),
      apiList('seasonal', { perPage: 20 }),
      apiList('top-rated', { perPage: 20 }),
      apiList('upcoming', { perPage: 20 }),
      apiList('movies', { perPage: 20 }),
      apiList('airing', { perPage: 20 }),
      apiList('popular', { perPage: 12 }),
      apiList('recent', { perPage: 20 }),
    ])
      .then(([trending, seasonal, topRated, upcoming, movies, airing, popular, recent]) => {
        if (cancelled) return;
        setLists({
          trending: trending.items,
          seasonal: seasonal.items,
          topRated: topRated.items,
          upcoming: upcoming.items,
          movies: movies.items,
          airing: airing.items,
          popular: popular.items,
          recent: recent.items,
        });
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    apiSources()
      .then((data) => {
        if (!cancelled) setSources(data);
      })
      .catch(() => undefined);

    apiSchedule({})
      .then((data) => {
        if (!cancelled) setSchedule(data.items);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setProgress(guestContinueWatching());
      return;
    }
    apiContinueWatching()
      .then((data) => setProgress(data.items))
      .catch(() => setProgress([]));
  }, [user]);

  if (error) {
    return (
      <div className="page">
        <ErrorState error={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  const airingToday = schedule.filter((item) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return item.airingAt * 1000 >= start.getTime() && item.airingAt * 1000 <= start.getTime() + 86_400_000;
  });

  return (
    <div className="page page-wide">
      <div className="home-grid">
        <div>
          <Hero items={lists.trending} loading={loading} />

          {progress.length > 0 ? (
            <section className="section">
              <div className="section-head">
                <h2>Continue watching</h2>
                <span className="spacer" />
                <Link className="section-link" to="/continue-watching">
                  View all →
                </Link>
              </div>
              <div className="continue-grid">
                {progress.slice(0, 6).map((row) => (
                  <Link className="continue-card" key={`${row.animeId}-${row.episodeNumber}`} to={`/watch/${row.animeId}/${row.episodeNumber}`}>
                    <Cover src={row.animeCover} alt={row.animeTitle ?? 'Anime'} className="continue-thumb" />
                    <span className="continue-body">
                      <strong>{row.animeTitle ?? `Anime #${row.animeId}`}</strong>
                      <em>
                        EP {row.episodeNumber} — {clock(row.positionSeconds)} / {clock(row.durationSeconds)}
                      </em>
                      <span className="poster-progress">
                        <i style={{ width: `${Math.max(2, row.percent)}%` }} />
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {sources && sources.series.length > 0 ? (
            <section className="section">
              <div className="section-head">
                <h2>Available to watch right now</h2>
                <span className="spacer" />
                <span className="chip chip-verified">{sources.episodeCount} official episodes</span>
              </div>
              <div className="continue-grid">
                {sources.series.map((series) => (
                  <Link
                    className="continue-card"
                    key={series.id}
                    to={series.anilistId ? `/anime/${series.anilistId}` : '/browse'}
                  >
                    <span className="continue-body">
                      <strong>{series.title}</strong>
                      <em>
                        {series.episodes} {series.episodes === 1 ? 'episode' : 'episodes'}
                        {series.languages.length ? ` · ${series.languages.join(', ')}` : ''}
                      </em>
                      <span className="muted small">{series.channel}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <SectionRow title="Trending now" link="/trending" items={lists.trending} loading={loading} />
          <SectionRow title="Popular this season" link="/seasonal" items={lists.seasonal} loading={loading} />
          <SectionRow title="Currently airing" link="/seasonal" items={lists.airing} loading={loading} />
          <SectionRow title="Top rated" link="/top-rated" items={lists.topRated} loading={loading} />
          <SectionRow title="Anime movies" link="/movies" items={lists.movies} loading={loading} />
          <SectionRow title="Recently updated" link="/recently-updated" items={lists.recent} loading={loading} />
          <SectionRow title="Upcoming anime" link="/upcoming" items={lists.upcoming} loading={loading} />

          {airingToday.length > 0 ? (
            <section className="section">
              <div className="section-head">
                <h2>Airing today</h2>
                <span className="spacer" />
                <Link className="section-link" to="/schedule">
                  Full schedule →
                </Link>
              </div>
              <div className="latest-strip">
                {airingToday.slice(0, 8).map((item) => (
                  <Link key={`${item.id}-${item.episode}`} to={`/anime/${item.id}`} className="latest-item">
                    <Cover src={item.anime.coverMedium ?? item.anime.cover} alt={item.anime.title.display} className="latest-thumb" />
                    <span>
                      <strong>{item.anime.title.display}</strong>
                      <em>
                        EP {item.episode} · {dayTime(item.airingAt * 1000)}
                      </em>
                      <span className="muted small">Broadcast time — a stream is not implied.</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {loading ? <SkeletonGrid count={6} /> : null}
        </div>

        <aside className="home-side">
          <RankSidebar items={lists.popular} title="Most popular" link="/popular" />
          <div className="panel">
            <div className="panel-head">
              <h3>How playback works</h3>
            </div>
            <div className="panel-body">
              <p className="muted small">
                aniyashi plays episodes only from official publisher channels (for example TMS Entertainment or GundamInfo) and verifies every
                embed before it appears. Episodes without a verified official upload are labelled as unavailable instead of being faked.
              </p>
              <Link className="section-link" to="/copyright">
                Source and rights details →
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
