// Typed API client for the aniyashi backend.
export type TitleBlock = { romaji: string | null; english: string | null; native?: string | null; display: string };

export type PlaybackFlag = { availableEpisodes: number; provider: string | null };

export type Anime = {
  id: number;
  idMal: number | null;
  title: TitleBlock;
  synonyms?: string[];
  cover: string | null;
  coverMedium: string | null;
  accent?: string | null;
  banner: string | null;
  format: string | null;
  status: string | null;
  episodes: number | null;
  duration: number | null;
  season?: string | null;
  seasonYear: number | null;
  year: number | null;
  startDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
  score: number | null;
  meanScore?: number | null;
  popularity?: number | null;
  favourites?: number | null;
  genres: string[];
  isAdult?: boolean;
  description: string | null;
  studio?: string | null;
  nextEpisode?: { episode: number; airingAt: number } | null;
  playback?: PlaybackFlag;
};

export type Relation = { relationType: string; anime: Anime };

export type Character = {
  id: number;
  name: string;
  image: string | null;
  role: string | null;
  voiceActor: { name: string | null; image: string | null } | null;
};

export type Detail = Anime & {
  endDate?: unknown;
  tags: { name: string; rank: number }[];
  trailer: string | null;
  relations: Relation[];
  recommendations: Anime[];
  characters: Character[];
  staff: { id: number; name: string; image: string | null; role: string | null }[];
  externalLinks: { site: string | null; url: string; type: string | null }[];
  streamingEpisodes: { title: string | null; thumbnail: string | null; url: string; site: string | null }[];
  studios: string[];
};

export type AvailabilityState =
  | 'verified-playable'
  | 'provider-available'
  | 'unverified'
  | 'temporarily-unavailable'
  | 'regional-restriction'
  | 'embedding-prohibited'
  | 'upcoming'
  | 'authentication-required'
  | 'no-authorized-source'
  | 'playback-error';

export type EpisodeItem = {
  number: number;
  title: string | null;
  titleJapanese?: string | null;
  aired?: string | null;
  filler?: boolean;
  recap?: boolean;
  availability: AvailabilityState;
  verifiedAt: string | null;
};

export type EpisodeListResponse = {
  animeId: number;
  idMal: number | null;
  totalEpisodes: number | null;
  nextEpisode: { episode: number; airingAt: number } | null;
  episodeTitleSource: string;
  episodeTitleNotice: string | null;
  availableEpisodes: number;
  verifiedEpisodes: number;
  items: EpisodeItem[];
};

export type PlaybackSource = {
  providerId: string;
  providerName: string;
  providerType?: string;
  playbackType: 'youtube' | 'mp4' | 'hls' | 'dash';
  embedId?: string;
  embedUrl?: string;
  watchUrl?: string;
  url?: string;
  title?: string | null;
  channel?: string | null;
  rightsNote?: string | null;
  audioLanguage?: string | null;
  subtitleLanguages?: string[];
  qualities?: unknown;
  region?: string;
  availability: AvailabilityState;
  verifiedAt?: string | null;
  availabilityDetail?: string | null;
  contentRights?: string | null;
  matchConfidence?: string;
};

export type PlaybackResponse = {
  anime: Anime;
  ok: boolean;
  episodeNumber: number;
  best: PlaybackSource | null;
  sources: PlaybackSource[];
  attempts: { providerId?: string; providerName?: string; state: string; reason: string; detail?: string }[];
  checkedAt: string;
};

export type PageResult = {
  items: Anime[];
  page: number;
  perPage: number;
  total: number | null;
  lastPage: number | null;
  hasNextPage: boolean;
};

export type MetaResponse = {
  formats: string[];
  statuses: string[];
  seasons: string[];
  sorts: string[];
  genres: { name: string; count?: number }[] | string[];
  currentSeason: { season: string; year: number };
  years: number[];
  metadata: { state: string; detail?: string; checkedAt?: string };
};

export type User = {
  id: string;
  username: string;
  displayName: string;
  email?: string | null;
  role: 'admin' | 'member';
  titlePreference?: string;
  theme?: string;
  avatarUrl?: string | null;
  bio?: string | null;
  createdAt?: string;
};

export type ProgressRow = {
  key?: string;
  animeId: number;
  animeTitle: string | null;
  animeCover: string | null;
  episodeNumber: number;
  positionSeconds: number;
  durationSeconds: number;
  percent: number;
  completed: boolean;
  updatedAt: string;
};

export type ListRow = {
  id?: string;
  animeId: number;
  animeTitle: string | null;
  animeCover: string | null;
  format: string | null;
  year: number | null;
  episodes: number | null;
  score: number | null;
  addedAt: string;
};

export type SourceSummary = {
  generatedAt: string | null;
  seriesCount: number;
  episodeCount: number;
  series: {
    id: string;
    title: string;
    year: number | null;
    anilistId: number | null;
    malId: number | null;
    channel: string | null;
    rightsNote: string | null;
    episodes: number;
    languages: string[];
  }[];
};

