/* Player state + audio engine. HUNGREE Goat Music Player is a single, independent,
   on-demand catalog player — it never touches the live broadcast, the YouTube stream or
   another listener's playback. "Listen Live on YouTube" is a plain outbound link, not a
   second playback engine. */
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { api, type Station, type Track, type Skin } from '../lib/api';
import { autoTime, mergeSkins, pickSkin, type TimeOfDay } from '../lib/skins';

export type Conn = 'idle' | 'connecting' | 'playing' | 'buffering' | 'reconnecting' | 'paused' | 'blocked';
export interface State {
  started: boolean; conn: Conn; playing: boolean; volume: number; muted: boolean;
  time: TimeOfDay; timeAuto: boolean; skins: Skin[]; skinId: string | null; defaultSkin: string | null;
  /* Two independent buses: `volume` is the Music master, `ambienceMaster` scales every
     individual ambience channel in `ambience` together (see Ambience.tsx). Neither ever
     touches the other. */
  ambience: Record<string, number>; ambienceMaster: number; station: string; stations: Station[];
  tracks: Track[]; index: number; shuffle: boolean; repeat: boolean; queueHistory: number[]; elapsed: number;
  panel: 'none' | 'mix' | 'scenes' | 'focus' | 'library' | 'credits';
  /* Explicit so the UI can say why it's stuck instead of "Loading catalog..." forever:
     'loading' only until the very first attempt resolves either way, then 'ready' once any
     tracks have ever loaded, or 'unavailable' while every attempt so far has failed. */
  catalogState: 'loading' | 'ready' | 'unavailable';
}
type Action = { type: 'set'; patch: Partial<State> } | { type: 'ambience'; key: string; value: number } | { type: 'skin'; id: string } | { type: 'time'; time: TimeOfDay | 'auto' } | { type: 'track-go'; index: number } | { type: 'track-step'; dir: 1 | -1 };
const ls = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const init: State = {
  started: false, conn: 'idle', playing: false, volume: +ls('hg.vol', '0.85'), muted: false,
  time: autoTime(), timeAuto: ls('hg.timeAuto', '1') === '1', skins: mergeSkins([]), skinId: ls('hg.skin', '') || null, defaultSkin: null,
  // Ambience always starts silent and user-chosen, every load — never restored from a prior
  // session's localStorage value, and never auto-populated from a scene's suggested mix
  // (see the 'skin' reducer case and the skins-load effect below).
  ambience: {}, ambienceMaster: 0, station: ls('hg.station', 'lofi'), stations: [],
  tracks: [], index: 0, shuffle: ls('hg.shuffle', '0') === '1', repeat: false, queueHistory: [], elapsed: 0, panel: 'none', catalogState: 'loading',
};
function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'set': return { ...s, ...a.patch };
    case 'ambience': return { ...s, ambience: { ...s.ambience, [a.key]: a.value } };
    // A scene is visual only - it never touches the user's ambience mix, even if the skin
    // data carries a suggested `ambience` preset (that preset is not applied anywhere).
    case 'skin': return { ...s, skinId: a.id };
    /* Time of day is purely a lighting treatment (see Scene.tsx's .light overlay) — it never
       changes which scene/skin is selected, and changing the scene never touches time. */
    case 'time': return a.time === 'auto' ? { ...s, timeAuto: true, time: autoTime() } : { ...s, time: a.time, timeAuto: false };
    case 'track-go': return { ...s, index: a.index, playing: true, elapsed: 0 };
    case 'track-step': { if (!s.tracks.length) return s; let i = s.index; if (s.shuffle) { const pool = s.tracks.map((_, n) => n).filter(n => n !== s.index && !s.queueHistory.slice(-10).includes(n)); i = pool.length ? pool[Math.floor(Math.random() * pool.length)] : Math.floor(Math.random() * s.tracks.length); } else i = (s.index + a.dir + s.tracks.length) % s.tracks.length; return { ...s, index: i, playing: true, elapsed: 0, queueHistory: [...s.queueHistory, s.index].slice(-50) }; }
  }
}
interface Ctx { s: State; d: (a: Action) => void; audio: React.RefObject<HTMLAudioElement>; play: () => void; pause: () => void; toggle: () => void; }
const C = createContext<Ctx | null>(null);
export const usePlayer = () => { const c = useContext(C); if (!c) throw new Error('no player ctx'); return c; };

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [s, d] = useReducer(reducer, init);
  const audio = useRef<HTMLAudioElement>(null);
  const stateRef = useRef(s); stateRef.current = s;

  /* ---- catalog engine: (re)load the current track ---- */
  useEffect(() => { if (!s.tracks.length) return; const e = audio.current!; const t = s.tracks[s.index]; if (!t) return; if (e.dataset.id !== String(t.id)) { e.src = t.audio; e.dataset.id = String(t.id); e.load(); } if (s.playing) e.play().catch(() => d({ type: 'set', patch: { conn: 'blocked', playing: false } })); else e.pause(); if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: 'HUNGREE Goat Music Player', artwork: [{ src: t.artwork, sizes: '800x800', type: 'image/jpeg' }] }); }, [s.index, s.playing, s.tracks]);
  useEffect(() => { const e = audio.current!;
    e.addEventListener('ended', () => { const st = stateRef.current; if (st.repeat) { e.currentTime = 0; e.play().catch(() => {}); } else d({ type: 'track-step', dir: 1 }); });
    e.addEventListener('timeupdate', () => d({ type: 'set', patch: { elapsed: e.currentTime } }));
    e.addEventListener('playing', () => d({ type: 'set', patch: { conn: 'playing' } }));
    e.addEventListener('pause', () => { if (stateRef.current.playing === false) d({ type: 'set', patch: { conn: 'paused' } }); });
    e.addEventListener('waiting', () => d({ type: 'set', patch: { conn: 'buffering' } })); // eslint-disable-next-line
  }, []);
  /* ---- volume ---- */
  useEffect(() => { const v = s.muted ? 0 : s.volume; if (audio.current) audio.current.volume = v; try { localStorage.setItem('hg.vol', String(s.volume)); } catch {} }, [s.volume, s.muted]);
  useEffect(() => { try { localStorage.setItem('hg.station', s.station); localStorage.setItem('hg.shuffle', s.shuffle ? '1' : '0'); localStorage.setItem('hg.timeAuto', s.timeAuto ? '1' : '0'); if (s.skinId) localStorage.setItem('hg.skin', s.skinId); } catch {} }, [s.station, s.shuffle, s.timeAuto, s.skinId]);
  // hg.ambVol previously persisted the ambience master across sessions, which is exactly what
  // Issue #1 forbids (a returning visitor got audible ambience with no action of their own).
  // Drop any leftover value so it can never resurrect old audible defaults.
  useEffect(() => { try { localStorage.removeItem('hg.ambVol'); } catch {} }, []);
  /* ---- stations (for the station switcher and the secondary "Listen Live on YouTube" link only) ---- */
  useEffect(() => { let stop = false; let timer: number;
    const tick = async () => { if (stop) return; try { const stations = await api.stations(); if (!stop) d({ type: 'set', patch: { stations } }); } catch { /* keep the last known list */ } timer = window.setTimeout(tick, 60000); };
    tick(); return () => { stop = true; clearTimeout(timer); }; }, []);
  /* ---- catalog: the real fix is that a transient failure must recover on its own, not just "have retry code" ---- */
  useEffect(() => { let stop = false; let attempt = 0; let timer: number;
    const load = () => { api.tracks(s.station).then(tracks => { if (!stop) d({ type: 'set', patch: { tracks, index: 0, catalogState: 'ready' } }); })
      .catch(() => { if (!stop) { d({ type: 'set', patch: { catalogState: 'unavailable' } }); const wait = Math.min(30000, 2000 * 2 ** attempt++); timer = window.setTimeout(load, wait); } }); };
    d({ type: 'set', patch: { catalogState: 'loading' } }); load(); return () => { stop = true; clearTimeout(timer); }; }, [s.station]);
  useEffect(() => { api.skins().then(({ skins, def }) => { const merged = mergeSkins(skins); const st = stateRef.current; const keep = st.skinId && merged.find(x => x.id === st.skinId); const sk = keep ? merged.find(x => x.id === st.skinId)! : pickSkin(merged, def); d({ type: 'set', patch: { skins: merged, defaultSkin: def, skinId: sk ? sk.id : null } }); }).catch(() => { const sk = pickSkin(stateRef.current.skins, null); if (sk && !stateRef.current.skinId) d({ type: 'set', patch: { skinId: sk.id } }); }); }, []);
  useEffect(() => { const id = setInterval(() => { if (stateRef.current.timeAuto) { const t = autoTime(); if (t !== stateRef.current.time) d({ type: 'time', time: 'auto' }); } }, 60000); return () => clearInterval(id); }, []);
  useEffect(() => { if ('mediaSession' in navigator) { navigator.mediaSession.setActionHandler('play', () => play()); navigator.mediaSession.setActionHandler('pause', () => pause()); navigator.mediaSession.setActionHandler('nexttrack', () => d({ type: 'track-step', dir: 1 })); navigator.mediaSession.setActionHandler('previoustrack', () => d({ type: 'track-step', dir: -1 })); } // eslint-disable-next-line
  }, []);

  const play = () => { d({ type: 'set', patch: { started: true, playing: true } }); };
  const pause = () => d({ type: 'set', patch: { playing: false } });
  const toggle = () => (stateRef.current.playing ? pause() : play());
  const value = useMemo(() => ({ s, d, audio, play, pause, toggle }), [s]); // eslint-disable-line
  return <C.Provider value={value}><audio ref={audio} preload="auto" />{children}</C.Provider>;
}
