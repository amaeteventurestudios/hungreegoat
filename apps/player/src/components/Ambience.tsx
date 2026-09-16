/* One looping <audio> per ambient sound. Each channel's own slider sets its level within
   the mix; the Ambience master then scales all of them together (individual channel gain
   -> Ambience Master Gain -> output) without ever touching the Music bus in
   PlayerContext.tsx, which is a completely separate <audio> element. */
import { useEffect, useRef } from 'react';
import { usePlayer } from '../store/PlayerContext';
import { AMBIENCE } from '../lib/skins';
export default function Ambience() {
  const { s } = usePlayer();
  const refs = useRef<Record<string, HTMLAudioElement | null>>({});
  useEffect(() => { const master = s.muted ? 0 : s.ambienceMaster;
    for (const a of AMBIENCE) { const el = refs.current[a.key]; if (!el) continue; const channel = (s.ambience[a.key] || 0) / 100; const v = Math.min(1, channel * master);
      el.volume = v; if (channel > 0 && master > 0 && s.started) { if (el.paused) el.play().catch(() => {}); } else if (!el.paused) el.pause(); } }, [s.ambience, s.ambienceMaster, s.started, s.muted]);
  return <>{AMBIENCE.map(a => <audio key={a.key} ref={el => { refs.current[a.key] = el; }} src={`/assets/ambience/${a.file}`} loop preload="none" />)}</>;
}
