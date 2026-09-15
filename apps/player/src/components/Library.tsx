/* The Library panel is where the unified player exposes both listening modes: it opens on
   Up Next + today's schedule for the live broadcast, with a "Browse full catalog" entry
   point into on-demand playback; and from there a "Back to Live" exit. There is no separate
   Live/Explore selector elsewhere in the UI — this panel is the only place that switches. */
import { useState } from 'react';
import { usePlayer } from '../store/PlayerContext';
import { fmt } from '../lib/api';
export default function Library() {
  const { s, d, setMode, play } = usePlayer(); const [q, setQ] = useState('');
  const close = () => d({ type: 'set', patch: { panel: 'none' } });
  const goLive = () => { setMode('live'); play(); };
  if (s.mode === 'explore') {
    const list = s.tracks.map((t, i) => ({ t, i })).filter(({ t }) => !q || `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q.toLowerCase()));
    return (<div className="sheet" role="dialog" aria-label="Library"><div className="sheet-h"><h4>Catalog · {s.stations.find(x => x.id === s.station)?.short || 'Library'}</h4><span>{s.tracks.length} tracks</span><button className="x" onClick={close} aria-label="Close">✕</button></div>
      <div className="stations"><button className="live-back" onClick={goLive}><i className={`dot ${s.now?.live ? 'live' : ''}`} />Back to Live</button>{s.stations.map(st => <button key={st.id} className={st.id === s.station ? 'on' : ''} disabled={st.status === 'coming_soon'} onClick={() => d({ type: 'set', patch: { station: st.id, index: 0 } })}>{st.short}{st.status === 'coming_soon' ? ' · soon' : ''}</button>)}</div>
      <input className="search" placeholder="Search tracks…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" />
      <ul className="tracks">{list.map(({ t, i }) => <li key={t.id} className={i === s.index ? 'on' : ''}><button onClick={() => { d({ type: 'explore-go', index: i }); d({ type: 'set', patch: { started: true } }); }}><img src={t.artwork} alt="" loading="lazy" /><span><b>{t.title}</b><small>{t.album || t.artist}</small></span><em>{fmt(t.duration)}</em></button></li>)}{!list.length && <li className="empty">{s.tracks.length ? 'No matches' : 'Loading catalog…'}</li>}</ul></div>);
  }
  return (<div className="sheet" role="dialog" aria-label="Up next"><div className="sheet-h"><h4>Up next · {s.now?.station || 'Live'}</h4><button className="x" onClick={close} aria-label="Close">✕</button></div>
    <ul className="tracks">{s.upNext.length ? s.upNext.map((t, i) => <li key={i}><div className="row"><img src={t.artwork} alt="" loading="lazy" /><span><b>{t.title}</b><small>{t.artist} · {t.source === 'request' ? 'listener request' : 'up next'}</small></span><em>{fmt(t.duration)}</em></div></li>) : <li className="empty">Up next is decided live by the station.</li>}</ul>
    <h4 className="sub">Today's schedule {s.schedule?.timezone ? `(${s.schedule.timezone})` : ''}</h4>
    <ul className="sched">{(s.schedule?.today || []).map((b, i) => <li key={i} className={b.on_now ? 'on' : ''}><em>{b.start}–{b.end}</em><span><b>{b.name}</b><small>{b.description}</small></span>{b.on_now && <i>now</i>}{b.next && !b.on_now && <i>next</i>}</li>)}</ul>
    <button className="browse-catalog" onClick={() => setMode('explore')}>Browse full catalog</button></div>);
}
