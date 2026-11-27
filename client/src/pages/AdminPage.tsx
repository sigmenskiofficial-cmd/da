import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  apiAdminDiagnostics,
  apiAdminPlaybackTest,
  apiAdminProviderTest,
  apiAdminProviders,
  apiAdminReports,
  apiAdminResolveReport,
  apiAdminSetRole,
  apiAdminSync,
  apiAdminUsers,
} from '../lib/api';
import { dayTime, timeAgo } from '../lib/format';
import { EmptyState, ErrorState, PageHead, StateBox, Tabs, useDocumentTitle } from '../components/Bits';

type Tab = 'overview' | 'providers' | 'playback' | 'reports' | 'users';

function Value({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="muted">—</span>;
  if (typeof value === 'boolean') return <span>{value ? 'yes' : 'no'}</span>;
  if (typeof value === 'string' || typeof value === 'number') return <span>{String(value)}</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="muted">none</span>;
    return (
      <ul className="plain-list">
        {value.slice(0, 25).map((item, index) => (
          <li key={index}>
            <Value value={item} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="kv-grid">
      {Object.entries(value as Record<string, unknown>).map(([key, nested]) => (
        <div className="kv-row" key={key}>
          <span className="kv-key">{key}</span>
          <span className="kv-value">
            <Value value={nested} />
          </span>
        </div>
      ))}
    </div>
  );
}

function Section({ title, data }: { title: string; data: unknown }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
      </div>
      <div className="panel-body">
        <Value value={data} />
      </div>
    </section>
  );
}

export default function AdminPage({ view = 'overview' }: { view?: Tab }) {
  const [tab, setTab] = useState<Tab>(view);
  const [diagnostics, setDiagnostics] = useState<Record<string, any> | null>(null);
  const [providers, setProviders] = useState<Record<string, any> | null>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, any> | null>(null);
  const [episode, setEpisode] = useState('1');
  const [animeId, setAnimeId] = useState('20');
  const [busy, setBusy] = useState(false);

  useDocumentTitle('Administration');

  const load = useCallback(async () => {
    try {
      const data = await apiAdminDiagnostics();
      setDiagnostics(data);
      setError(null);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    load();
    apiAdminProviders()
      .then(setProviders)
      .catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (tab === 'reports') apiAdminReports().then((data) => setReports(data.items)).catch(() => undefined);
    if (tab === 'users') apiAdminUsers().then((data) => setUsers(data.items)).catch(() => undefined);
  }, [tab]);

  async function run(action: () => Promise<unknown>, label: string) {
    setBusy(true);
    setNote(null);
    try {
      const result = await action();
      setTestResult((result as Record<string, any>) ?? null);
      setNote(`${label} finished.`);
      load();
    } catch (err) {
      setNote(`${label} failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page page-wide">
      <PageHead title="Administration">
        <span className="muted small">Private controls. Only administrator accounts can reach this page.</span>
      </PageHead>

      <Tabs
        tabs={[
          { id: 'overview', label: 'Diagnostics' },
          { id: 'providers', label: 'Providers' },
          { id: 'playback', label: 'Playback test' },
          { id: 'reports', label: 'Reports' },
          { id: 'users', label: 'Users' },
        ]}
        value={tab}
        onChange={(next) => setTab(next as Tab)}
      />

      {error ? <ErrorState error={error} onRetry={load} /> : null}
      {note ? <div className="alert alert-info">{note}</div> : null}

      {tab === 'overview' ? (
        diagnostics ? (
          <div className="admin-grid">
            <Section title="Streaming engine" data={diagnostics.streaming ?? diagnostics} />
            {diagnostics.metadata ? <Section title="Metadata providers" data={diagnostics.metadata} /> : null}
            {diagnostics.database ? <Section title="Persistence" data={diagnostics.database} /> : null}
            {diagnostics.catalog ? <Section title="Source catalog" data={diagnostics.catalog} /> : null}
            {diagnostics.errors ? <Section title="Recent errors" data={diagnostics.errors} /> : null}
          </div>
        ) : (
          <StateBox title="Loading diagnostics">Reading provider health, catalog counts and verification state.</StateBox>
        )
      ) : null}

      {tab === 'providers' ? (
        <>
          <div className="filter-actions">
            <button className="btn btn-sm btn-primary" type="button" disabled={busy} onClick={() => run(apiAdminProviderTest, 'Provider health check')}>
              Test all providers
            </button>
            <button className="btn btn-sm" type="button" disabled={busy} onClick={() => run(() => apiAdminSync(40), 'Catalog synchronisation')}>
              Synchronise catalog
            </button>
            <Link className="btn btn-sm" to="/admin/providers">
              Open provider detail
            </Link>
          </div>
          {providers ? <Section title="Configured providers" data={providers} /> : null}
          {testResult ? <Section title="Last health check" data={testResult} /> : null}
        </>
      ) : null}

      {tab === 'playback' ? (
        <>
          <div className="source-panel">
            <div>
              <strong>Test an episode resolution</strong>
              <p className="muted small">
                Runs the real resolver for a metadata id and episode number, returning every provider attempt and its verification state.
              </p>
            </div>
            <div className="filter-actions">
              <label className="field field-inline">
                <span>AniList id</span>
                <input value={animeId} onChange={(event) => setAnimeId(event.target.value)} inputMode="numeric" />
              </label>
              <label className="field field-inline">
                <span>Episode</span>
                <input value={episode} onChange={(event) => setEpisode(event.target.value)} inputMode="numeric" />
              </label>
              <button
                className="btn btn-sm btn-primary"
                type="button"
                disabled={busy}
                onClick={() => run(() => apiAdminPlaybackTest(Number(animeId), Number(episode)), 'Playback test')}
              >
                Resolve
              </button>
            </div>
          </div>
          {testResult ? <Section title="Resolution result" data={testResult} /> : null}
        </>
      ) : null}

      {tab === 'reports' ? (
        reports.length === 0 ? (
          <EmptyState title="No playback reports">Reports submitted from the watch page appear here.</EmptyState>
        ) : (
          <div className="panel">
            <div className="panel-body">
              {reports.map((report) => (
                <div className="report-row" key={report.id}>
                  <div>
                    <strong>
                      Anime {report.animeId} · EP {report.episodeNumber}
                    </strong>
                    <p className="muted small">
                      {report.reason} · {report.providerId ?? 'unknown provider'} · {timeAgo(report.createdAt)}
                      {report.resolvedAt ? ` · resolved ${dayTime(report.resolvedAt)}` : ''}
                    </p>
                  </div>
                  {report.resolvedAt ? (
                    <span className="chip chip-verified">Resolved</span>
                  ) : (
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() => run(() => apiAdminResolveReport(report.id), 'Report resolution')}
                    >
                      Mark resolved
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      ) : null}

      {tab === 'users' ? (
        users.length === 0 ? (
          <EmptyState title="No accounts yet">Registered accounts appear here with their role and activity counts.</EmptyState>
        ) : (
          <div className="panel">
            <div className="panel-body">
              {users.map((row) => (
                <div className="report-row" key={row.id}>
                  <div>
                    <strong>{row.displayName || row.username}</strong>
                    <p className="muted small">
                      @{row.username} · {row.role} · joined {dayTime(row.createdAt)}
                      {typeof row.progressCount === 'number' ? ` · ${row.progressCount} progress rows` : ''}
                    </p>
                  </div>
                  <button
                    className="btn btn-sm"
                    type="button"
                    onClick={() => run(() => apiAdminSetRole(row.id, row.role === 'admin' ? 'member' : 'admin'), 'Role update')}
                  >
                    Make {row.role === 'admin' ? 'member' : 'admin'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}
