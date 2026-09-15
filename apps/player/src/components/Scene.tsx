/* Full-screen looping scene with cross-fade (original interaction model) + time-of-day light treatment. */
import { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../store/PlayerContext';
export default function Scene() {
  const { s } = usePlayer();
  const skin = s.skins.find(x => x.id === s.skinId) || s.skins[0];
  const [layers, setLayers] = useState<{ id: string; video?: string | null; image?: string | null }[]>(skin ? [{ id: skin.id, video: skin.video, image: skin.image }] : []);
  const timer = useRef<number>();
  useEffect(() => { if (!skin) return; setLayers(l => l.some(x => x.id === skin.id) ? l : [...l, { id: skin.id, video: skin.video, image: skin.image }]); clearTimeout(timer.current); timer.current = window.setTimeout(() => setLayers(l => l.filter(x => x.id === skin.id)), 1400); }, [skin?.id]); // eslint-disable-line
  return (
    <div className={`scene time-${s.time}`} aria-hidden="true">
      {layers.map(l => (
        <div key={l.id} className={`layer ${skin && l.id === skin.id ? 'in' : 'out'}`}>
          {l.video ? <video src={l.video} autoPlay loop muted playsInline preload="auto" /> : l.image ? <img src={l.image} alt="" /> : null}
        </div>
      ))}
      <div className="light" />
      <div className="vignette" />
    </div>
  );
}
