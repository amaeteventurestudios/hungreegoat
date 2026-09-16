/* HUNGREE Goat public read-only API — the player never touches control endpoints. */
export const API = (import.meta.env.VITE_HG_API_BASE || 'https://api.hungreegoat.com').replace(/\/$/, '');
export const HOME = import.meta.env.VITE_HG_HOME_URL || 'https://hungreegoat.com';
export const YT_ENV = import.meta.env.VITE_HG_YOUTUBE_URL || '';
export const abs = (p?: string | null) => (p && p.startsWith('/') ? API + p : p || '');

export interface Station { id: string; name: string; short: string; genre: string; tags: string[]; status: 'live' | 'coming_soon' | 'offline'; live: boolean; stream_url: string; youtube_url: string | null; description: string; }
export interface Track { id: number; title: string; artist: string; album: string; genre: string; duration: number; artwork: string; audio: string; }
export type TimeVariant = { video?: string | null; image?: string | null };
export interface Skin {
  id: string; name: string; description?: string; enabled: boolean; order: number; accent?: string | null;
  video?: string | null; image?: string | null; thumbnail?: string | null;
  /* A skin is a visual scene, independent of time of day. time_mode 'variants' means the
     operator attached optional per-time-of-day assets on top of the same scene — it never
     means the scene itself changes when the time changes. */
  time_mode: 'always' | 'variants'; time_variants?: Partial<Record<'dawn' | 'afternoon' | 'dusk' | 'night', TimeVariant>>;
  ambience?: Record<string, number>; default?: boolean; source: 'built-in' | 'custom'; overridden?: boolean;
}

async function get<T>(path: string, timeout = 8000): Promise<T> {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout);
  try { const r = await fetch(API + path, { signal: c.signal, cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return (await r.json()) as T; } finally { clearTimeout(t); }
}
export const api = {
  stations: () => get<{ stations: Station[] }>('/v1/stations').then(d => d.stations.map(s => ({ ...s, stream_url: abs(s.stream_url) }))),
  tracks: (s: string) => get<{ tracks: Track[] }>(`/v1/tracks?station=${s}`).then(d => d.tracks.map(t => ({ ...t, artwork: abs(t.artwork), audio: abs(t.audio) }))),
  skins: () => get<{ skins: Skin[]; default: string | null }>('/v1/skins').then(d => ({
    skins: d.skins.map(s => ({
      ...s, video: abs(s.video), image: abs(s.image), thumbnail: abs(s.thumbnail),
      time_variants: s.time_variants && Object.fromEntries(Object.entries(s.time_variants).map(([k, v]) => [k, { video: abs(v?.video), image: abs(v?.image) }])),
    })), def: d.default,
  })),
};
export const fmt = (s?: number | null) => { if (s == null || isNaN(s)) return '--:--'; s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
