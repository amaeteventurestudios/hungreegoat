/* First-visit overlay (original had a first-time modal): browsers require a tap before audio can start. */
import { usePlayer } from '../store/PlayerContext';
import { YT_ENV } from '../lib/api';
export default function StartOverlay() {
  const { s, play } = usePlayer();
  if (s.started) return null;
  const yt = s.stations.find(x => x.id === s.station)?.youtube_url || YT_ENV;
  return (<div className="start"><div className="box"><img src="/assets/logo.png" alt="HUNGREE Goat" /><h1>HUNGREE Goat<br /><span>Music Player</span></h1>
    <p>Browse the full HUNGREE Goat catalog and play whatever you want, whenever you want. Scenes, ambient sounds and volume are yours alone: nothing here changes what's on the live broadcast.</p>
    <div className="row"><button className="go" onClick={play}>Start Listening</button></div>
    {yt && <a className="alt" href={yt} target="_blank" rel="noreferrer">Listen Live on YouTube instead</a>}
    <small>Best experienced with headphones · works on phone and desktop</small></div></div>);
}
