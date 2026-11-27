import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EpisodeItem } from '../lib/api';
import { playable } from '../lib/format';

const RANGE_SIZE = 100;

export function EpisodeRail({
  animeId,
  items,
  current,
  totalEpisodes,
  watched,
  inProgress,
  availableEpisodes,
}: {
  animeId: number;
  items: EpisodeItem[];
  current: number;
  totalEpisodes: number | null;
  watched: Set<number>;
  inProgress: Set<number>;
  availableEpisodes: number;
}) {
  const [mode, setMode] = useState<'grid' | 'list'>('grid');
  const [rangeIndex, setRangeIndex] = useState(() => Math.max(0, Math.floor((current - 1) / RANGE_SIZE)));
  const [filter, setFilter] = useState('');

  const ranges = useMemo(() => {
    const count = Math.max(1, Math.ceil((totalEpisodes ?? items.length) / RANGE_SIZE));
    return Array.from({ length: count }, (_, index) => {
      const start = index * RANGE_SIZE + 1;
      const end = Math.min((index + 1) * RANGE_SIZE, totalEpisodes ?? items.length);
      return { start, end };
    });
  }, [items.length, totalEpisodes]);

  const activeRange = ranges[Math.min(rangeIndex, ranges.length - 1)];

  const visible = useMemo(() => {
    const term = filter.trim();
    if (term) {
      return items.filter((item) => String(item.number) === term || String(item.number).startsWith(term));
    }
    return items.filter((item) => item.number >= activeRange.start && item.number <= activeRange.end);
  }, [activeRange.end, activeRange.start, filter, items]);

  return (
    <aside className="ep-rail" aria-label="Episodes">
      <div className="ep-rail-head">
        <h3>Episodes</h3>
        <span className="muted small">
          {availableEpisodes > 0 ? `${availableEpisodes} with an official source` : 'No official source yet'}
        </span>
      </div>

      <div className="ep-controls">
        <select
          className="select"
          aria-label="Episode range"
          value={rangeIndex}
          onChange={(event) => {
            setRangeIndex(Number(event.target.value));
            setFilter('');
          }}
        >
          {ranges.map((range, index) => (
            <option key={`${range.start}-${range.end}`} value={index}>
              {String(range.start).padStart(3, '0')}–{String(range.end).padStart(3, '0')}
            </option>
          ))}
        </select>
        <input
          className="input"
          type="search"
          inputMode="numeric"
          placeholder="Find episode"
          aria-label="Find an episode number"
          value={filter}
          onChange={(event) => setFilter(event.target.value.replace(/[^0-9]/g, ''))}
        />
        <button
          className="btn btn-sm"
          type="button"
          onClick={() => setMode(mode === 'grid' ? 'list' : 'grid')}
          aria-label={mode === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
        >
          {mode === 'grid' ? '☰' : '▦'}
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="muted small">No episode matches that number.</p>
      ) : mode === 'grid' ? (
        <div className="ep-grid">
          {visible.map((item) => {
            const isCurrent = item.number === current;
            const isWatched = watched.has(item.number);
            const isStarted = inProgress.has(item.number);
            const usable = playable(item.availability);
            const state = isCurrent ? 'selected' : isWatched ? 'completed' : isStarted ? 'watched' : usable ? 'available' : 'unavailable';
            return (
              <Link
                key={item.number}
                to={`/watch/${animeId}/${item.number}`}
                className="ep-btn"
                data-state={state}
                aria-current={isCurrent ? 'true' : undefined}
                title={`${item.title ?? `Episode ${item.number}`} — ${usable ? 'official source available' : 'no authorized source'}`}
              >
                {item.number}
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="ep-list">
          {visible.map((item) => {
            const isCurrent = item.number === current;
            const usable = playable(item.availability);
            const state = isCurrent ? 'selected' : watched.has(item.number) ? 'completed' : usable ? 'available' : 'unavailable';
            return (
              <Link key={item.number} to={`/watch/${animeId}/${item.number}`} className="ep-row" data-state={state} aria-current={isCurrent ? 'true' : undefined}>
                <span className="ep-num">{item.number}</span>
                <span className="ep-name">{item.title ?? `Episode ${item.number}`}</span>
                <span className={`chip ${usable ? 'chip-verified' : 'chip-muted'}`}>{usable ? 'Playable' : 'Unavailable'}</span>
              </Link>
            );
          })}
        </div>
      )}
    </aside>
  );
}
