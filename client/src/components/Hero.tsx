import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Anime } from '../lib/api';
import { episodeCountLabel, formatLabel, minutesLabel } from '../lib/format';
import { Cover } from './Bits';

export function Hero({ items, loading }: { items: Anime[]; loading?: boolean }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<number | null>(null);
  const slides = items.slice(0, 5);

  useEffect(() => {
    if (index > slides.length - 1) setIndex(0);
  }, [slides.length, index]);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    timer.current = window.setTimeout(() => setIndex((value) => (value + 1) % slides.length), 9000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [index, paused, slides.length]);

  if (loading && slides.length === 0) {
    return <div className="hero skeleton" style={{ minHeight: 300 }} aria-hidden="true" />;
  }
  if (slides.length === 0) return null;

  const active = slides[Math.min(index, slides.length - 1)];
  const available = active.playback?.availableEpisodes ?? 0;

  return (
    <section
      className="hero"
      aria-roledescription="carousel"
      aria-label="Featured anime"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') setIndex((value) => (value + 1) % slides.length);
        if (event.key === 'ArrowLeft') setIndex((value) => (value - 1 + slides.length) % slides.length);
      }}
    >
      <div className="hero-media">
        <Cover src={active.banner ?? active.cover} alt={active.title.display} />
      </div>
      <div className="hero-content">
        <span className="hero-kicker">
          Featured {active.format ? `· ${formatLabel(active.format)}` : ''} {active.seasonYear ? `· ${active.seasonYear}` : ''}
        </span>
        <h1 className="hero-title">{active.title.display}</h1>
        <div className="hero-meta">
          {active.score ? <span className="chip chip-outline">★ {Math.round(active.score)}%</span> : null}
          {active.episodes ? <span className="chip chip-outline">{episodeCountLabel(active.episodes)}</span> : null}
          {active.duration ? <span className="chip chip-outline">{minutesLabel(active.duration)}</span> : null}
          {active.genres.slice(0, 3).map((genre) => (
            <Link key={genre} className="chip chip-sub" to={`/genre/${encodeURIComponent(genre)}`}>
              {genre}
            </Link>
          ))}
          {available > 0 ? (
            <span className="chip chip-verified">Official source</span>
          ) : (
            <span className="chip chip-muted">No official source yet</span>
          )}
        </div>
        <p className="hero-desc">{active.description}</p>
        <div className="hero-actions">
          {available > 0 ? (
            <Link className="btn btn-primary" to={`/watch/${active.id}/1`}>
              Watch now
            </Link>
          ) : null}
          <Link className="btn" to={`/anime/${active.id}`}>
            View details
          </Link>
        </div>
      </div>
      {slides.length > 1 ? (
        <div className="hero-dots" role="tablist" aria-label="Choose featured anime">
          {slides.map((slide, dotIndex) => (
            <button
              key={slide.id}
              role="tab"
              aria-selected={dotIndex === index}
              aria-label={slide.title.display}
              className={`hero-dot${dotIndex === index ? ' is-active' : ''}`}
              onClick={() => setIndex(dotIndex)}
              type="button"
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
