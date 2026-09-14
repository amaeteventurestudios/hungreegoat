/* HUNGREE Goat public API client (read-only). Works in any browser; no auth. */
window.HG = (() => {
  const base = (window.HG_API_BASE || 'https://api.hungreegoat.com').replace(/\/$/, '');
  const abs = (p) => (p && p.startsWith('/')) ? base + p : p;
  async function get(path, timeout=8000) {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), timeout);
    try { const r = await fetch(base + path, { signal: c.signal, cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
    finally { clearTimeout(t); }
  }
  const fmt = (s) => { if (s == null || isNaN(s)) return '--:--'; s = Math.max(0, Math.round(s)); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; };
  /* poll now-playing + up-next + stations; call cb(state) whenever data changes */
  function watch(stationId, cb, { every = 6000 } = {}) {
    let stopped = false, timer = null, last = '';
    async function tick() {
      if (stopped) return;
      try {
        const [np, un, st, sch] = await Promise.all([get(`/v1/now-playing?station=${stationId}`), get(`/v1/up-next?station=${stationId}`), get('/v1/stations'), get(`/v1/schedule?station=${stationId}`)]);
        np.artwork = abs(np.artwork); (un.items||[]).forEach(i => i.artwork = abs(i.artwork)); (st.stations||[]).forEach(s => s.stream_url = abs(s.stream_url));
        const state = { ok: true, now: np, upNext: un.items || [], stations: st.stations || [], schedule: sch, fetchedAt: Date.now() };
        const key = JSON.stringify([np.title, np.artist, np.live, un.items, st.stations.map(s=>s.status), sch.now]);
        if (key !== last) { last = key; cb(state); } else cb({ ...state, unchanged: true });
      } catch (e) { cb({ ok: false, error: e.message, fetchedAt: Date.now() }); }
      timer = setTimeout(tick, document.hidden ? every * 3 : every);
    }
    tick();
    return () => { stopped = true; clearTimeout(timer); };
  }
  /* audio player wrapper around a single <audio>; only affects the listener's browser */
  function player(audioEl, stationId, onState) {
    let gen = 0, retry = 0, state = 'idle';
    const set = (s) => { state = s; onState && onState(s); };
    const src = () => `${base}/v1/listen/${stationId}.mp3?t=${Date.now()}`;
    function start() { const g = ++gen; retry = 0; audioEl.src = src(); audioEl.load(); set('connecting'); audioEl.play().catch(e => { if (g === gen) set('blocked'); });
      setTimeout(() => { if (g === gen && state === 'connecting') start(); }, 10000); }
    function stop() { gen++; audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); set('paused'); }
    const fail = () => { if (state === 'paused' || state === 'idle') return; set('reconnecting'); const g = gen; const d = Math.min(15000, 1000 * 2 ** retry++); setTimeout(() => { if (g === gen) start(); }, d); };
    audioEl.addEventListener('playing', () => { retry = 0; set('playing'); });
    audioEl.addEventListener('waiting', () => { if (state === 'playing') set('buffering'); });
    audioEl.addEventListener('error', fail); audioEl.addEventListener('stalled', () => { if (state === 'playing') fail(); }); audioEl.addEventListener('ended', fail);
    return { start, stop, toggle: () => (state === 'playing' || state === 'connecting' || state === 'buffering') ? stop() : start(), get state() { return state; },
      setStation(id) { const was = state === 'playing'; stationId = id; if (was) start(); } };
  }
  return { base, abs, get, fmt, watch, player };
})();
