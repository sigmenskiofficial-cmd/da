import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiSchedule, type Anime } from '../lib/api';
import { dayTime, formatLabel, shortDate } from '../lib/format';
import { Cover, ErrorState, PageHead, SkeletonGrid, useDocumentTitle } from '../components/Bits';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type Item = { id: number; airingAt: number; episode: number; anime: Anime };

export default function SchedulePage() {
  useDocumentTitle('Airing schedule');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    apiSchedule({})
      .then((data) => {
        if (!cancelled) {
          setItems(data.items);
          setError(null);
        }
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
  }, []);

  const grouped = DAYS.map((day, index) => ({
    day,
    entries: items
      .filter((item) => {
        const date = new Date(item.airingAt * 1000);
        const weekday = (date.getDay() + 6) % 7;
        return weekday === index;
      })
      .sort((a, b) => a.airingAt - b.airingAt),
  }));

  return (
    <div className="page page-wide">
      <PageHead title="Airing schedule">
        <span className="muted small">
          Broadcast times from live metadata, shown in your local timezone. An episode airing does not mean an authorized stream exists.
        </span>
      </PageHead>

      {error ? <ErrorState error={error} onRetry={() => window.location.reload()} /> : null}
      {loading ? (
        <SkeletonGrid count={8} />
      ) : (
        <div className="schedule-grid">
          {grouped.map(({ day, entries }) => (
            <section className="panel" key={day}>
              <div className="panel-head">
                <h3>{day}</h3>
                <span className="chip chip-outline">{entries.length}</span>
              </div>
              <div className="panel-body">
                {entries.length === 0 ? (
                  <p className="muted small">No scheduled releases.</p>
                ) : (
                  entries.map((item) => (
                    <Link className="schedule-item" key={`${item.id}-${item.episode}`} to={`/anime/${item.id}`}>
                      <Cover src={item.anime.coverMedium ?? item.anime.cover} alt={item.anime.title.display} className="schedule-thumb" />
                      <span>
                        <strong>{item.anime.title.display}</strong>
                        <em>
                          EP {item.episode} · {dayTime(item.airingAt * 1000)}
                        </em>
                        <span className="muted small">
                          {formatLabel(item.anime.format)} · {shortDate(new Date(item.airingAt * 1000).toISOString())}
                        </span>
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
