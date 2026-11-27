import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../lib/api';

export function Chip({ children, tone = 'chip chip-outline', title }: { children: ReactNode; tone?: string; title?: string }) {
  return (
    <span className={tone} title={title}>
      {children}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="loading-row">
      <span className="spinner" aria-hidden="true" />
      <span>{label ?? 'Loading…'}</span>
    </div>
  );
}

export function SkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="poster-grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div className="skeleton-card" key={index}>
          <div className="skeleton" style={{ aspectRatio: '2 / 3' }} />
          <div className="skeleton" style={{ height: 12, marginTop: 8 }} />
          <div className="skeleton" style={{ height: 10, width: '60%', marginTop: 6 }} />
        </div>
      ))}
    </div>
  );
}

export function StateBox({
  title,
  children,
  action,
  tone,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  tone?: 'error' | 'warn';
}) {
  return (
    <div className={`state-box${tone ? ` is-${tone}` : ''}`} role={tone === 'error' ? 'alert' : 'status'}>
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
      {action ? <div className="state-box-action">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof ApiError
      ? error.message
      : error instanceof Error
        ? error.message
        : 'Something went wrong while loading this data.';
  return (
    <StateBox
      title="Could not load"
      tone="error"
      action={
        onRetry ? (
          <button className="btn btn-sm" onClick={onRetry} type="button">
            Try again
          </button>
        ) : undefined
      }
    >
      {message}
    </StateBox>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state-box">
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function Pagination({
  page,
  lastPage,
  hasNextPage,
  onChange,
}: {
  page: number;
  lastPage: number | null;
  hasNextPage: boolean;
  onChange: (page: number) => void;
}) {
  const total = lastPage ?? (hasNextPage ? page + 1 : page);
  if (total <= 1) return null;
  const windowStart = Math.max(1, Math.min(page - 2, total - 4));
  const pages = Array.from({ length: Math.min(5, total) }, (_, index) => windowStart + index).filter((value) => value >= 1 && value <= total);

  return (
    <nav className="pagination" aria-label="Pagination">
      <button className="page-btn" disabled={page <= 1} onClick={() => onChange(page - 1)} type="button">
        Prev
      </button>
      {windowStart > 1 ? (
        <>
          <button className="page-btn" onClick={() => onChange(1)} type="button">
            1
          </button>
          {windowStart > 2 ? <span className="muted small">…</span> : null}
        </>
      ) : null}
      {pages.map((value) => (
        <button
          key={value}
          className={`page-btn${value === page ? ' is-active' : ''}`}
          aria-current={value === page ? 'page' : undefined}
          onClick={() => onChange(value)}
          type="button"
        >
          {value}
        </button>
      ))}
      {total > windowStart + 4 ? (
        <>
          {total > windowStart + 5 ? <span className="muted small">…</span> : null}
          <button className="page-btn" onClick={() => onChange(total)} type="button">
            {total}
          </button>
        </>
      ) : null}
      <button className="page-btn" disabled={!hasNextPage} onClick={() => onChange(page + 1)} type="button">
        Next
      </button>
    </nav>
  );
}

export function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (!score) return null;
  return (
    <span className="poster-score" title="Average score from the metadata provider">
      ★ {Math.round(score)}%
    </span>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={tab.id === value}
          className={`tab${tab.id === value ? ' is-active' : ''}`}
          onClick={() => onChange(tab.id)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function useDebounced<T>(value: T, delay = 260): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function Cover({
  src,
  fallback,
  alt,
  className,
}: {
  src: string | null | undefined;
  fallback?: string | null;
  alt: string;
  className?: string;
}) {
  const [stage, setStage] = useState(0);
  const source = stage === 0 ? src : stage === 1 ? fallback : null;
  useEffect(() => setStage(0), [src]);

  if (!source) {
    return (
      <div className={`cover-fallback ${className ?? ''}`} role="img" aria-label={alt}>
        <span>{alt.slice(0, 2).toUpperCase()}</span>
      </div>
    );
  }

  return (
    <img
      className={className}
      src={source}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setStage((value) => (value < 2 ? value + 1 : 2))}
    />
  );
}

export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {children ? <div className="page-head-side">{children}</div> : null}
    </div>
  );
}

export function BackLink({ to = '/browse', label = 'Back to browse' }: { to?: string; label?: string }) {
  return (
    <Link className="back-link" to={to}>
      ← {label}
    </Link>
  );
}

export function useDocumentTitle(title: string | null | undefined) {
  const previous = useRef(document.title);
  useEffect(() => {
    if (title) document.title = `${title} — aniyashi`;
    return () => {
      document.title = previous.current;
    };
  }, [title]);
}
