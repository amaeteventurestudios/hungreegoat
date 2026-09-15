/* First-visit overlay (original had a first-time modal): browsers require a tap before audio can start. */
import { usePlayer } from '../store/PlayerContext';
export default function StartOverlay() {
  const { s, play } = usePlayer();
  if (s.started) return null;
  return (<div className="start"><div className="box"><img src="/assets/logo.png" alt="HUNGREE Goat" /><h1>HUNGREE Goat<br /><span>Music Player</span></h1>
    <p>Scenes, ambient sounds and volume are yours; the live station keeps playing for everyone. Browse the full catalog any time from the Library.</p>
    <div className="row"><button className="go" onClick={play}><i className="dot live" />Start Listening</button></div>
    <small>Best experienced with headphones · works on phone and desktop</small></div></div>);
}
