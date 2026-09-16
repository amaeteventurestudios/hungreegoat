/* hungreegoat.com — live data + inline Listen Live (listener-side only) */
(() => {
  const $ = (s, el=document) => el.querySelector(s), $$ = (s, el=document) => [...el.querySelectorAll(s)];
  const h = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const PLAYER = window.HG_PLAYER_URL || 'https://player.hungreegoat.com';
  let station = 'lofi', now = null, ytUrl = window.HG_YOUTUBE_URL || '';
  const xUrl = window.HG_X_URL || '';
  document.querySelector('[data-year]').textContent = new Date().getFullYear();
  $$('.player-link').forEach(a => { a.href = a.dataset.playerStation ? `${PLAYER}/?station=${a.dataset.playerStation}` : PLAYER; });
  function applyYouTube(url) { ytUrl = url || ''; $$('.yt-link').forEach(a => { if (ytUrl) { a.href = ytUrl; a.hidden = false; } else { a.hidden = true; } }); $$('.yt-fallback').forEach(b => { b.hidden = !!ytUrl; }); }
  applyYouTube(ytUrl);
  if (xUrl) $$('.x-link').forEach(a => { a.href = xUrl; a.hidden = false; });

  /* mobile drawer */
  const burger = $('[data-menu]'), drawer = $('#drawer');
  burger.addEventListener('click', () => { const open = drawer.hidden; drawer.hidden = !open; burger.setAttribute('aria-expanded', String(open)); });
  drawer.addEventListener('click', e => { if (e.target.tagName === 'A') { drawer.hidden = true; burger.setAttribute('aria-expanded', 'false'); } });
  /* active nav on scroll */
  const secs = ['home','now','stations','why','about'].map(id => document.getElementById(id)).filter(Boolean);
  const io = new IntersectionObserver(es => { es.forEach(en => { if (en.isIntersecting) $$('.nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + (en.target.id === 'now' ? 'home' : en.target.id === 'why' ? 'about' : en.target.id))); }); }, { rootMargin: '-40% 0px -50% 0px' });
  secs.forEach(s => io.observe(s));

  /* inline player */
  const audio = $('#audio'), mini = $('#mini');
  const player = HG.player(audio, station, (st) => {
    const labels = { idle:'Listen Live', connecting:'Connecting…', playing:'Pause', buffering:'Buffering…', reconnecting:'Reconnecting…', paused:'Listen Live', blocked:'Tap to play' };
    $$('[data-listen-label]').forEach(l => l.textContent = labels[st] || 'Listen Live');
    const conn = $('[data-conn]', mini); conn.textContent = { connecting:'Connecting…', playing:'Live', buffering:'Buffering…', reconnecting:'Reconnecting…', paused:'Paused', blocked:'Tap play to start' }[st] || ''; conn.className = 'st ' + (st === 'playing' ? 'on' : st === 'reconnecting' ? 'err' : '');
    $('[data-playicon]', mini).innerHTML = (st === 'playing' || st === 'connecting' || st === 'buffering') ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M6 4l14 8-14 8z"/>';
    $('[data-meter]').classList.toggle('on', st === 'playing');
    if (st !== 'idle') mini.hidden = false;
  });
  $$('[data-listen]').forEach(b => b.addEventListener('click', () => { const sid = b.dataset.stationId; if (sid && sid !== station) { station = sid; player.setStation(sid); } player.toggle(); }));
  $('[data-mini-close]').addEventListener('click', () => { player.stop(); mini.hidden = true; });
  let vol = 1; audio.volume = vol;

  /* live data */
  const liveEl = $('[data-live]');
  // Whether YouTube is actually broadcasting and whether our own metadata API can be
  // reached are two different facts. An API outage must never be reported as the
  // broadcast being offline — that is a claim about YouTube we have no evidence for.
  let lastKnownLive = null;
  function render(s) {
    if (!s.ok) {
      if (lastKnownLive === true) { liveEl.className = 'live'; liveEl.innerHTML = '<i></i>LIVE ON YOUTUBE'; }
      else if (lastKnownLive === false) { liveEl.className = 'live off'; liveEl.innerHTML = '<i></i>OFF AIR'; }
      else { liveEl.className = 'live unknown'; liveEl.innerHTML = '<i></i>CONNECTING'; }
      $$('[data-title]').forEach(e => e.textContent = 'Track information temporarily unavailable');
      $$('[data-artist]').forEach(e => e.textContent = '');
      const un = $('[data-upnext]'); if (un) un.innerHTML = '<li class="empty">Upcoming tracks temporarily unavailable.</li>';
      return;
    }
    if (s.unchanged) { tickProgress(); return; }
    lastKnownLive = !!s.now.live;
    now = s.now;
    const st = s.stations.find(x => x.id === station) || {};
    applyYouTube(st.youtube_url || s.now.youtube_url || window.HG_YOUTUBE_URL || '');
    liveEl.className = 'live ' + (now.live ? '' : 'off'); liveEl.innerHTML = '<i></i>' + (now.live ? 'LIVE ON YOUTUBE' : 'OFF AIR');
    $$('[data-title]').forEach(e => e.textContent = now.live ? (now.title || 'Untitled') : 'Station is off air');
    $$('[data-artist]').forEach(e => e.textContent = now.live ? (now.artist || '') : '');
    $('[data-station]').textContent = now.station + (now.live ? ' · HUNGREE Goat' : '');
    $('[data-tags]').innerHTML = (now.tags || []).map(t => `<span class="tag">${h(t)}</span>`).join('');
    $$('[data-art]').forEach(img => { if (img.dataset.src !== now.artwork) { const n = new Image(); n.onload = () => { img.src = now.artwork; img.dataset.src = now.artwork; }; n.src = now.artwork; } });
    const prog = $('[data-prog]'); prog.hidden = !(now.live && now.duration); tickProgress();
    const un = $('[data-upnext]');
    un.innerHTML = s.upNext.length ? s.upNext.slice(0, 5).map((t, i) => `<li><span class="n">${i + 1}</span><img src="${h(t.artwork)}" alt="" loading="lazy" width="44" height="44"><div><b>${h(t.title)}</b><span class="a">${h(t.artist || '')}${t.source === 'request' ? ' · listener request' : t.source === 'planned' ? ' · planned' : ''}</span></div><span class="d">${HG.fmt(t.duration)}</span></li>`).join('') : '<li class="empty">Up next is decided live by the station. Check back in a moment.</li>';
    s.stations.forEach(st => { const card = $(`[data-station-card="${st.id}"]`); if (!card) return; const l = $('[data-st-live]', card); if (st.status === 'live') { l.className = 'live'; l.innerHTML = '<i></i>LIVE NOW'; card.classList.remove('soon'); } else if (st.status === 'coming_soon') { l.className = 'live soon'; l.innerHTML = '<i></i>COMING SOON'; } else { l.className = 'live off'; l.innerHTML = '<i></i>OFF AIR'; } if (st.description) $('[data-st-desc]', card).textContent = st.description;
      const stYt = $('[data-station-yt]', card); if (stYt) { if (st.youtube_url) { stYt.href = st.youtube_url; stYt.hidden = false; } else stYt.hidden = true; } });
  }
  let lastState = null;
  function tickProgress() { if (!now || !now.live || !now.duration) return; const started = now.started_at ? new Date(now.started_at).getTime() : null; const el = started ? Math.min(now.duration, (Date.now() - started) / 1000) : (now.elapsed || 0); $('[data-el]').textContent = HG.fmt(el); $('[data-dur]').textContent = HG.fmt(now.duration); $('[data-prog] .bar b').style.width = Math.min(100, el / now.duration * 100) + '%'; }
  HG.watch(station, (s) => { lastState = s; render(s); }, { every: 6000 });
  setInterval(tickProgress, 1000);
})();
