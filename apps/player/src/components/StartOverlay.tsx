/* First-visit overlay (original had a first-time modal): browsers require a tap before audio can start. */
import { usePlayer } from '../store/PlayerContext';
export default function StartOverlay() {
  const { s, play, setMode } = usePlayer();
  if (s.started) return null;
  return (<div className="start"><div className="box"><img src="/assets/logo.png" alt="HUNGREE Goat" /><h1>Afrobeats.<br /><span>Always on.</span></h1>
    <p>Choose how you want to listen. Scenes, ambient sounds and volume are yours; the live station keeps playing for everyone.</p>
    <div className="row"><button className="go" onClick={() => { setMode('live'); play(); }}><i className="dot live" />Listen Live</button><button className="alt" onClick={() => { setMode('explore'); play(); }}>Explore the catalog</button></div>
    <small>Best experienced with headphones · works on phone and desktop</small></div></div>);
}
