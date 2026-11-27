import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiStats, apiUpdateMe, apiLogout, type ProgressRow } from '../lib/api';
import { clock, dayTime, timeAgo } from '../lib/format';
import { useAuth } from '../state/auth';
import { Cover, EmptyState, PageHead, StateBox, useDocumentTitle } from '../components/Bits';

export default function ProfilePage() {
  const { user, refresh, setUser } = useAuth();
  const navigate = useNavigate();
  useDocumentTitle('Profile');
  const [stats, setStats] = useState<{ episodesStarted: number; episodesCompleted: number; watchTimeSeconds: number; watchlist: number; favorites: number; recent: ProgressRow[] } | null>(
    null,
  );
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName ?? '');
    setBio(user.bio ?? '');
    apiStats()
      .then(setStats)
      .catch(() => setStats(null));
  }, [user]);

  if (!user) {
    return (
      <div className="page page-narrow">
        <StateBox title="You are browsing as a guest" action={<Link className="btn btn-primary" to="/login">Sign in</Link>}>
          Guest playback progress is stored on this device. Sign in to keep statistics, watchlists and history.
        </StateBox>
      </div>
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const data = await apiUpdateMe({ displayName, bio });
      setUser(data.user);
      setNote('Profile updated.');
    } catch {
      setNote('Profile could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await apiLogout().catch(() => undefined);
    await refresh();
    navigate('/');
  }

  return (
    <div className="page page-wide">
      <PageHead title="Profile">
        <button className="btn btn-sm" type="button" onClick={signOut}>
          Sign out
        </button>
      </PageHead>

      <div className="layout-main-side">
        <div>
          <section className="panel">
            <div className="panel-body">
              <div className="profile-head">
                <div className="avatar">{user.displayName?.[0]?.toUpperCase() ?? user.username[0]?.toUpperCase()}</div>
                <div>
                  <h2>{user.displayName || user.username}</h2>
                  <p className="muted small">
                    @{user.username} · {user.role === 'admin' ? 'Administrator' : 'Member'}
                    {user.createdAt ? ` · joined ${dayTime(user.createdAt)}` : ''}
                  </p>
                  {user.bio ? <p>{user.bio}</p> : null}
                </div>
              </div>

              {note ? <div className="alert alert-info">{note}</div> : null}

              <form className="profile-form" onSubmit={save}>
                <label className="field">
                  <span>Display name</span>
                  <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={60} />
                </label>
                <label className="field">
                  <span>Biography</span>
                  <textarea value={bio} onChange={(event) => setBio(event.target.value)} rows={3} maxLength={400} />
                </label>
                <button className="btn btn-primary btn-sm" type="submit" disabled={busy}>
                  Save profile
                </button>
              </form>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>Recent activity</h3>
              <Link className="link-sm" to="/history">
                Full history
              </Link>
            </div>
            <div className="panel-body">
              {!stats || stats.recent.length === 0 ? (
                <EmptyState title="No playback yet">Activity is recorded from real player events only.</EmptyState>
              ) : (
                stats.recent.map((row) => (
                  <Link className="rank-item" key={`${row.animeId}-${row.episodeNumber}`} to={`/watch/${row.animeId}/${row.episodeNumber}`}>
                    <Cover src={row.animeCover} alt={row.animeTitle ?? 'Anime'} className="rank-thumb" />
                    <span className="rank-body">
                      <span className="rank-title">{row.animeTitle ?? `Anime ${row.animeId}`}</span>
                      <span className="rank-meta">
                        EP {row.episodeNumber} · {clock(row.positionSeconds)} / {clock(row.durationSeconds)} · {timeAgo(row.updatedAt)}
                      </span>
                    </span>
                  </Link>
                ))
              )}
            </div>
          </section>
        </div>

        <aside className="home-side">
          <section className="panel">
            <div className="panel-head">
              <h3>Statistics</h3>
            </div>
            <div className="panel-body">
              <div className="stat-grid">
                <div className="stat">
                  <strong>{stats?.episodesStarted ?? 0}</strong>
                  <span>episodes started</span>
                </div>
                <div className="stat">
                  <strong>{stats?.episodesCompleted ?? 0}</strong>
                  <span>episodes completed</span>
                </div>
                <div className="stat">
                  <strong>{Math.round((stats?.watchTimeSeconds ?? 0) / 60)}</strong>
                  <span>minutes watched</span>
                </div>
                <div className="stat">
                  <strong>{stats?.watchlist ?? 0}</strong>
                  <span>on watchlist</span>
                </div>
                <div className="stat">
                  <strong>{stats?.favorites ?? 0}</strong>
                  <span>favorites</span>
                </div>
              </div>
              <p className="muted small">Counted from stored playback progress for your account.</p>
              <Link className="btn btn-sm btn-block" to="/settings">
                Account settings
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
