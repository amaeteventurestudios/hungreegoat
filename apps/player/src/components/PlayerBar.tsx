/* Footer transport bar: artwork, title/artist, a draggable progress bar (the actual seek
   control, not a second anonymous slider), and full controls for the listener's own
   catalog playback. */
import { usePlayer } from '../store/PlayerContext';
import { fmt } from '../lib/api';
export default function PlayerBar() {
  const { s, d, toggle, audio } = usePlayer();
  const t = s.tracks[s.index];
  const title = t?.title || (s.tracks.length ? '' : 'Loading catalog…');
  const artist = t?.artist || '';
  const art = t?.artwork || '/assets/default-art.webp';
  const connTxt = { idle: 'Ready', connecting: 'Connecting…', playing: 'Playing', buffering: 'Buffering…', reconnecting: 'Reconnecting…', paused: 'Paused', blocked: 'Tap play' }[s.conn];
  const dur = t?.duration || 0;
  const seek = (v: number) => { if (audio.current) audio.current.currentTime = v; d({ type: 'set', patch: { elapsed: v } }); };
  return (
    <div className="footer">
      <div className="song-name">
        <img className="art" src={art} alt="" />
        <div className="txt"><b>{title}</b><small>{artist}</small>
          {dur > 0 && <div className="prog"><input type="range" className="seekbar" min={0} max={dur} step={1} value={Math.min(s.elapsed, dur)} onChange={e => seek(+e.target.value)} aria-label="Seek backward or forward" style={{ '--pct': `${Math.min(100, s.elapsed / dur * 100)}%` } as React.CSSProperties} /><em>{fmt(s.elapsed)} / {fmt(dur)}</em></div>}</div>
      </div>
      <div className="controller">
        <div className="music-player--controls">
          <button className="skip-btn" onClick={() => d({ type: 'track-step', dir: -1 })} aria-label="Previous track" title="Previous"><img src="/assets/icons/prev.svg" alt="" /></button>
          <button className="play-btn" onClick={toggle} aria-label={s.playing ? 'Pause' : 'Play'}><img src={s.playing ? '/assets/icons/pause.svg' : '/assets/icons/play.svg'} alt="" /></button>
          <button className="skip-btn" onClick={() => d({ type: 'track-step', dir: 1 })} aria-label="Next track" title="Next"><img src="/assets/icons/next.svg" alt="" /></button>
        </div>
        <div className="sub"><span className={`conn ${s.conn}`}>{connTxt}</span>
          <button className={`mini ${s.shuffle ? 'on' : ''}`} onClick={() => d({ type: 'set', patch: { shuffle: !s.shuffle } })} aria-pressed={s.shuffle}>Shuffle</button>
          <button className={`mini ${s.repeat ? 'on' : ''}`} onClick={() => d({ type: 'set', patch: { repeat: !s.repeat } })} aria-pressed={s.repeat}>Repeat</button>
          <button className="mini" onClick={() => d({ type: 'set', patch: { panel: s.panel === 'library' ? 'none' : 'library' } })}>Catalog</button>
        </div>
      </div>
      <div className="right">
        <button className="mute" onClick={() => d({ type: 'set', patch: { muted: !s.muted } })} aria-label={s.muted ? 'Unmute' : 'Mute'} title="Music volume">{s.muted ? '🔇' : '🔊'}</button>
        <input type="range" min={0} max={100} value={Math.round(s.volume * 100)} onChange={e => d({ type: 'set', patch: { volume: +e.target.value / 100, muted: false } })} aria-label="Music volume" title="Music volume" />
        <button className="mini" onClick={() => d({ type: 'set', patch: { panel: s.panel === 'credits' ? 'none' : 'credits' } })}>Credits</button>
      </div>
    </div>
  );
}
