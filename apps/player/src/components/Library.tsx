/* The catalog: the entire point of this player. Choosing a station or a track here never
   touches the live broadcast or the Liquidsoap rotation — it only changes this listener's
   own playback. */
import { useState } from 'react';
import { usePlayer } from '../store/PlayerContext';
import { fmt } from '../lib/api';
export default function Library() {
  const { s, d } = usePlayer(); const [q, setQ] = useState('');
  const close = () => d({ type: 'set', patch: { panel: 'none' } });
  const list = s.tracks.map((t, i) => ({ t, i })).filter(({ t }) => !q || `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q.toLowerCase()));
  return (<div className="sheet" role="dialog" aria-label="Catalog"><div className="sheet-h"><h4>Catalog · {s.stations.find(x => x.id === s.station)?.short || 'Library'}</h4><span>{s.tracks.length} tracks</span><button className="x" onClick={close} aria-label="Close">✕</button></div>
    <div className="stations">{s.stations.map(st => <button key={st.id} className={st.id === s.station ? 'on' : ''} disabled={st.status === 'coming_soon'} onClick={() => d({ type: 'set', patch: { station: st.id, index: 0 } })}>{st.short}{st.status === 'coming_soon' ? ' · soon' : ''}</button>)}</div>
    <input className="search" placeholder="Search tracks…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" />
    <ul className="tracks">{list.map(({ t, i }) => <li key={t.id} className={i === s.index ? 'on' : ''}><button onClick={() => { d({ type: 'track-go', index: i }); d({ type: 'set', patch: { started: true } }); }}><img src={t.artwork} alt="" loading="lazy" /><span><b>{t.title}</b><small>{t.album || t.artist}</small></span><em>{fmt(t.duration)}</em></button></li>)}{!list.length && <li className="empty">{s.tracks.length ? 'No matches' : s.catalogState === 'unavailable' ? 'Catalog unavailable right now. Retrying automatically.' : 'Loading catalog…'}</li>}</ul></div>);
}
