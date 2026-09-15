/* One looping <audio> per ambient sound, mixed under the music at its own volume (original model). */
import { useEffect, useRef } from 'react';
import { usePlayer } from '../store/PlayerContext';
import { AMBIENCE } from '../lib/skins';
export default function Ambience() {
  const { s } = usePlayer();
  const refs = useRef<Record<string, HTMLAudioElement | null>>({});
  useEffect(() => { for (const a of AMBIENCE) { const el = refs.current[a.key]; if (!el) continue; const v = (s.ambience[a.key] || 0) / 100; el.volume = Math.min(1, v * (s.muted ? 0 : 1)); if (v > 0 && s.started) { if (el.paused) el.play().catch(() => {}); } else if (!el.paused) el.pause(); } }, [s.ambience, s.started, s.muted]);
  return <>{AMBIENCE.map(a => <audio key={a.key} ref={el => { refs.current[a.key] = el; }} src={`/assets/ambience/${a.file}`} loop preload="none" />)}</>;
}
