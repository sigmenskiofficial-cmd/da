// Guest watch progress. Signed-in users persist to the server; guests keep the same shape
// locally so Continue Watching works before creating an account.
import type { ProgressRow } from './api';

const KEY = 'aniyashi.guest.progress.v1';
const PREFS = 'aniyashi.prefs.v1';

function read(): ProgressRow[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ProgressRow[]) : [];
  } catch {
    return [];
  }
}

function write(rows: ProgressRow[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(-400)));
  } catch {
    /* storage may be unavailable in private mode */
  }
}

export function guestProgress(): ProgressRow[] {
  return read();
}

export function saveGuestProgress(row: Omit<ProgressRow, 'updatedAt'> & { updatedAt?: string }): ProgressRow {
  const rows = read();
  const index = rows.findIndex((item) => item.animeId === row.animeId && item.episodeNumber === row.episodeNumber);
  const next: ProgressRow = {
    ...row,
    percent: row.durationSeconds > 0 ? Math.min(100, Math.round((row.positionSeconds / row.durationSeconds) * 100)) : 0,
    completed: Boolean(row.completed) || (row.durationSeconds > 0 && row.positionSeconds / row.durationSeconds > 0.92),
    updatedAt: new Date().toISOString(),
  };
  if (index >= 0) rows[index] = next;
  else rows.push(next);
  write(rows);
  return next;
}

export function removeGuestProgress(animeId: number, episodeNumber: number) {
  write(read().filter((row) => !(row.animeId === animeId && row.episodeNumber === episodeNumber)));
}

export function guestContinueWatching(): ProgressRow[] {
  return read()
    .filter((row) => !row.completed && row.positionSeconds > 15)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 12);
}

export function guestHistory(): ProgressRow[] {
  return read().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export type Prefs = {
  titlePreference: 'romaji' | 'english';
  autoplay: boolean;
  autoNext: boolean;
  autoSkip: boolean;
  lightsOff: boolean;
  layout: 'grid' | 'dense' | 'list';
  theme: string;
};

const DEFAULT_PREFS: Prefs = {
  titlePreference: 'romaji',
  autoplay: true,
  autoNext: true,
  autoSkip: false,
  lightsOff: false,
  layout: 'grid',
  theme: 'default',
};

export function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writePrefs(patch: Partial<Prefs>): Prefs {
  const next = { ...readPrefs(), ...patch };
  try {
    localStorage.setItem(PREFS, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
