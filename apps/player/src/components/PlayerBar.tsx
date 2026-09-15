/* Footer player from the original — Live: now playing + play/pause; Explore: prev / play / next + library. */
import { usePlayer } from '../store/PlayerContext';
import { fmt } from '../lib/api';
export default function PlayerBar() {
  const { s, d, toggle } = usePlayer();
  const now = s.now; const t = s.tracks[s.index];
  const live = s.mode === 'live';
  const title = live ? (now?.live ? now.title : 'Station is off air') : t?.title || 'Loading catalog…';
  const artist = live ? now?.artist || '' : t?.artist || '';
  const art = live ? now?.artwork || '/assets/default-art.webp' : t?.artwork || '/assets/default-art.webp';
  const connTxt = { idle: 'Ready', connecting: 'Connecting…', playing: live ? 'Live' : 'Playing', buffering: 'Buffering…', reconnecting: 'Reconnecting…', paused: 'Paused', blocked: 'Tap play' }[s.conn];
  const elapsed = live ? (now?.started_at ? Math.min(now.duration || 0, (Date.now() - new Date(now.started_at).getTime()) / 1000) : now?.elapsed || 0) : s.exploreElapsed;
  const dur = live ? now?.duration || 0 : t?.duration || 0;
  return (
    <div className="footer">
      <div className="song-name">
        <img className="art" src={art} alt="" />
        <div className="txt"><span className={`badge ${live ? (now?.live ? 'live' : 'off') : 'explore'}`}>{live ? (now?.live ? 'LIVE' : 'OFF AIR') : 'EXPLORE'}</span><b>{title}</b><small>{artist}{live && now?.station ? ` · ${now.station}` : ''}</small>
          {dur > 0 && <div className="prog"><i style={{ width: `${Math.min(100, elapsed / dur * 100)}%` }} /><em>{fmt(elapsed)} / {fmt(dur)}</em></div>}</div>
      </div>
      <div className="controller">
        <div className="music-player--controls">
          <button className="skip-btn" onClick={() => d({ type: 'explore-step', dir: -1 })} disabled={live} aria-label="Previous track" title={live ? 'The live broadcast cannot be skipped' : 'Previous'}><img src="/assets/icons/prev.svg" alt="" /></button>
          <button className="play-btn" onClick={toggle} aria-label={s.playing ? 'Pause' : 'Play'}><img src={s.playing ? '/assets/icons/pause.svg' : '/assets/icons/play.svg'} alt="" /></button>
          <button className="skip-btn" onClick={() => d({ type: 'explore-step', dir: 1 })} disabled={live} aria-label="Next track" title={live ? 'The live broadcast cannot be skipped' : 'Next'}><img src="/assets/icons/next.svg" alt="" /></button>
        </div>
        <div className="sub"><span className={`conn ${s.conn}`}>{connTxt}</span>
          {!live && <><button className={`mini ${s.shuffle ? 'on' : ''}`} onClick={() => d({ type: 'set', patch: { shuffle: !s.shuffle } })} aria-pressed={s.shuffle}>Shuffle</button><button className={`mini ${s.repeat ? 'on' : ''}`} onClick={() => d({ type: 'set', patch: { repeat: !s.repeat } })} aria-pressed={s.repeat}>Repeat</button><button className="mini" onClick={() => d({ type: 'set', patch: { panel: s.panel === 'library' ? 'none' : 'library' } })}>Library</button></>}
          {live && <button className="mini" onClick={() => d({ type: 'set', patch: { panel: s.panel === 'library' ? 'none' : 'library' } })}>Up next</button>}
        </div>
      </div>
      <div className="right">
        <button className="mute" onClick={() => d({ type: 'set', patch: { muted: !s.muted } })} aria-label={s.muted ? 'Unmute' : 'Mute'}>{s.muted ? '🔇' : '🔊'}</button>
        <input type="range" min={0} max={100} value={Math.round(s.volume * 100)} onChange={e => d({ type: 'set', patch: { volume: +e.target.value / 100, muted: false } })} aria-label="Volume" />
        <button className="mini" onClick={() => d({ type: 'set', patch: { panel: s.panel === 'credits' ? 'none' : 'credits' } })}>Credits</button>
      </div>
    </div>
  );
}
