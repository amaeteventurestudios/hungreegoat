/* The right-hand modifier board: a dedicated, discoverable Scene selector (the physical
   environment) kept fully independent of Time of day (a pure lighting treatment — see
   Scene.tsx), a Mix panel (volume + ambient sounds), and Focus (timer + to-do). */
import { useEffect } from 'react';
import { usePlayer } from '../store/PlayerContext';
import { AMBIENCE, TIMES, TIME_LABEL } from '../lib/skins';
import FocusPanel from './FocusPanel';
export default function Mixer() {
  const { s, d } = usePlayer();
  const open = (p: typeof s.panel) => d({ type: 'set', patch: { panel: s.panel === p ? 'none' : p } });
  const close = () => d({ type: 'set', patch: { panel: 'none' } });
  const skin = s.skins.find(x => x.id === s.skinId);
  const isModifierPanel = s.panel === 'scenes' || s.panel === 'mix' || s.panel === 'focus';
  // Esc always has an obvious way out of whichever of these three panels is open, on desktop
  // keyboards; the visible X below covers desktop, mobile and anyone without a keyboard.
  useEffect(() => {
    if (!isModifierPanel) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isModifierPanel]); // eslint-disable-line
  return (
    <>
    {/* Rendered as a sibling of .modifier, not a child: .modifier has backdrop-filter, which
        creates its own containing block for position:fixed descendants, so a scrim nested
        inside it would only ever cover that small icon pill instead of the real viewport. */}
    {isModifierPanel && <div className="modifier-scrim" onClick={close} aria-hidden="true" />}
    <div className={`modifier ${s.panel === 'scenes' ? 'scenes' : ''} ${s.panel === 'mix' ? 'mood' : ''} ${s.panel === 'focus' ? 'focus' : ''}`}>
      <div className="modifier__icon"><button className={`icon ${s.panel === 'scenes' ? 'active' : ''}`} onClick={() => open('scenes')} aria-label="Choose a scene" title="Scene">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 16l5-6 4 5 3-4 6 8" /><rect x="3" y="4" width="18" height="16" rx="2.5" /></svg></button>
        {s.panel === 'scenes' && (
          <div className="modifierBox scenesBox">
            <div className="modifierBox-h"><h4>Scene<span className="hint2">Pick the physical environment</span></h4><button className="x" onClick={close} aria-label="Close scene panel">✕</button></div>
            <div className="skins">{s.skins.map(x => { const hasArt = !!(x.video || x.image); return <button key={x.id} className={`skin ${x.id === s.skinId ? 'on' : ''}`} onClick={() => d({ type: 'skin', id: x.id })} title={hasArt ? x.name : `${x.name}: no scene art uploaded yet`}>
              {x.thumbnail ? <img src={x.thumbnail} alt="" /> : x.video ? <video src={x.video} muted loop playsInline /> : <span className="ph" style={{ background: x.accent || '#22344a' }} />}
              <b>{x.name}</b>{!hasArt && <small className="placeholderTag">No art yet</small>}</button>; })}</div>
            <h5>Time of day<span className="hint2">Lighting only, the scene never changes</span></h5>
            <div className="times">{TIMES.map(t => <button key={t} className={s.time === t ? 'on' : ''} onClick={() => d({ type: 'time', time: t })}>{TIME_LABEL[t]}</button>)}<button className={s.timeAuto ? 'on' : ''} onClick={() => d({ type: 'time', time: 'auto' })} title="Follow the clock">Auto</button></div>
          </div>)}
      </div>
      <div className="modifier__icon"><button className={`icon ${s.panel === 'mix' ? 'active' : ''}`} onClick={() => open('mix')} aria-label="Sound mixer" title="Mix">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" fill="currentColor" /><circle cx="15" cy="12" r="2" fill="currentColor" /><circle cx="7" cy="18" r="2" fill="currentColor" /></svg></button>
        {s.panel === 'mix' && (
          <div className="modifierBox">
            <div className="modifierBox-h"><h4>Mix<span className="hint2">Music and ambience are independent</span></h4><button className="x" onClick={close} aria-label="Close mixer panel">✕</button></div>
            <div className="volume"><span className="lbl">Music</span><input type="range" min={0} max={100} value={Math.round(s.volume * 100)} onChange={e => d({ type: 'set', patch: { volume: +e.target.value / 100, muted: false } })} aria-label="Music volume" /><b>{Math.round(s.volume * 100)}%</b></div>
            <div className="volume"><span className="lbl">Ambience</span><input type="range" min={0} max={100} value={Math.round(s.ambienceMaster * 100)} onChange={e => d({ type: 'set', patch: { ambienceMaster: +e.target.value / 100 } })} aria-label="Ambience master volume" /><b>{Math.round(s.ambienceMaster * 100)}%</b></div>
            <h5>Ambient sounds</h5>
            <div className="backgroundNoise">{AMBIENCE.map(a => (
              <div key={a.key} className={`noise-option ${(s.ambience[a.key] || 0) > 0 ? 'on' : ''}`}>
                <button className="tgl" onClick={() => d({ type: 'ambience', key: a.key, value: (s.ambience[a.key] || 0) > 0 ? 0 : 35 })} aria-pressed={(s.ambience[a.key] || 0) > 0}>{a.label}</button>
                <input type="range" min={0} max={100} value={s.ambience[a.key] || 0} onChange={e => d({ type: 'ambience', key: a.key, value: +e.target.value })} aria-label={`${a.label} volume`} />
              </div>))}</div>
            {skin && <div className="hint">Scene: {skin.name}{skin.source === 'custom' ? ' · HUNGREE Goat skin' : ''}</div>}
          </div>)}
      </div>
      <div className="modifier__icon"><button className={`icon ${s.panel === 'focus' ? 'active' : ''}`} onClick={() => open('focus')} aria-label="Focus mode" title="Focus">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 19V5a1 1 0 0 1 1-1h6v15H5a1 1 0 0 1-1 1zM13 19V4h6a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1z" /></svg></button>
        {s.panel === 'focus' && <div className="modifierBox"><div className="modifierBox-h"><h4>Focus Mode</h4><button className="x" onClick={close} aria-label="Close focus panel">✕</button></div><FocusPanel /></div>}
      </div>
    </div>
    </>
  );
}
