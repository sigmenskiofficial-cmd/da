import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  apiAddToList,
  apiAnime,
  apiEpisodes,
  apiRemoveFromList,
  apiSaveProgress,
  type Detail,
  type EpisodeListResponse,
} from '../lib/api';
import { guestProgress, saveGuestProgress } from '../lib/guest';
import { episodeCountLabel, formatLabel, humanize, minutesLabel, playable, shortDate, stateLabel, stateTone } from '../lib/format';
import { useAuth } from '../state/auth';
import { BackLink, Chip, Cover, EmptyState, ErrorState, ScoreBadge, StateBox, useDocumentTitle } from '../components/Bits';
import { PosterCard } from '../components/PosterCard';

export default function DetailPage() {
  const { id } = useParams();
  const animeId = Number(id);
  const navigate = useNavigate();
  const { user } = useAuth();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [playback, setPlayback] = useState<any>(null);
  const [episodes, setEpisodes] = useState<EpisodeListResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [resumeAt, setResumeAt] = useState<{ episodeNumber: number; positionSeconds: number } | null>(null);

  useDocumentTitle(detail ? detail.title.display : 'Anime');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    setEpisodes(null);
    setPlayback(null);
    setError(null);

    apiAnime(animeId)
      .then((data) => {
        if (cancelled) return;
        setDetail(data.anime);
        setPlayback(data.playback);
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
    const rows = guestProgress();
    const mine = rows
      .filter((row) => row.animeId === animeId && !row.completed)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    setResumeAt(mine[0] ? { episodeNumber: mine[0].episodeNumber, positionSeconds: mine[0].positionSeconds } : null);
  }, [animeId]);

  const firstAvailable = useMemo(() => {
    const items = episodes?.items ?? [];
    const ready = items.find((item) => playable(item.availability));
    return ready?.number ?? null;
  }, [episodes]);

  async function addToList(kind: 'watchlist' | 'favorites') {
    if (!detail) return;
    if (!user) {
      navigate('/login', { state: { from: `/anime/${detail.id}` } });
      return;
    }
    setBusy(true);
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
    } catch {
      /* surfaced through the toast-less UI: keep the page usable */
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="page">
        <BackLink />
        <ErrorState error={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (loading || !detail) {
    return (
      <div className="page">
        <div className="skeleton" style={{ height: 220, borderRadius: 6 }} />
        <div className="detail-hero" style={{ marginTop: 16 }}>
          <div className="skeleton" style={{ width: 210, aspectRatio: '2 / 3', borderRadius: 5 }} />
          <div style={{ flex: 1, display: 'grid', gap: 10 }}>
            <div className="skeleton" style={{ height: 30, width: '55%' }} />
            <div className="skeleton" style={{ height: 14, width: '35%' }} />
            <div className="skeleton" style={{ height: 90 }} />
          </div>
        </div>
      </div>
    );
  }

  const description = detail.description ?? '';
  const longText = description.length > 420;

  return (
    <div className="page page-wide">
      <div
        className="detail-banner"
        style={
          detail.banner
            ? { backgroundImage: `linear-gradient(180deg, rgba(12,22,34,0.55), rgba(12,22,34,0.96)), url(${detail.banner})` }
            : undefined
        }
      />

      <BackLink />

      <div className="detail-hero">
        <Cover src={detail.cover} alt={detail.title.display} className="detail-poster" />
        <div className="detail-body">
          <h1>{detail.title.display}</h1>
          {detail.title.romaji && detail.title.romaji !== detail.title.display ? <p className="detail-alt">{detail.title.romaji}</p> : null}
          {detail.title.english && detail.title.english !== detail.title.display ? <p className="detail-alt">{detail.title.english}</p> : null}
          {detail.title.native ? <p className="detail-alt">{detail.title.native}</p> : null}

          <div className="detail-meta">
            <ScoreBadge score={detail.meanScore} />
            <Chip>{formatLabel(detail.format)}</Chip>
            {detail.status ? <Chip>{humanize(detail.status)}</Chip> : null}
            <Chip>{episodeCountLabel(detail.episodes)}</Chip>
            {detail.duration ? <Chip>{minutesLabel(detail.duration)}</Chip> : null}
            {detail.year ? <Chip>{detail.year}</Chip> : null}
            {detail.season ? <Chip>{`${humanize(detail.season)} ${detail.seasonYear ?? ''}`.trim()}</Chip> : null}
            {detail.studio ? <Chip>{detail.studio}</Chip> : null}
          </div>

          {playback ? (
            <div className="detail-actions">
              {playback.hasAuthorizedSource && firstAvailable ? (
                <Link className="btn btn-primary btn-lg" to={`/watch/${detail.id}/${firstAvailable}`}>
                  ▶ Start watching
                </Link>
              ) : null}
              {resumeAt ? (
                <Link className="btn btn-lg" to={`/watch/${detail.id}/${resumeAt.episodeNumber}`}>
                  Resume EP {resumeAt.episodeNumber} · {Math.floor(resumeAt.positionSeconds / 60)} min in
                </Link>
              ) : null}
              <button className="btn btn-lg" type="button" disabled={busy} onClick={() => addToList('watchlist')}>
                + Watchlist
              </button>
              <button className="btn btn-lg" type="button" disabled={busy} onClick={() => addToList('favorites')}>
                ♥ Favorites
              </button>
              {detail.trailer ? (
                <a className="btn btn-lg" href={detail.trailer} target="_blank" rel="noreferrer noopener">
                  Trailer
                </a>
              ) : null}
              <button
                className="btn btn-lg"
                type="button"
                onClick={() => {
                  if (navigator.share) navigator.share({ title: detail.title.display, url: window.location.href }).catch(() => undefined);
                  else navigator.clipboard?.writeText(window.location.href).catch(() => undefined);
                }}
              >
                Share
              </button>
            </div>
          ) : null}

          <div className="availability-row">
            {playback?.hasAuthorizedSource ? (
              <Chip tone="chip chip-verified" title={`Verified ${shortDate(playback.verifiedAt)}`}>
                {playback.availableEpisodes} official {playback.availableEpisodes === 1 ? 'episode' : 'episodes'} available
              </Chip>
            ) : (
              <Chip tone="chip chip-muted">No authorized stream for this title</Chip>
            )}
            <Chip tone="chip chip-outline">{episodeCountLabel(detail.episodes)} in metadata</Chip>
            {playback?.provider ? <Chip tone="chip chip-outline">{playback.provider}</Chip> : null}
            {playback?.channel ? <Chip tone="chip chip-sub">{playback.channel}</Chip> : null}
          </div>

          {playback?.rightsNote ? <p className="muted small">{playback.rightsNote}</p> : null}

          {description ? (
            <>
              <p className={`detail-synopsis${!expanded && longText ? ' is-clamped' : ''}`}>{description}</p>
              {longText ? (
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => setExpanded((value) => !value)}>
                  {expanded ? 'Show less' : 'Read more'}
                </button>
              ) : null}
            </>
          ) : (
            <p className="muted small">No synopsis was supplied by the metadata provider.</p>
          )}

          <div className="genre-row">
            {detail.genres.map((genre) => (
              <Link key={genre} className="chip chip-outline" to={`/genre/${encodeURIComponent(genre)}`}>
                {genre}
              </Link>
            ))}
            {detail.tags.slice(0, 6).map((tag) => (
              <span key={tag.name} className="chip chip-muted">
                {tag.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <h2>Episodes</h2>
          <span className="spacer" />
          {episodes ? (
            <span className="muted small">
              {episodes.availableEpisodes} available · {episodes.totalEpisodes ?? '—'} total
            </span>
          ) : null}
        </div>

        {episodes?.episodeTitleNotice ? <div className="alert alert-info">{episodes.episodeTitleNotice}</div> : null}

        {!episodes ? (
          <div className="skeleton" style={{ height: 160, borderRadius: 6 }} />
        ) : episodes.items.length === 0 ? (
          <EmptyState title="No episode metadata available">
            The metadata provider did not return an episode list for this title.
          </EmptyState>
        ) : (
          <div className="episode-list">
            {episodes.items.slice(0, 200).map((item) => (
              <Link
                key={item.number}
                className={`episode-row${playable(item.availability) ? ' is-playable' : ''}`}
                to={playable(item.availability) ? `/watch/${detail.id}/${item.number}` : `/anime/${detail.id}`}
                onClick={(event) => {
                  if (!playable(item.availability)) event.preventDefault();
                }}
              >
                <span className="episode-num">{item.number}</span>
                <span className="episode-name">
                  {item.title ?? `Episode ${item.number}`}
                  {item.aired ? <em>{shortDate(item.aired)}</em> : null}
                </span>
                <span className={`chip ${stateTone(item.availability)}`}>{stateLabel(item.availability)}</span>
              </Link>
            ))}
          </div>
        )}
        {episodes && episodes.totalEpisodes && episodes.totalEpisodes > 200 ? (
          <p className="muted small">
            Showing the first 200 of {episodes.totalEpisodes} episodes here. The watch page shows the complete numbered index.
          </p>
        ) : null}
      </section>

      {detail.relations.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2>Franchise &amp; related titles</h2>
          </div>
          <div className="relation-grid">
            {detail.relations.slice(0, 18).map((relation) => (
              <Link key={`${relation.relationType}-${relation.anime.id}`} className="relation-item" to={`/anime/${relation.anime.id}`}>
                <Cover src={relation.anime.coverMedium ?? relation.anime.cover} alt={relation.anime.title.display} className="relation-thumb" />
                <span>
                  <span className="chip chip-outline">{humanize(relation.relationType)}</span>
                  <strong>{relation.anime.title.display}</strong>
                  <em>
                    {formatLabel(relation.anime.format)} {relation.anime.year ? `· ${relation.anime.year}` : ''}
                  </em>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {detail.characters.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2>Characters &amp; voice actors</h2>
          </div>
          <div className="character-row">
            {detail.characters.slice(0, 12).map((character) => (
              <div className="character" key={character.id}>
                <Cover src={character.image} alt={character.name} />
                <span className="character-name">{character.name}</span>
                <span className="character-role">{humanize(character.role)}</span>
                {character.voiceActor ? <span className="character-role">{character.voiceActor.name}</span> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {detail.recommendations.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2>If you liked this</h2>
          </div>
          <div className="poster-grid">
            {detail.recommendations.slice(0, 12).map((item) => (
              <PosterCard key={item.id} anime={item} />
            ))}
          </div>
        </section>
      ) : null}

      {detail.externalLinks.length > 0 ? (
        <section className="section">
          <div className="section-head">
            <h2>Official links</h2>
          </div>
          <div className="genre-row">
            {detail.externalLinks.map((link) => (
              <a key={link.url} className="chip chip-outline" href={link.url} target="_blank" rel="noreferrer noopener">
                {link.site ?? link.url}
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {playback && !playback.hasAuthorizedSource ? (
        <StateBox title="This title has no verified official stream yet">
          aniyashi only plays episodes from rights-holder channels that allow embedding. {detail.title.display} currently has none, so nothing is
          shown as playable. Metadata, artwork and franchise browsing remain fully available.
        </StateBox>
      ) : null}
    </div>
  );
}
