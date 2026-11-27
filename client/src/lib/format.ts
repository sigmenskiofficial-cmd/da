import type { AvailabilityState } from './api';

export function humanize(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatLabel(format: string | null | undefined): string {
  if (!format) return '';
  const map: Record<string, string> = {
    TV: 'TV',
    TV_SHORT: 'TV Short',
    MOVIE: 'Movie',
    OVA: 'OVA',
    ONA: 'ONA',
    SPECIAL: 'Special',
    MUSIC: 'Music',
  };
  return map[format] ?? humanize(format);
}

export function minutesLabel(duration: number | null | undefined): string {
  if (!duration) return '';
  if (duration < 60) return `${duration}m`;
  const hours = Math.floor(duration / 60);
  const mins = duration % 60;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
}

export function episodeCountLabel(count: number | null | undefined): string {
  if (!count) return '? eps';
  return count === 1 ? '1 ep' : `${count} eps`;
}

export function clock(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function shortDate(value: string | number | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function dayTime(value: string | number | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function timeAgo(value: string | number | null | undefined): string {
  if (!value) return '';
  const then = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return shortDate(then);
}

const STATE_LABELS: Record<AvailabilityState, string> = {
  'verified-playable': 'Verified playing',
  'provider-available': 'Available',
  unverified: 'Not yet verified',
  'temporarily-unavailable': 'Temporarily unavailable',
  'regional-restriction': 'Region restricted',
  'embedding-prohibited': 'Embedding not permitted',
  upcoming: 'Upcoming',
  'authentication-required': 'Sign-in required',
  'no-authorized-source': 'No authorized source',
  'playback-error': 'Playback error',
};

export function stateLabel(state: AvailabilityState | string | null | undefined): string {
  if (!state) return 'Unknown';
  return STATE_LABELS[state as AvailabilityState] ?? humanize(state);
}

export function stateTone(state: AvailabilityState | string | null | undefined): string {
  switch (state) {
    case 'verified-playable':
      return 'chip chip-verified';
    case 'provider-available':
      return 'chip chip-sub';
    case 'unverified':
      return 'chip chip-outline';
    case 'embedding-prohibited':
    case 'regional-restriction':
    case 'temporarily-unavailable':
    case 'playback-error':
      return 'chip chip-warn';
    default:
      return 'chip chip-muted';
  }
}

export function playable(state: AvailabilityState | string | null | undefined): boolean {
  return state === 'verified-playable' || state === 'provider-available' || state === 'unverified';
}
