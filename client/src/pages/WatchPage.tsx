import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  apiAddToList,
  apiAnime,
  apiEpisodes,
  apiPlayback,
  apiProgress,
  apiRemoveFromList,
  apiReport,
  apiSaveProgress,
  apiVerifyPlayback,
  type Detail,
  type EpisodeListResponse,
  type PlaybackResponse,
  type PlaybackSource,
  type ProgressRow,
} from '../lib/api';
import { guestProgress, readPrefs, saveGuestProgress, writePrefs } from '../lib/guest';
import { clock, formatLabel, humanize, minutesLabel, playable, shortDate, stateLabel, stateTone } from '../lib/format';
import { useAuth } from '../state/auth';
import { Chip, Cover, ErrorState, StateBox, useDocumentTitle } from '../components/Bits';
import { Player } from '../components/Player';
import { EpisodeRail } from '../components/EpisodeRail';

export default function WatchPage() {
  const { id, episode } = useParams();
  const animeId = Number(id);
  const episodeNumber = Math.max(1, Number(episode) || 1);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [detail, setDetail] = useState<Detail | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeListResponse | null>(null);
  const [playback, setPlayback] = useState<PlaybackResponse | null>(null);
  const [selected, setSelected] = useState<PlaybackSource | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [playbackError, setPlaybackError] = useState<unknown>(null);
  const [startAt, setStartAt] = useState(0);
  const [theater, setTheater] = useState(false);
  const [lightsOff, setLightsOff] = useState(() => readPrefs().lightsOff);
  const [autoNext, setAutoNext] = useState(() => readPrefs().autoNext);
  const [autoplay, setAutoplay] = useState(() => readPrefs().autoplay);
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportState, setReportState] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const lastSaveRef = useRef(0);
  const lastPositionRef = useRef(0);

  useDocumentTitle(detail ? `${detail.title.display} — EP ${episodeNumber}` : 'Watch');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPlayback(null);
    setSelected(null);
    setPlaybackError(null);

    apiAnime(animeId)
      .then((data) => {
        if (cancelled) return;
        setDetail(data.anime);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    apiEpisodes(animeId)
      .then((data) => {
        if (!cancelled) setEpisodes(data);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [animeId]);

  useEffect(() => {
    let cancelled = false;
    apiPlayback(animeId, episodeNumber)
      .then((data) => {
        if (cancelled) return;
        setPlayback(data);
        setSelected(data.best);
        setPlaybackError(null);
        if (data.ok) {
          apiVerifyPlayback({ animeId, episodeNumber, state: 'verified-playable' }).catch(() => undefined);
        }
      })
      .catch((err) => {
        if (!cancelled) setPlaybackError(err);
      });
    return () => {
      cancelled = true;
    };
  }, [animeId, episodeNumber]);

  useEffect(() => {
    if (!user) {
      setRows(guestProgress());
      return;
    }
    apiProgress()
      .then((data) => setRows(data.items))
      .catch(() => setRows([]));
  }, [user]);

  useEffect(() => {
    const row = rows.find((item) => item.animeId === animeId && item.episodeNumber === episodeNumber);
    setStartAt(row && !row.completed && row.positionSeconds > 20 ? row.positionSeconds : 0);
  }, [animeId, episodeNumber, rows]);

  const persist = useCallback(
    (position: number, duration: number, completed = false) => {
      if (!detail) return;
      const payload = {
        animeId: detail.id,
        animeTitle: detail.title.display,
        animeCover: detail.cover,
        episodeNumber,
        positionSeconds: Math.round(position),
        durationSeconds: Math.round(duration),
        completed,
      };
      if (!user) {
        saveGuestProgress(payload);
        setSaved('Saved on this device');
        return;
      }
      apiSaveProgress(payload)
        .then(() => setSaved('Progress saved'))
        .catch(() => setSaved('Could not save progress'));
    },
    [detail, episodeNumber, user],
  );

  const handleProgress = useCallback(
    (position: number, duration: number) => {
      lastPositionRef.current = position;
      const now = Date.now();
      if (now - lastSaveRef.current < 15_000) return;
      lastSaveRef.current = now;
      if (position > 5 && duration > 0) persist(position, duration, position / duration > 0.92);
    },
    [persist],
  );

  const nextEpisode = useMemo(() => {
    const items = episodes?.items ?? [];
    const after = items.filter((item) => item.number > episodeNumber && playable(item.availability));
    return after[0] ?? null;
  }, [episodes, episodeNumber]);

  const handleEnded = useCallback(() => {
    persist(lastPositionRef.current, lastPositionRef.current, true);
    if (autoNext && nextEpisode) {
      navigate(`/watch/${animeId}/${nextEpisode.number}`);
    }
  }, [autoNext, animeId, navigate, nextEpisode, persist]);

  const watched = useMemo(() => new Set(rows.filter((row) => row.animeId === animeId && row.completed).map((row) => row.episodeNumber)), [rows, animeId]);
  const inProgress = useMemo(
    () => new Set(rows.filter((row) => row.animeId === animeId && !row.completed && row.positionSeconds > 15).map((row) => row.episodeNumber)),
    [rows, animeId],
  );

  async function toggleList(kind: 'watchlist' | 'favorites') {
    if (!detail) return;
    if (!user) {
      navigate('/login', { state: { from: window.location.pathname } });
      return;
    }
    try {
      await apiAddToList(kind, {
        animeId: detail.id,
        animeTitle: detail.title.display,
        animeCover: detail.cover,
        format: detail.format,
        year: detail.year,
        episodes: detail.episodes,
        score: detail.meanScore,
      });
      setSaved(`Added to ${kind}`);
    } catch {
      setSaved(`Could not update ${kind}`);
    }
  }

  async function removeFromList(kind: 'watchlist' | 'favorites') {
    if (!detail) return;
    try {
      await apiRemoveFromList(kind, detail.id);
      setSaved(`Removed from ${kind}`);
    } catch {
      setSaved(`Could not update ${kind}`);
    }
  }

  function toggle(patch: 'theater' | 'lights' | 'autoNext' | 'autoplay') {
    if (patch === 'theater') setTheater((value) => !value);
    if (patch === 'lights') {
      const next = !lightsOff;
      setLightsOff(next);
      writePrefs({ lightsOff: next });
    }
    if (patch === 'autoNext') {
      const next = !autoNext;
      setAutoNext(next);
      writePrefs({ autoNext: next });
    }
    if (patch === 'autoplay') {
      const next = !autoplay;
      setAutoplay(next);
      writePrefs({ autoplay: next });
    }
  }

  async function submitReport(reason: string) {
    if (!detail) return;
    try {
      await apiReport({
        animeId: detail.id,
        episodeNumber,
        providerId: selected?.providerId ?? playback?.best?.providerId ?? null,
        reason,
      });
      setReportState('Thanks — the report was recorded for the administrator.');
      setReportOpen(false);
    } catch {
      setReportState('The report could not be sent. Please try again.');
    }
  }

  if (error) {
    return (
      <div className="page">
        <ErrorState error={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (loading || !detail) {
    return (
      <div className="page page-wide">
        <div className="skeleton" style={{ height: 420, borderRadius: 6 }} />
      </div>
    );
  }

  const active = selected ?? playback?.best ?? null;
  const related = [...detail.relations.map((relation) => ({ anime: relation.anime, label: humanize(relation.relationType) }))].slice(0, 12);
  const recommendations = detail.recommendations.map((anime) => ({ anime, label: 'Recommended' }));
  const sidebar = [...related, ...recommendations].slice(0, 14);

  return (
    <div className={`page page-wide watch-page${lightsOff ? ' lights-off' : ''}${theater ? ' is-theater' : ''}`}>
      <div className={`watch-layout${theater ? ' theater' : ''}`}>
        <aside className="ep-rail" aria-label="Episodes">
          <div className="panel-head">
            <h3>Episodes</h3>
            <span className="chip chip-outline">{episodes?.availableEpisodes ?? 0} ready</span>
          </div>
          {episodes ? (
            <EpisodeRail
              animeId={detail.id}
              items={episodes.items}
              current={episodeNumber}
              totalEpisodes={episodes.totalEpisodes}
              watched={watched}
              inProgress={inProgress}
              availableEpisodes={episodes.availableEpisodes}
            />
          ) : (
            <div className="skeleton" style={{ height: 220 }} />
          )}
          {episodes?.episodeTitleNotice ? <p className="muted small">{episodes.episodeTitleNotice}</p> : null}
        </aside>

        <div className="watch-center">
          <div className="player-shell">
            {active ? (
              <Player
                key={`${active.providerId}-${episodeNumber}`}
                source={active}
                episodeNumber={episodeNumber}
                autoPlay={autoplay}
                startAt={startAt}
                onProgress={handleProgress}
                onEnded={handleEnded}
              />
            ) : (
              <div className="player-unavailable">
                <StateBox title={playbackError ? 'Playback could not be resolved' : 'No verified official stream for this episode'}>
                  {playbackError
                    ? 'The resolver could not be reached. Check the provider status on the diagnostics page or retry in a moment.'
                    : 'aniyashi only plays episodes from rights-holder channels that permit embedding. This episode has no such source, so no fake player is shown.'}
                </StateBox>
                <div className="player-unavailable-actions">
                  <Link className="btn" to={`/anime/${detail.id}`}>
                    Back to details
                  </Link>
                  {nextEpisode ? (
                    <Link className="btn btn-primary" to={`/watch/${detail.id}/${nextEpisode.number}`}>
                      Watch EP {nextEpisode.number} (available)
                    </Link>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          <div className="toolbar" role="toolbar" aria-label="Playback options">
            <button className={`btn btn-sm${theater ? ' is-on' : ''}`} type="button" onClick={() => toggle('theater')}>
              Expand
            </button>
            <button className={`btn btn-sm${autoplay ? ' is-on' : ''}`} type="button" onClick={() => toggle('autoplay')}>
              Auto play
            </button>
            <button className={`btn btn-sm${autoNext ? ' is-on' : ''}`} type="button" onClick={() => toggle('autoNext')}>
              Auto next
            </button>
            <button className={`btn btn-sm${lightsOff ? ' is-on' : ''}`} type="button" onClick={() => toggle('lights')}>
              Lights off
            </button>
            <span className="toolbar-sep" />
            <Link className="btn btn-sm" to={`/watch/${detail.id}/${Math.max(1, episodeNumber - 1)}`}>
              ← Prev
            </Link>
            <Link className="btn btn-sm" to={`/watch/${detail.id}/${episodeNumber + 1}`}>
              Next →
            </Link>
            <span className="toolbar-sep" />
            <button className="btn btn-sm" type="button" onClick={() => toggleList('watchlist')}>
              + List
            </button>
            <button className="btn btn-sm" type="button" onClick={() => toggleList('favorites')}>
              ♥ Favorite
            </button>
            <button
              className="btn btn-sm"
              type="button"
              onClick={() => {
                if (navigator.share) navigator.share({ title: detail.title.display, url: window.location.href }).catch(() => undefined);
                else navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
              }}
            >
              Share
            </button>
            <button className="btn btn-sm" type="button" onClick={() => setReportOpen((value) => !value)}>
              Report
            </button>
          </div>

          {reportOpen ? (
            <div className="source-panel">
              <div>
                <strong>Report a playback problem</strong>
                <p className="muted small">Reports go to the administrator and are stored with the episode and provider.</p>
              </div>
              <div className="filter-actions">
                {['Wrong episode', 'Will not play', 'Missing audio/subtitles', 'Other'].map((reason) => (
                  <button key={reason} className="btn btn-sm" type="button" onClick={() => submitReport(reason)}>
                    {reason}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {reportState ? <div className="alert alert-info">{reportState}</div> : null}
          {saved ? <div className="alert alert-ok">{saved}</div> : null}

          <div className="source-panel">
            <div>
              <strong>You&apos;re watching Episode {episodeNumber}.</strong>
              <p className="muted small">
                {active
                  ? `${active.providerName}${active.channel ? ` · ${active.channel}` : ''}${active.rightsNote ? ` · ${active.rightsNote}` : ''}`
                  : 'If playback fails, another verified official source may be available for other episodes.'}
              </p>
              {active?.verifiedAt ? <p className="muted small">Embed verified {shortDate(active.verifiedAt)}</p> : null}
            </div>
            <div className="source-options">
              {playback?.sources.length ? (
                playback.sources.map((source) => (
                  <button
                    key={`${source.providerId}-${source.embedId ?? source.url}`}
                    type="button"
                    className={`btn btn-sm${active && source.providerId === active.providerId ? ' is-on' : ''}`}
                    onClick={() => setSelected(source)}
                    title={source.availabilityDetail ?? source.rightsNote ?? undefined}
                  >
                    {source.audioLanguage ? source.audioLanguage.toUpperCase() : 'SOURCE'} · {source.providerName}
                  </button>
                ))
              ) : (
                <span className="chip chip-muted">No source available</span>
              )}
            </div>
          </div>

          <div className="watch-info">
            <Cover src={detail.cover} alt={detail.title.display} className="watch-info-poster" />
            <div>
              <h1>
                {detail.title.display} <span className="muted">— Episode {episodeNumber}</span>
              </h1>
              <div className="detail-meta">
                <Chip>{formatLabel(detail.format)}</Chip>
                {detail.year ? <Chip>{detail.year}</Chip> : null}
                {detail.duration ? <Chip>{minutesLabel(detail.duration)}</Chip> : null}
                {detail.studio ? <Chip>{detail.studio}</Chip> : null}
                {detail.status ? <Chip>{humanize(detail.status)}</Chip> : null}
              </div>
              {detail.description ? <p className="detail-synopsis is-clamped">{detail.description}</p> : null}
              <div className="genre-row">
                {detail.genres.slice(0, 8).map((genre) => (
                  <Link key={genre} className="chip chip-outline" to={`/genre/${encodeURIComponent(genre)}`}>
                    {genre}
                  </Link>
                ))}
              </div>
              <div className="detail-actions">
                <Link className="btn" to={`/anime/${detail.id}`}>
                  View details
                </Link>
                <button className="btn" type="button" onClick={() => toggleList('watchlist')}>
                  + Watchlist
                </button>
                <button className="btn" type="button" onClick={() => removeFromList('watchlist')}>
                  Remove from list
                </button>
              </div>
            </div>
          </div>

          {playback && playback.attempts.length > 0 && !playback.ok ? (
            <details className="panel">
              <summary className="panel-head">
                <h3>Resolution details</h3>
              </summary>
              <div className="panel-body">
                <ul className="plain-list">
                  {playback.attempts.map((attempt, index) => (
                    <li key={`${attempt.providerId}-${index}`}>
                      <strong>{attempt.providerName ?? attempt.providerId}</strong>: {attempt.state} — {attempt.reason}
                      {attempt.detail ? <span className="muted small"> ({attempt.detail})</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          ) : null}

          {episodes ? (
            <p className="muted small">
              {episodes.availableEpisodes} of {episodes.totalEpisodes ?? '—'} episodes have a verified official source. Episode titles:{' '}
              {episodes.episodeTitleSource}.
            </p>
          ) : null}
        </div>

        <aside className="watch-side" aria-label="Related anime">
          <div className="panel">
            <div className="panel-head">
              <h3>Related anime</h3>
            </div>
            <div className="panel-body">
              {sidebar.length === 0 ? (
                <p className="muted small">No related titles were supplied by the metadata provider.</p>
              ) : (
                sidebar.map(({ anime, label }) => (
                  <Link key={`${label}-${anime.id}`} className="rank-item" to={`/anime/${anime.id}`}>
                    <Cover src={anime.coverMedium ?? anime.cover} alt={anime.title.display} className="rank-thumb" />
                    <span className="rank-body">
                      <span className="rank-title">{anime.title.display}</span>
                      <span className="rank-meta">
                        {label} · {formatLabel(anime.format)}
                        {anime.episodes ? ` · ${anime.episodes} ep` : ''}
                      </span>
                      {anime.playback?.availableEpisodes ? (
                        <span className={`chip ${stateTone('verified-playable')}`}>{stateLabel('verified-playable')}</span>
                      ) : null}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
