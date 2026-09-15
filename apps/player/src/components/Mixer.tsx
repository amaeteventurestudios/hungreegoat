/* The right-hand modifier board from the original: Mix (volume + ambient sliders + skins) and Focus (timer + to-do). */
import { usePlayer } from '../store/PlayerContext';
import { AMBIENCE, TIMES, TIME_LABEL } from '../lib/skins';
import FocusPanel from './FocusPanel';
export default function Mixer() {
  const { s, d } = usePlayer();
  const open = (p: typeof s.panel) => d({ type: 'set', patch: { panel: s.panel === p ? 'none' : p } });
  const skin = s.skins.find(x => x.id === s.skinId);
  return (
    <div className={`modifier ${s.panel === 'mix' ? 'mood' : ''} ${s.panel === 'focus' ? 'focus' : ''}`}>
      <div className="modifier__icon"><button className={`icon ${s.panel === 'mix' ? 'active' : ''}`} onClick={() => open('mix')} aria-label="Sound mixer" title="Mix">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" fill="currentColor" /><circle cx="15" cy="12" r="2" fill="currentColor" /><circle cx="7" cy="18" r="2" fill="currentColor" /></svg></button>
        {s.panel === 'mix' && (
          <div className="modifierBox">
            <h4>Scene</h4>
            <div className="skins">{s.skins.map(x => <button key={x.id} className={`skin ${x.id === s.skinId ? 'on' : ''}`} onClick={() => d({ type: 'skin', id: x.id })} title={x.name}>{x.thumbnail ? <img src={x.thumbnail} alt="" /> : x.video ? <video src={x.video} muted loop playsInline /> : <span className="ph" style={{ background: x.accent || '#22344a' }} />}<b>{x.name}</b></button>)}</div>
            <h5>Time of day</h5>
            <div className="times">{TIMES.map(t => <button key={t} className={s.time === t ? 'on' : ''} onClick={() => d({ type: 'time', time: t })}>{TIME_LABEL[t]}</button>)}<button className={s.timeAuto ? 'on' : ''} onClick={() => d({ type: 'time', time: 'auto' })} title="Follow the clock">Auto</button></div>
            <div className="volume"><span className="lbl">Volume</span><input type="range" min={0} max={100} value={Math.round(s.volume * 100)} onChange={e => d({ type: 'set', patch: { volume: +e.target.value / 100, muted: false } })} aria-label="Music volume" /><b>{Math.round(s.volume * 100)}</b></div>
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
        {s.panel === 'focus' && <div className="modifierBox"><FocusPanel /></div>}
      </div>
    </div>
  );
}