export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;
  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.fields = fields;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!res.ok) {
    const body = payload as { error?: string; fields?: Record<string, string> } | null;
    throw new ApiError(body?.error || `Request failed (${res.status})`, res.status, body?.fields);
  }
  return payload as T;
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const apiHealth = () => api<{ status: string; version: string }>('/api/health');
export const apiMeta = () => api<MetaResponse>('/api/meta');
export const apiSearch = (params: Record<string, string | number | null | undefined>) => api<PageResult>(`/api/search${qs(params)}`);
export const apiList = (kind: string, params: Record<string, string | number | null | undefined> = {}) =>
  api<PageResult>(`/api/lists/${kind}${qs(params)}`);
export const apiAnime = (id: number | string) =>
  api<{
    anime: Detail;
    playback: {
      hasAuthorizedSource: boolean;
      availableEpisodes: number;
      verifiedEpisodes: number;
      provider: string | null;
      channel: string | null;
      rightsNote: string | null;
      episodeStates: Record<string, { state: AvailabilityState; verifiedAt: string | null }>;
    };
  }>(`/api/anime/${id}`);
export const apiEpisodes = (id: number | string) => api<EpisodeListResponse>(`/api/anime/${id}/episodes`);
export const apiPlayback = (animeId: number | string, episode: number | string, lang?: string | null) =>
  api<PlaybackResponse>(`/api/playback/${animeId}/${episode}${qs({ lang })}`);
export const apiSchedule = (params: Record<string, string | number | null | undefined> = {}) =>
  api<{ from: number; to: number; items: { id: number; airingAt: number; episode: number; anime: Anime }[] }>(`/api/schedule${qs(params)}`);
export const apiRandom = () => api<{ anime: Anime }>('/api/random');
export const apiSources = () => api<SourceSummary>('/api/sources/summary');
export const apiVerifyPlayback = (body: { animeId: number; episodeNumber: number; state: string; detail?: string | null }) =>
  api<{ recorded: boolean }>('/api/playback/verify', { method: 'POST', body: JSON.stringify({ ...body, source: 'player' }) });
export const apiReport = (body: Record<string, unknown>) =>
  api<{ recorded: boolean; id: string }>('/api/playback/report', { method: 'POST', body: JSON.stringify(body) });

export const apiMe = () => api<{ user: User | null; isAdmin: boolean }>('/api/auth/me');
export const apiLogin = (identifier: string, password: string) =>
  api<{ user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) });
export const apiRegister = (username: string, email: string, password: string) =>
  api<{ user: User; note: string | null }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) });
export const apiLogout = () => api<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
export const apiUpdateMe = (body: Record<string, unknown>) => api<{ user: User }>('/api/me', { method: 'PATCH', body: JSON.stringify(body) });

export const apiSaveProgress = (body: Record<string, unknown>) =>
  api<{ item: ProgressRow }>('/api/me/progress', { method: 'POST', body: JSON.stringify(body) });
export const apiContinueWatching = () => api<{ items: ProgressRow[] }>('/api/me/continue-watching');
export const apiProgress = () => api<{ items: ProgressRow[] }>('/api/me/progress');
export const apiDeleteProgress = (animeId: number, episodeNumber: number) =>
  api<{ ok: boolean }>(`/api/me/progress/${animeId}/${episodeNumber}`, { method: 'DELETE' });

export const apiListRows = (kind: 'watchlist' | 'favorites') => api<{ items: ListRow[] }>(`/api/me/${kind}`);
export const apiAddToList = (kind: 'watchlist' | 'favorites', body: Record<string, unknown>) =>
  api<{ item: ListRow }>(`/api/me/${kind}`, { method: 'POST', body: JSON.stringify(body) });
export const apiRemoveFromList = (kind: 'watchlist' | 'favorites', animeId: number) =>
  api<{ ok: boolean }>(`/api/me/${kind}/${animeId}`, { method: 'DELETE' });
export const apiStats = () =>
  api<{ episodesStarted: number; episodesCompleted: number; watchTimeSeconds: number; watchlist: number; favorites: number; recent: ProgressRow[] }>(
    '/api/me/stats',
  );

export const apiAdminDiagnostics = () => api<Record<string, any>>('/api/admin/diagnostics');
export const apiAdminProviders = () => api<Record<string, any>>('/api/admin/providers');
export const apiAdminProviderTest = () => api<{ health: any[] }>('/api/admin/providers/test', { method: 'POST', body: '{}' });
export const apiAdminPlaybackTest = (animeId: number, episodeNumber: number) =>
  api<Record<string, any>>('/api/admin/playback/test', { method: 'POST', body: JSON.stringify({ animeId, episodeNumber }) });
export const apiAdminSync = (limit = 40) => api<Record<string, any>>('/api/admin/sync', { method: 'POST', body: JSON.stringify({ limit }) });
export const apiAdminReports = () => api<{ items: any[] }>('/api/admin/reports');
export const apiAdminResolveReport = (id: string) => api<{ item: any }>(`/api/admin/reports/${id}/resolve`, { method: 'POST', body: '{}' });
export const apiAdminUsers = () => api<{ items: any[] }>('/api/admin/users');
export const apiAdminSetRole = (id: string, role: string) =>
  api<{ user: any }>(`/api/admin/users/${id}/role`, { method: 'POST', body: JSON.stringify({ role }) });
