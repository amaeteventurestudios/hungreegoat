import { PlayerProvider, usePlayer } from './store/PlayerContext';
import Scene from './components/Scene';
import Header from './components/Header';
import Mixer from './components/Mixer';
import Ambience from './components/Ambience';
import PlayerBar from './components/PlayerBar';
import Library from './components/Library';
import Credits from './components/Credits';
import StartOverlay from './components/StartOverlay';
import RotateHint from './components/RotateHint';
import { Analytics } from '@vercel/analytics/react';
function Shell() {
  const { s } = usePlayer();
  const skin = s.skins.find(x => x.id === s.skinId);
  return (<div className="app" style={{ ['--accent' as string]: skin?.accent || '#f2c14e' }}>
    <Scene /><Header /><Mixer /><Ambience /><RotateHint />
    {(s.panel === 'library') && <Library />}{s.panel === 'credits' && <Credits />}
    <PlayerBar /><StartOverlay />
  </div>);
}
export default function App() { return <PlayerProvider><Shell /><Analytics /></PlayerProvider>; }
