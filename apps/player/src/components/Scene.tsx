/* Full-screen looping scene with cross-fade (original interaction model) + time-of-day light treatment. */
import { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../store/PlayerContext';
import { sceneAsset } from '../lib/skins';
export default function Scene() {
  const { s } = usePlayer();
  const skin = s.skins.find(x => x.id === s.skinId) || s.skins[0];
  const asset = sceneAsset(skin, s.time);
  const layerId = skin ? `${skin.id}:${asset.video || asset.image || ''}` : '';
  const [layers, setLayers] = useState<{ id: string; video?: string | null; image?: string | null; thumbnail?: string | null }[]>(skin ? [{ id: layerId, video: asset.video, image: asset.image, thumbnail: skin.thumbnail }] : []);
  const timer = useRef<number>();
  useEffect(() => { if (!skin) return; setLayers(l => l.some(x => x.id === layerId) ? l : [...l, { id: layerId, video: asset.video, image: asset.image, thumbnail: skin.thumbnail }]); clearTimeout(timer.current); timer.current = window.setTimeout(() => setLayers(l => l.filter(x => x.id === layerId)), 1400); }, [layerId]); // eslint-disable-line
  return (
    <div className={`scene time-${s.time}`} aria-hidden="true">
      {layers.map(l => (
        <div key={l.id} className={`layer ${l.id === layerId ? 'in' : 'out'}`}>
          {/* Portrait/narrower-than-16:9 viewports only (see the max-aspect-ratio:16/9
              rule in index.scss): the source animations are 16:9 and would otherwise be
              cropped heavily left/right by object-fit:cover to fill a much taller box.
              This blurred copy of the skin's own thumbnail — a static image, not a
              second decoded video — fills the resulting letterbox bars so they read as
              an intentional background treatment instead of empty space, without
              doubling video decode/GPU cost on mobile. Invisible (opacity:0, see CSS)
              outside that breakpoint, where .scene video/img already covers the box.*/}
          {l.thumbnail && <div className="layer-bg" style={{ backgroundImage: `url(${l.thumbnail})` }} />}
          {l.video ? <video src={l.video} autoPlay loop muted playsInline preload="auto" />
            : l.image ? <img src={l.image} alt="" />
            /* No asset for this scene yet: an honest "not uploaded" card, never another scene's footage. */
            : <div className="scene-pending" style={{ background: skin?.accent ? `${skin.accent}22` : undefined }}><b>{skin?.name}</b><small>Scene art not uploaded yet</small></div>}
        </div>
      ))}
      <div className="light" />
      <div className="vignette" />
    </div>
  );
}
