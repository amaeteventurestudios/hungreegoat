/* player.hungreegoat.com — public listening room (listener-side controls only) */
(() => {
  const $ = (s, el=document) => el.querySelector(s), $$ = (s, el=document) => [...el.querySelectorAll(s)];
  const h = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const HOME = window.HG_HOME_URL || 'https://hungreegoat.com';
  const params = new URLSearchParams(location.search);
  let station = params.get('station') || localStorage.getItem('hg.station') || 'lofi', now = null, stations = [], stop = null;
  $$('[data-home]').forEach(a => a.href = HOME); $('[data-year]').textContent = new Date().getFullYear();
  const applyYouTube = (url) => $$('.yt-link').forEach(a => { if (url) { a.href = url; a.hidden = false; } else a.hidden = true; });
  applyYouTube(window.HG_YOUTUBE_URL || '');

  const audio = $('#audio'); audio.volume = +(localStorage.getItem('hg.vol') || 0.9); $('[data-vol]').value = audio.volume;
  const connEl = $('[data-conn]'), playIcon = $('[data-playicon]');
  const player = HG.player(audio, station, (st) => {
    const map = { idle:['','Ready to play'], connecting:['wait','Connecting…'], playing:['on','Live · listening'], buffering:['wait','Buffering…'], reconnecting:['wait','Reconnecting…'], paused:['','Paused (the station keeps playing)'], blocked:['err','Tap play to start'] };
    const [cls, txt] = map[st] || ['', '']; connEl.className = 'conn ' + cls; $('span', connEl).textContent = txt;
    const playing = st === 'playing' || st === 'connecting' || st === 'buffering';
    playIcon.innerHTML = playing ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M7 4l14 8-14 8z"/>'; $('[data-play]').setAttribute('aria-label', playing ? 'Pause' : 'Play');
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = st === 'playing' ? 'playing' : 'paused';
  });
  $('[data-play]').addEventListener('click', () => player.toggle());
  $('[data-mute]').addEventListener('click', () => { audio.muted = !audio.muted; $('[data-volicon]').innerHTML = audio.muted ? '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M17 9l4 6M21 9l-4 6"/>' : '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'; $('[data-mute]').setAttribute('aria-label', audio.muted ? 'Unmute' : 'Mute'); });
  $('[data-vol]').addEventListener('input', e => { audio.volume = +e.target.value; localStorage.setItem('hg.vol', e.target.value); if (audio.muted && audio.volume > 0) $('[data-mute]').click(); });
  if ('mediaSession' in navigator) { navigator.mediaSession.setActionHandler('play', () => player.start()); navigator.mediaSession.setActionHandler('pause', () => player.stop()); }
  document.addEventListener('keydown', e => { if (e.code === 'Space' && !/input|button|a/i.test(e.target.tagName)) { e.preventDefault(); player.toggle(); } });

  function selectStation(id) { if (id === station) return; station = id; localStorage.setItem('hg.station', id); history.replaceState(null, '', `?station=${id}`); player.setStation(id); now = null; if (stop) stop(); stop = HG.watch(station, render, { every: 6000 }); }
  function renderStations() { $('[data-stations]').innerHTML = stations.map(s => `<button class="${s.id === station ? 'active' : ''} ${s.status === 'live' ? 'on' : s.status === 'coming_soon' ? 'soon' : ''}" data-st="${h(s.id)}" ${s.status === 'coming_soon' ? 'disabled title="Coming soon"' : ''}><i></i>${h(s.short)}${s.status === 'coming_soon' ? ' · soon' : ''}</button>`).join(''); $$('[data-st]').forEach(b => b.addEventListener('click', () => selectStation(b.dataset.st))); }
  function render(s) {
    if (!s.ok) { const l = $('[data-live]'); l.className = 'live off'; l.innerHTML = '<i></i>OFFLINE'; if (!now) { $('[data-title]').textContent = 'Stream information unavailable'; $('[data-artist]').textContent = ''; } return; }
    if (s.unchanged) { tick(); return; }
    now = s.now; stations = s.stations; renderStations();
    const st = stations.find(x => x.id === station) || {}; applyYouTube(st.youtube_url || now.youtube_url || window.HG_YOUTUBE_URL || '');
    const l = $('[data-live]'); l.className = 'live ' + (now.live ? '' : 'off'); l.innerHTML = '<i></i>' + (now.live ? 'LIVE' : 'OFF AIR');
    $('[data-station]').textContent = (now.station || 'HUNGREE Goat') + ' · HUNGREE Goat';
    $('[data-title]').textContent = now.live ? (now.title || 'Untitled') : 'Station is off air'; $('[data-artist]').textContent = now.live ? (now.artist || '') : '';
    $('[data-tags]').innerHTML = (now.tags || []).map(t => `<span class="tag">${h(t)}</span>`).join('');
    document.title = now.live && now.title ? `${now.title} — ${now.artist || 'HUNGREE Goat'} · HUNGREE Goat Player` : 'HUNGREE Goat Player — Listen Live';
    const art = $('[data-art]'), amb = $('[data-ambient]'); if (art.dataset.src !== now.artwork) { const n = new Image(); n.onload = () => { art.src = now.artwork; amb.src = now.artwork; art.dataset.src = now.artwork; }; n.src = now.artwork; }
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: now.title || 'HUNGREE Goat', artist: now.artist || '', album: now.station || 'HUNGREE Goat', artwork: [{ src: now.artwork, sizes: '800x800', type: 'image/jpeg' }] });
    $('[data-prog]').hidden = !(now.live && now.duration); tick();
    $('[data-upnext]').innerHTML = s.upNext.length ? s.upNext.slice(0, 6).map((t, i) => `<li><span class="n">${i + 1}</span><img src="${h(t.artwork)}" alt="" loading="lazy" width="42" height="42"><div><b>${h(t.title)}</b><span class="a">${h(t.artist || '')}</span></div><span class="d">${HG.fmt(t.duration)}</span></li>`).join('') : '<li class="empty">Up next is decided live by the station.</li>';
    const sch = s.schedule; $('[data-tz]').textContent = sch.timezone ? `station time (${sch.timezone})` : '';
    $('[data-schedule]').innerHTML = (sch.today || []).length ? sch.today.map(b => `<li class="${b.on_now ? 'now' : ''}"><span class="t">${h(b.start)}–${h(b.end)}</span><div><b>${h(b.name)}</b><span class="a">${h(b.description || '')}</span></div><span class="d">${b.on_now ? 'now' : b.next ? 'next' : ''}</span></li>`).join('') : '<li class="empty">No programme published for today.</li>';
  }
  function tick() { if (!now || !now.live || !now.duration) return; const started = now.started_at ? new Date(now.started_at).getTime() : null; const el = started ? Math.min(now.duration, (Date.now() - started) / 1000) : (now.elapsed || 0); $('[data-el]').textContent = HG.fmt(el); $('[data-dur]').textContent = HG.fmt(now.duration); $('[data-prog] .bar b').style.width = Math.min(100, el / now.duration * 100) + '%'; }
  stop = HG.watch(station, render, { every: 6000 }); setInterval(tick, 1000);
  if (params.get('autoplay') === '1') player.start();
})();
