import { usePlayer } from '../store/PlayerContext';
import { HOME } from '../lib/api';
export default function Credits() {
  const { d } = usePlayer();
  return (<div className="sheet small" role="dialog" aria-label="Credits"><div className="sheet-h"><h4>HUNGREE Goat Music Player</h4><button className="x" onClick={() => d({ type: 'set', patch: { panel: 'none' } })} aria-label="Close">✕</button></div>
    <p><b>Afrobeats. Always on.</b> An independent, on-demand player for the full HUNGREE Goat catalog: browse, play and mix scenes and ambient sounds however you like. It never affects the live broadcast or another listener's playback; for that, use Listen Live on YouTube.</p>
    <p>Music © HUNGREE Goat Music. Player based on <em>lofi-music-website</em> by Gilles Momeni, licensed under the GNU AGPL v3: <a href="https://github.com/amaeteventurestudios/hungreegoat/tree/main/apps/player" target="_blank" rel="noreferrer">source code</a> · <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noreferrer">licence</a>.</p>
    <p><a href={HOME}>hungreegoat.com</a></p></div>);
}
