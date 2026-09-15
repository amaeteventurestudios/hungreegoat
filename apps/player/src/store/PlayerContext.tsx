/* Player state + audio engine. Live mode = the shared broadcast (listener-side controls only);
   Explore mode = the listener's own playback through the public catalog. */
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { api, type NowPlaying, type Station, type Track, type UpNextItem, type Schedule, type Skin } from '../lib/api';
import { autoTime, mergeSkins, pickSkin, type TimeOfDay } from '../lib/skins';

export type Mode = 'live' | 'explore';
export type Conn = 'idle' | 'connecting' | 'playing' | 'buffering' | 'reconnecting' | 'paused' | 'blocked';
export interface State {
  mode: Mode; started: boolean; conn: Conn; playing: boolean; volume: number; muted: boolean;
  time: TimeOfDay; timeAuto: boolean; skins: Skin[]; skinId: string | null; defaultSkin: string | null;
  ambience: Record<string, number>; station: string; stations: Station[]; now: NowPlaying | null; upNext: UpNextItem[]; schedule: Schedule | null; apiOk: boolean;
  tracks: Track[]; index: number; shuffle: boolean; repeat: boolean; queueHistory: number[]; exploreElapsed: number;
  panel: 'none' | 'mix' | 'focus' | 'library' | 'credits' | 'skins';
}
type Action = { type: 'set'; patch: Partial<State> } | { type: 'ambience'; key: string; value: number } | { type: 'skin'; id: string } | { type: 'time'; time: TimeOfDay | 'auto' } | { type: 'explore-go'; index: number } | { type: 'explore-step'; dir: 1 | -1 };
const ls = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const init: State = {
  mode: (ls('hg.mode', 'live') as Mode), started: false, conn: 'idle', playing: false, volume: +ls('hg.vol', '0.85'), muted: false,
  time: autoTime(), timeAuto: ls('hg.timeAuto', '1') === '1', skins: mergeSkins([]), skinId: ls('hg.skin', '') || null, defaultSkin: null,
  ambience: {}, station: ls('hg.station', 'lofi'), stations: [], now: null, upNext: [], schedule: null, apiOk: true,
  tracks: [], index: 0, shuffle: ls('hg.shuffle', '0') === '1', repeat: false, queueHistory: [], exploreElapsed: 0, panel: 'none',
};
function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'set': return { ...s, ...a.patch };
    case 'ambience': return { ...s, ambience: { ...s.ambience, [a.key]: a.value } };
    case 'skin': { const sk = s.skins.find(x => x.id === a.id); return { ...s, skinId: a.id, ambience: sk && sk.ambience && Object.keys(sk.ambience).length ? { ...sk.ambience } : s.ambience }; }
    /* Time of day is purely a lighting treatment (see Scene.tsx's .light overlay) — it never
       changes which scene/skin is selected. */
    case 'time': return a.time === 'auto' ? { ...s, timeAuto: true, time: autoTime() } : { ...s, time: a.time, timeAuto: false };
    case 'explore-go': return { ...s, index: a.index, playing: true, exploreElapsed: 0 };
    case 'explore-step': { if (!s.tracks.length) return s; let i = s.index; if (s.shuffle) { const pool = s.tracks.map((_, n) => n).filter(n => n !== s.index && !s.queueHistory.slice(-10).includes(n)); i = pool.length ? pool[Math.floor(Math.random() * pool.length)] : Math.floor(Math.random() * s.tracks.length); } else i = (s.index + a.dir + s.tracks.length) % s.tracks.length; return { ...s, index: i, playing: true, exploreElapsed: 0, queueHistory: [...s.queueHistory, s.index].slice(-50) }; }
  }
}
interface Ctx { s: State; d: (a: Action) => void; live: React.RefObject<HTMLAudioElement>; explore: React.RefObject<HTMLAudioElement>; play: () => void; pause: () => void; toggle: () => void; setMode: (m: Mode) => void; }
const C = createContext<Ctx | null>(null);
export const usePlayer = () => { const c = useContext(C); if (!c) throw new Error('no player ctx'); return c; };

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [s, d] = useReducer(reducer, init);
  const live = useRef<HTMLAudioElement>(null), explore = useRef<HTMLAudioElement>(null);
  const gen = useRef(0), retry = useRef(0);
  const stateRef = useRef(s); stateRef.current = s;

  /* ---- live stream engine ---- */
  const startLive = () => { const a = live.current!; const g = ++gen.current; retry.current = 0; a.src = `${(stateRef.current.stations.find(x => x.id === stateRef.current.station)?.stream_url) || ''}?t=${Date.now()}`; a.load(); d({ type: 'set', patch: { conn: 'connecting', playing: true } }); a.play().catch(() => { if (g === gen.current) d({ type: 'set', patch: { conn: 'blocked', playing: false } }); }); setTimeout(() => { if (g === gen.current && stateRef.current.conn === 'connecting') startLive(); }, 10000); };
  const stopLive = () => { gen.current++; const a = live.current!; a.pause(); a.removeAttribute('src'); a.load(); d({ type: 'set', patch: { conn: 'paused', playing: false } }); };
  useEffect(() => { const a = live.current!; const fail = () => { const st = stateRef.current; if (st.mode !== 'live' || !st.playing) return; d({ type: 'set', patch: { conn: 'reconnecting' } }); const g = gen.current; const wait = Math.min(15000, 1000 * 2 ** retry.current++); setTimeout(() => { if (g === gen.current && stateRef.current.playing) startLive(); }, wait); };
    a.addEventListener('playing', () => { retry.current = 0; d({ type: 'set', patch: { conn: 'playing' } }); }); a.addEventListener('waiting', () => { if (stateRef.current.conn === 'playing') d({ type: 'set', patch: { conn: 'buffering' } }); });
    a.addEventListener('error', fail); a.addEventListener('stalled', () => { if (stateRef.current.conn === 'playing') fail(); }); a.addEventListener('ended', fail);
    const e = explore.current!; e.addEventListener('ended', () => { const st = stateRef.current; if (st.repeat) { e.currentTime = 0; e.play().catch(() => {}); } else d({ type: 'explore-step', dir: 1 }); });
    e.addEventListener('timeupdate', () => d({ type: 'set', patch: { exploreElapsed: e.currentTime } }));
    e.addEventListener('playing', () => d({ type: 'set', patch: { conn: 'playing' } })); e.addEventListener('pause', () => { if (stateRef.current.mode === 'explore' && stateRef.current.playing === false) d({ type: 'set', patch: { conn: 'paused' } }); });
    e.addEventListener('waiting', () => d({ type: 'set', patch: { conn: 'buffering' } })); // eslint-disable-next-line
  }, []);
  /* ---- explore engine: (re)load the current track ---- */
  useEffect(() => { if (s.mode !== 'explore' || !s.tracks.length) return; const e = explore.current!; const t = s.tracks[s.index]; if (!t) return; if (e.dataset.id !== String(t.id)) { e.src = t.audio; e.dataset.id = String(t.id); e.load(); } if (s.playing) e.play().catch(() => d({ type: 'set', patch: { conn: 'blocked', playing: false } })); else e.pause(); if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: 'HUNGREE Goat · Explore', artwork: [{ src: t.artwork, sizes: '800x800', type: 'image/jpeg' }] }); }, [s.mode, s.index, s.playing, s.tracks]);
  /* ---- volume ---- */
  useEffect(() => { const v = s.muted ? 0 : s.volume; if (live.current) live.current.volume = v; if (explore.current) explore.current.volume = v; try { localStorage.setItem('hg.vol', String(s.volume)); } catch {} }, [s.volume, s.muted]);
  useEffect(() => { try { localStorage.setItem('hg.mode', s.mode); localStorage.setItem('hg.station', s.station); localStorage.setItem('hg.shuffle', s.shuffle ? '1' : '0'); localStorage.setItem('hg.timeAuto', s.timeAuto ? '1' : '0'); if (s.skinId) localStorage.setItem('hg.skin', s.skinId); } catch {} }, [s.mode, s.station, s.shuffle, s.timeAuto, s.skinId]);
  /* ---- data polling ---- */
  useEffect(() => { let stop = false; let timer: number;
    const tick = async () => { if (stop) return; try { const [now, upNext, stations, schedule] = await Promise.all([api.nowPlaying(s.station), api.upNext(s.station), api.stations(), api.schedule(s.station)]); if (!stop) { d({ type: 'set', patch: { now, upNext, stations, schedule, apiOk: true } }); if (stateRef.current.mode === 'live' && 'mediaSession' in navigator && now.title) navigator.mediaSession.metadata = new MediaMetadata({ title: now.title, artist: now.artist || '', album: now.station, artwork: [{ src: now.artwork, sizes: '800x800', type: 'image/jpeg' }] }); } } catch { if (!stop) d({ type: 'set', patch: { apiOk: false } }); } timer = window.setTimeout(tick, document.hidden ? 20000 : 6000); };
    tick(); return () => { stop = true; clearTimeout(timer); }; }, [s.station]);
  useEffect(() => { let stop = false; let attempt = 0; let timer: number;
    const load = () => { api.tracks(s.station).then(tracks => { if (!stop) d({ type: 'set', patch: { tracks, index: 0 } }); })
      .catch(() => { if (!stop) { const wait = Math.min(30000, 2000 * 2 ** attempt++); timer = window.setTimeout(load, wait); } }); };
    load(); return () => { stop = true; clearTimeout(timer); }; }, [s.station]);
  useEffect(() => { api.skins().then(({ skins, def }) => { const merged = mergeSkins(skins); const st = stateRef.current; const keep = st.skinId && merged.find(x => x.id === st.skinId); const sk = keep ? merged.find(x => x.id === st.skinId)! : pickSkin(merged, def); d({ type: 'set', patch: { skins: merged, defaultSkin: def, skinId: sk ? sk.id : null, ambience: sk && sk.ambience && !keep ? { ...sk.ambience } : st.ambience } }); }).catch(() => { const sk = pickSkin(stateRef.current.skins, null); if (sk && !stateRef.current.skinId) d({ type: 'set', patch: { skinId: sk.id, ambience: { ...(sk.ambience || {}) } } }); }); }, []);
  useEffect(() => { const id = setInterval(() => { if (stateRef.current.timeAuto) { const t = autoTime(); if (t !== stateRef.current.time) d({ type: 'time', time: 'auto' }); } }, 60000); return () => clearInterval(id); }, []);
  useEffect(() => { if ('mediaSession' in navigator) { navigator.mediaSession.setActionHandler('play', () => play()); navigator.mediaSession.setActionHandler('pause', () => pause()); navigator.mediaSession.setActionHandler('nexttrack', () => { if (stateRef.current.mode === 'explore') d({ type: 'explore-step', dir: 1 }); }); navigator.mediaSession.setActionHandler('previoustrack', () => { if (stateRef.current.mode === 'explore') d({ type: 'explore-step', dir: -1 }); }); } // eslint-disable-next-line
  }, []);

  const play = () => { const st = stateRef.current; d({ type: 'set', patch: { started: true } }); if (st.mode === 'live') startLive(); else d({ type: 'set', patch: { playing: true } }); };
  const pause = () => { const st = stateRef.current; if (st.mode === 'live') stopLive(); else d({ type: 'set', patch: { playing: false } }); };
  const toggle = () => (stateRef.current.playing ? pause() : play());
  const setMode = (m: Mode) => { const st = stateRef.current; if (m === st.mode) return; const wasPlaying = st.playing; if (st.mode === 'live') { gen.current++; live.current!.pause(); live.current!.removeAttribute('src'); live.current!.load(); } else { explore.current!.pause(); } d({ type: 'set', patch: { mode: m, playing: false, conn: 'idle' } }); if (wasPlaying) setTimeout(() => { if (m === 'live') startLive(); else d({ type: 'set', patch: { playing: true } }); }, 50); };
  const value = useMemo(() => ({ s, d, live, explore, play, pause, toggle, setMode }), [s]); // eslint-disable-line
  return <C.Provider value={value}><audio ref={live} preload="none" /><audio ref={explore} preload="auto" />{children}</C.Provider>;
}
