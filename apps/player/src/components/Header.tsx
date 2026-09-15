import { useEffect, useState } from 'react';
import { usePlayer } from '../store/PlayerContext';
import { HOME, YT_ENV } from '../lib/api';
import { TIMES, TIME_LABEL } from '../lib/skins';
const I = {
  expand: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>,
  compress: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>,
  sun: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
  moon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>,
  dawn: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 18h18M5 14a7 7 0 0 1 14 0M12 3v3M4.2 8.2l2 2M19.8 8.2l-2 2" /></svg>,
  dusk: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 18h18M6 14a6 6 0 0 1 12 0M12 9V6M8 20h8" /></svg>,
};
export default function Header() {
  const { s, d } = usePlayer();
  const [fs, setFs] = useState(false);
  useEffect(() => { const h = () => setFs(!!document.fullscreenElement); document.addEventListener('fullscreenchange', h); return () => document.removeEventListener('fullscreenchange', h); }, []);
  const fullscreen = () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {}); else document.exitFullscreen?.(); };
  const nextTime = () => { const i = TIMES.indexOf(s.time); d({ type: 'time', time: TIMES[(i + 1) % TIMES.length] }); };
  const icon = { dawn: I.dawn, afternoon: I.sun, dusk: I.dusk, night: I.moon }[s.time];
  const yt = s.stations.find(x => x.id === s.station)?.youtube_url || YT_ENV;
  return (
    <nav className="wrap">
      <a className="brand" href={HOME} title="Back to hungreegoat.com"><img src="/assets/logo.png" alt="HUNGREE Goat" /><b>HUNGREE GOAT MUSIC PLAYER</b></a>
      <div className="nav-menu">
        <a href={HOME} className="home">← hungreegoat.com</a>
        {yt && <a href={yt} target="_blank" rel="noreferrer" className="yt">YouTube</a>}
        <button className="time" onClick={nextTime} title={`Time of day: ${TIME_LABEL[s.time]}${s.timeAuto ? ' (auto)' : ''} — click to change`} aria-label="Change time of day">{icon}<span>{TIME_LABEL[s.time]}</span></button>
        <button className="fullscreen-btn" onClick={fullscreen} aria-label={fs ? 'Exit fullscreen' : 'Fullscreen'}>{fs ? I.compress : I.expand}</button>
      </div>
    </nav>
  );
}
