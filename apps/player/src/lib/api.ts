/* HUNGREE Goat public read-only API — the player never touches control endpoints. */
export const API = (import.meta.env.VITE_HG_API_BASE || 'https://api.hungreegoat.com').replace(/\/$/, '');
export const HOME = import.meta.env.VITE_HG_HOME_URL || 'https://hungreegoat.com';
export const YT_ENV = import.meta.env.VITE_HG_YOUTUBE_URL || '';
export const abs = (p?: string | null) => (p && p.startsWith('/') ? API + p : p || '');

export interface NowPlaying { station: string; station_id: string; live: boolean; youtube_live: boolean; title: string | null; artist: string | null; album: string | null; tags: string[]; artwork: string; duration: number | null; elapsed: number | null; started_at: string | null; youtube_url: string | null; stream_url: string; }
export interface Station { id: string; name: string; short: string; genre: string; tags: string[]; status: 'live' | 'coming_soon' | 'offline'; live: boolean; stream_url: string; youtube_url: string | null; description: string; }
export interface UpNextItem { title: string; artist: string; duration: number; artwork: string; source: string; }
export interface ScheduleBlock { name: string; description: string; start: string; end: string; on_now: boolean; next: boolean; }
export interface Schedule { timezone: string; now: string | null; next_switch: string | null; today: ScheduleBlock[]; }
export interface Track { id: number; title: string; artist: string; album: string; genre: string; duration: number; artwork: string; audio: string; }
export interface Skin { id: string; name: string; time: 'dawn' | 'afternoon' | 'dusk' | 'night'; enabled: boolean; order: number; accent?: string | null; video?: string | null; image?: string | null; thumbnail?: string | null; ambience?: Record<string, number>; default?: boolean; source: 'bundled' | 'operator'; }

async function get<T>(path: string, timeout = 8000): Promise<T> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout);
  try { const r = await fetch(API + path, { signal: c.signal, cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return (await r.json()) as T; } finally { clearTimeout(t); }
}
export const api = {
  nowPlaying: (s: string) => get<NowPlaying>(`/v1/now-playing?station=${s}`).then(n => ({ ...n, artwork: abs(n.artwork) })),
  upNext: (s: string) => get<{ items: UpNextItem[] }>(`/v1/up-next?station=${s}`).then(d => d.items.map(i => ({ ...i, artwork: abs(i.artwork) }))),
  stations: () => get<{ stations: Station[] }>('/v1/stations').then(d => d.stations.map(s => ({ ...s, stream_url: abs(s.stream_url) }))),
  schedule: (s: string) => get<Schedule>(`/v1/schedule?station=${s}`),
  tracks: (s: string) => get<{ tracks: Track[] }>(`/v1/tracks?station=${s}`).then(d => d.tracks.map(t => ({ ...t, artwork: abs(t.artwork), audio: abs(t.audio) }))),
  skins: () => get<{ skins: Skin[]; default: string | null }>('/v1/skins').then(d => ({ skins: d.skins.map(s => ({ ...s, video: abs(s.video), image: abs(s.image), thumbnail: abs(s.thumbnail) })), def: d.default })),
};
export const fmt = (s?: number | null) => { if (s == null || isNaN(s)) return '--:--'; s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
