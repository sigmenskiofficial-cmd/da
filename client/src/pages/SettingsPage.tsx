import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiLogout, apiUpdateMe, apiMe } from '../lib/api';
import { readPrefs, writePrefs, type Prefs } from '../lib/guest';
import { useAuth } from '../state/auth';
import { PageHead, StateBox, useDocumentTitle } from '../components/Bits';

const THEMES = [
  { id: 'navy', label: 'Default navy' },
  { id: 'amoled', label: 'AMOLED black' },
  { id: 'midnight', label: 'Midnight purple' },
  { id: 'ocean', label: 'Ocean blue' },
  { id: 'crimson', label: 'Crimson' },
];

export default function SettingsPage() {
  const { user, refresh, setUser } = useAuth();
  const navigate = useNavigate();
  useDocumentTitle('Settings');
  const [prefs, setPrefs] = useState<Prefs>(() => readPrefs());
  const [titlePreference, setTitlePreference] = useState(user?.titlePreference ?? 'romaji');
  const [theme, setTheme] = useState(user?.theme ?? document.documentElement.dataset.theme ?? 'navy');
  const [note, setNote] = useState<string | null>(null);
  const [exported, setExported] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (user) {
      setTitlePreference(user.titlePreference ?? 'romaji');
      setTheme(user.theme ?? 'navy');
    }
  }, [user]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function patchPrefs(patch: Partial<Prefs>) {
    setPrefs(writePrefs(patch));
  }

  async function savePreferences() {
    writePrefs({ theme });
    if (!user) {
      setNote('Preferences saved on this device. Sign in to sync them.');
      return;
    }
    try {
      const data = await apiUpdateMe({ titlePreference, theme });
      setUser(data.user);
      setNote('Preferences saved.');
    } catch {
      setNote('Preferences could not be saved to your account.');
    }
  }

  async function exportData() {
    try {
      const me = await apiMe();
      const res = await fetch('/api/me/export', { credentials: 'same-origin' });
      const payload = res.ok ? await res.json() : { user: me.user, note: 'Export endpoint unavailable' };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'aniyashi-export.json';
      link.click();
      URL.revokeObjectURL(url);
      setExported('Export downloaded.');
    } catch {
      setExported('Export failed.');
    }
  }

  async function deleteAccount() {
    try {
      await fetch('/api/me', { method: 'DELETE', credentials: 'same-origin' });
      await apiLogout().catch(() => undefined);
      await refresh();
      navigate('/');
    } catch {
      setNote('Account deletion failed. Please try again.');
    }
  }

  return (
    <div className="page page-narrow">
      <PageHead title="Settings" />

      {note ? <div className="alert alert-info">{note}</div> : null}

      <section className="panel">
        <div className="panel-head">
          <h3>Playback</h3>
        </div>
        <div className="panel-body">
          <label className="switch-row">
            <input type="checkbox" checked={prefs.autoplay} onChange={(event) => patchPrefs({ autoplay: event.target.checked })} />
            <span>Start playing automatically when a verified source is ready</span>
          </label>
          <label className="switch-row">
            <input type="checkbox" checked={prefs.autoNext} onChange={(event) => patchPrefs({ autoNext: event.target.checked })} />
            <span>Play the next available episode when one ends</span>
          </label>
          <label className="switch-row">
            <input type="checkbox" checked={prefs.lightsOff} onChange={(event) => patchPrefs({ lightsOff: event.target.checked })} />
            <span>Dim the interface around the player (lights off)</span>
          </label>
          <p className="muted small">
            These options are saved in this browser. The watch page also exposes them in its toolbar.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Appearance</h3>
        </div>
        <div className="panel-body">
          <label className="field">
            <span>Theme</span>
            <select
              value={theme}
              onChange={(event) => {
                setTheme(event.target.value);
                document.documentElement.dataset.theme = event.target.value;
              }}
            >
              {THEMES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Preferred titles</span>
            <select value={titlePreference} onChange={(event) => setTitlePreference(event.target.value)}>
              <option value="romaji">Romaji (Japanese)</option>
              <option value="english">English</option>
              <option value="native">Native Japanese</option>
            </select>
          </label>
          <button className="btn btn-primary btn-sm" type="button" onClick={savePreferences}>
            Save preferences
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Account</h3>
        </div>
        <div className="panel-body">
          {user ? (
            <>
              <p>
                Signed in as <strong>{user.displayName || user.username}</strong> ({user.email ?? 'no email on file'}).
              </p>
              <div className="filter-actions">
                <Link className="btn btn-sm" to="/profile">
                  Open profile
                </Link>
                <button className="btn btn-sm" type="button" onClick={exportData}>
                  Export my data (JSON)
                </button>
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={async () => {
                    await apiLogout().catch(() => undefined);
                    await refresh();
                    navigate('/');
                  }}
                >
                  Sign out
                </button>
              </div>
              {exported ? <div className="alert alert-ok">{exported}</div> : null}
              <hr className="rule" />
              {confirmDelete ? (
                <div className="alert alert-error">
                  <p>Deleting your account removes your profile, progress, lists and sessions. This cannot be undone.</p>
                  <div className="filter-actions">
                    <button className="btn btn-sm" type="button" onClick={deleteAccount}>
                      Yes, delete my account
                    </button>
                    <button className="btn btn-sm" type="button" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-sm" type="button" onClick={() => setConfirmDelete(true)}>
                  Delete account
                </button>
              )}
            </>
          ) : (
            <StateBox title="You are not signed in" action={<Link className="btn btn-primary" to="/login">Sign in</Link>}>
              Preferences above still apply on this device.
            </StateBox>
          )}
        </div>
      </section>
    </div>
  );
}
