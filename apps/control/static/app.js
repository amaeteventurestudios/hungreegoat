/* HUNGREE GOAT CONTROL — core runtime v2
   - same-origin API (works behind any host/reverse proxy)
   - DOM morphing: refreshes update in place (no flicker, no scroll/focus loss)
   - delegated events via data-act / data-form / data-change
   - mobile nav drawer, alerts drawer, Listen Live player */
window.HGC = (() => {
'use strict';
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];
const h = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = { user:null, station: localStorage.getItem('hgc.station') || 'lofi', overview:null, overviewAt:0, page:'dashboard',
  search:'', modal:null, drawer:null, navOpen:false, pageData:{}, alerts:{alerts:[],counts:{}}, player:{on:false, status:'idle', muted:false, volume:+(localStorage.getItem('hgc.vol')||0.9)}, busy:{} };
const ACTIONS = {}, FORMS = {}, CHANGES = {};
const ASSET = { logo:'assets/img/hungree-goat-logo-color.png', logoGold:'assets/img/hungree-goat-logo-gold.png', logo192:'assets/img/hungree-goat-logo-192.png',
  sidebar:'assets/img/sidebar-art.webp', sidebarSmall:'assets/img/sidebar-art-small.webp', hero:'assets/img/dashboard-hero.webp', heroMobile:'assets/img/dashboard-hero-mobile.webp',
  defaultArt:'assets/img/default-track-art-400.webp', defaultArtBig:'assets/img/default-track-art.webp', loopPreview:'assets/media/loop-preview.mp4', loopFrame:'assets/media/loop-frame.jpg' };
const mobile = () => window.innerWidth < 1024;

/* ---------------- mobile drawer scroll lock ----------------
   iOS Safari doesn't reliably honor overflow:hidden on <body> alone for a touch-driven
   scroll/rubber-band gesture — the page behind an open overlay can still move. The actually
   reliable technique is to pin <body> with position:fixed at its current scroll offset while
   the drawer is open, then restore that exact offset on close (see render()'s call site below)
   so closing the drawer never makes the page jump. Guarded by _navLocked so this only fires on
   a real open/close transition, not on every ~5s poll re-render while state.navOpen is unchanged. */
let _navScrollY = 0, _navLocked = false;
function lockBodyScroll() {
  _navScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  const b = document.body.style;
  b.position = 'fixed'; b.top = `-${_navScrollY}px`; b.left = '0'; b.right = '0'; b.width = '100%';
}
function unlockBodyScroll() {
  const b = document.body.style;
  b.position = ''; b.top = ''; b.left = ''; b.right = ''; b.width = '';
  window.scrollTo(0, _navScrollY);
}

/* ---------------- API ---------------- */
async function api(path, opts={}) {
  const o = { headers:{}, credentials:'same-origin', ...opts };
  if (o.body && typeof o.body !== 'string' && !(o.body instanceof FormData)) { o.body = JSON.stringify(o.body); o.headers['Content-Type']='application/json'; }
  const r = await fetch(path, o);
  if (r.status === 401) { if (state.user) { state.user=null; render(); } throw new Error('Not signed in'); }
  const ct = r.headers.get('content-type')||'';
  const data = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error((data && data.detail) ? (typeof data.detail==='string'?data.detail:JSON.stringify(data.detail)) : `HTTP ${r.status}`);
  return data;
}
const post = (p, body) => api(p, {method:'POST', body: body||{}});
const put = (p, body) => api(p, {method:'PUT', body: body||{}});
const patch = (p, body) => api(p, {method:'PATCH', body: body||{}});
const del = (p) => api(p, {method:'DELETE'});
function toast(msg, kind='') { const t=document.createElement('div'); t.className='toast '+kind; t.textContent=msg; $('#toasts').appendChild(t); setTimeout(()=>t.remove(), 4200); }
async function act(fn, okMsg, opts={}) { try { const r = await fn(); if (okMsg) toast(okMsg,'ok'); if(!opts.noRefresh) await refresh(true); return r; } catch(e) { toast(e.message,'err'); return null; } }
function confirmDlg(text, okLabel='Confirm', danger=false){ return new Promise(res=>{ state.modal={kind:'confirm', text, okLabel, danger, res}; render(); }); }

/* ---------------- formatting ---------------- */
const fmtDur = s => { if (s==null||isNaN(s)) return '--:--'; s=Math.max(0,Math.round(s)); const m=Math.floor(s/60), r=s%60; return `${m}:${String(r).padStart(2,'0')}`; };
const fmtLong = s => { if (s==null) return '—'; s=Math.round(s); const d=Math.floor(s/86400), hh=Math.floor(s%86400/3600), mm=Math.floor(s%3600/60); return d?`${d}d ${hh}h ${mm}m`:hh?`${hh}h ${mm}m`:`${mm}m ${s%60}s`; };
const fmtBytes = b => { if (b==null) return '—'; const u=['B','KB','MB','GB','TB']; let i=0; while(b>=1024&&i<u.length-1){b/=1024;i++;} return `${b.toFixed(i>=3?1:0)} ${u[i]}`; };
const fmtTime = ts => ts ? new Date(ts*1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—';
const fmtDate = ts => ts ? new Date(ts*1000).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
const st = () => state.overview && state.overview.stations[state.station];
const artUrl = (t, size=400) => { const id = t && (t.id ?? t.track_id); return id ? `/api/library/${id}/artwork` : ASSET.defaultArt; };

/* ---------------- icons ---------------- */
/* ---------------- help tooltips (hover + keyboard focus on desktop, tap-to-pin on mobile) ----------------
   See the matching comment in app.css for why this is a single body-level portal rather
   than a popover nested inside the triggering card. */
function help(text, cls='') { return `<button type="button" class="help ${cls}" data-tip="${h(text)}" aria-label="What this does"><span aria-hidden="true">?</span></button>`; }
let ttEl = null, ttOpenFor = null, ttPinned = false, ttShowT = null, ttHideT = null;
function ttEnsure() { if (!ttEl) { ttEl = document.createElement('div'); ttEl.className = 'tt-portal'; ttEl.setAttribute('role', 'tooltip'); document.body.appendChild(ttEl); } return ttEl; }
function ttPosition(trigger) {
  const el = ttEnsure(); const r = trigger.getBoundingClientRect(); const gap = 9, margin = 8;
  el.style.left = '0px'; el.style.top = '0px'; el.classList.add('show'); el.style.visibility = 'hidden';
  const tw = el.offsetWidth, th = el.offsetHeight;
  const above = (r.top - th - gap) >= margin;   // flip below the trigger when there isn't room above
  let top = above ? (r.top - th - gap) : (r.bottom + gap);
  top = Math.max(margin, Math.min(top, window.innerHeight - th - margin));
  let left = r.left + r.width/2 - tw/2;
  left = Math.max(margin, Math.min(left, window.innerWidth - tw - margin));   // clamp horizontally at both edges
  el.style.setProperty('--tt-arrow-x', Math.max(10, Math.min(r.left + r.width/2 - left, tw - 10)) + 'px');
  el.classList.toggle('above', above); el.classList.toggle('below', !above);
  el.style.left = left + 'px'; el.style.top = top + 'px'; el.style.visibility = '';
}
function ttShow(trigger, pin) {
  clearTimeout(ttHideT); clearTimeout(ttShowT);
  ttShowT = setTimeout(() => {
    const el = ttEnsure(); el.textContent = trigger.getAttribute('data-tip') || '';
    ttOpenFor = trigger; if (pin) { ttPinned = true; trigger.classList.add('open'); }
    ttPosition(trigger); el.classList.add('show');
  }, pin ? 0 : 90);
}
function ttHideNow() { clearTimeout(ttShowT); clearTimeout(ttHideT); if (ttEl) ttEl.classList.remove('show'); if (ttOpenFor) ttOpenFor.classList.remove('open'); ttOpenFor = null; ttPinned = false; }
function ttHide() {
  if (ttPinned) return;   // a click-pinned tooltip only closes via an explicit close (see below), never a stray mouseleave
  clearTimeout(ttShowT);
  ttHideT = setTimeout(ttHideNow, 260);   // long enough to actually read, short enough to not feel stuck
}
document.addEventListener('mouseover', e => { const t = e.target.closest('.help'); if (t) ttShow(t, false); });
document.addEventListener('mouseout', e => { const t = e.target.closest('.help'); if (t && !t.contains(e.relatedTarget)) ttHide(); });
document.addEventListener('focusin', e => { const t = e.target.closest('.help'); if (t) ttShow(t, false); });
document.addEventListener('focusout', e => { const t = e.target.closest('.help'); if (t) ttHide(); });
// Capture phase + stopPropagation: a `?` button nested inside a clickable card header
// (e.g. one with its own data-act, like the skins page's "Manage visibility" header)
// must only toggle the tooltip, never also fire that ancestor's click action.
document.addEventListener('click', e => {
  const t = e.target.closest('.help');
  if (t) { e.preventDefault(); e.stopPropagation(); if (ttOpenFor === t && ttPinned) ttHideNow(); else ttShow(t, true); }
  else if (ttPinned) ttHideNow();
}, true);
window.addEventListener('scroll', () => { if (ttOpenFor) ttPosition(ttOpenFor); }, true);
window.addEventListener('resize', () => { if (ttOpenFor) ttPosition(ttOpenFor); });
window.addEventListener('hashchange', ttHideNow);

const P = (d, extra='') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;
const I = {
  home:P('<path d="M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2z"/>'), stream:P('<circle cx="12" cy="12" r="2.5"/><path d="M7.5 7.5a6.5 6.5 0 0 0 0 9M16.5 7.5a6.5 6.5 0 0 1 0 9M4.5 4.5a10.5 10.5 0 0 0 0 15M19.5 4.5a10.5 10.5 0 0 1 0 15"/>'),
  cal:P('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'), music:P('<path d="M9 18V6l12-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  list:P('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'), queue:P('<path d="M3 6h12M3 12h12M3 18h8"/><path d="M17 14l4 2.5-4 2.5z" fill="currentColor"/>'),
  sources:P('<path d="M4 6h6l2 3h8v9H4z"/><path d="M4 6v12"/>'), tag:P('<path d="M20 12l-8 8-9-9V3h8z"/><circle cx="7.5" cy="7.5" r="1.5" fill="currentColor"/>'),
  out:P('<circle cx="12" cy="12" r="2"/><path d="M8 8a5.5 5.5 0 0 0 0 8M16 8a5.5 5.5 0 0 1 0 8M5 5a9.5 9.5 0 0 0 0 14M19 5a9.5 9.5 0 0 1 0 14"/>'), logs:P('<path d="M6 3h9l5 5v13H6z"/><path d="M14 3v6h6M9 13h6M9 17h6"/>'),
  cog:P('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  play:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8z"/></svg>', skip:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 4l10 8-10 8zM17 4h2v16h-2z"/></svg>', pause:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>', stop:'<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
  restart:P('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'), shield:P('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'), clock:P('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  db:P('<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'), shuffle:P('<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>'),
  wave:P('<path d="M3 12h2l2-6 3 12 3-9 2 6 2-3h4"/>'), bars:'<svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="12" width="3" height="8"/><rect x="10" y="7" width="3" height="13"/><rect x="16" y="3" width="3" height="17"/></svg>', cut:P('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.5 15.5M20 20L8.5 8.5"/>'),
  mic:P('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'), link:P('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  yt:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 8.2a3 3 0 0 0-2.1-2.1C18 5.6 12 5.6 12 5.6s-6 0-7.9.5A3 3 0 0 0 2 8.2 31 31 0 0 0 1.6 12 31 31 0 0 0 2 15.8a3 3 0 0 0 2.1 2.1c1.9.5 7.9.5 7.9.5s6 0 7.9-.5a3 3 0 0 0 2.1-2.1c.3-1.2.4-2.5.4-3.8s-.1-2.6-.4-3.8zM9.8 15.1V8.9l5.6 3.1z"/></svg>',
  bell:P('<path d="M6 8a6 6 0 0 1 12 0v5l2 3H4l2-3z"/><path d="M10 20a2 2 0 0 0 4 0"/>'), search:P('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'), chev:P('<path d="M9 6l6 6-6 6"/>'), plus:P('<path d="M12 5v14M5 12h14"/>'), x:P('<path d="M6 6l12 12M18 6L6 18"/>'), check:P('<path d="M5 12l5 5L20 7"/>'),
  image:P('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>'), send:P('<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>'), cpu:P('<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>'),
  megaphone:P('<path d="M3 10v4h3l7 5V5L6 10zM17 9a4 4 0 0 1 0 6"/>'), menu:P('<path d="M4 7h16M4 12h16M4 17h16"/>'), headphones:P('<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>'),
  vol:P('<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>'), mute:P('<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M17 9l4 6M21 9l-4 6"/>'), upload:P('<path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 20h16"/>'), trash:P('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  edit:P('<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13 7l4 4"/>'), copy:P('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5h10"/>'), eye:P('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'), grip:P('<path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" stroke-width="3"/>'),
  alert:P('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>'), info:P('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'), up:P('<path d="M12 19V5M5 12l7-7 7 7"/>'), down:P('<path d="M12 5v14M5 12l7 7 7-7"/>'),
  film:P('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M3 15h18M7.5 5v4M7.5 15v4M16.5 5v4M16.5 15v4"/>'), repeat:P('<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'), dice:P('<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'),
};
const NAV = [['dashboard','Dashboard',I.home],['streams','Streams',I.stream],['schedules','Schedules',I.cal],['library','Library',I.music],['playlists','Playlists',I.list],['queue','Queue',I.queue],['sources','Sources',I.sources],['metadata','Metadata',I.tag],['outputs','Outputs',I.out],['youtube','YouTube Setup',I.yt],['skins','Player Skins',I.image],['broadcast','Broadcast Visuals',I.film],['workout','Workout DJ',I.mic],['alerts','Alerts',I.bell],['logs','Logs',I.logs],['settings','Settings',I.cog]];

/* ---------------- DOM morphing ---------------- */
function morph(from, to) {
  if (from.nodeType === 3) { if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue; return; }
  if (from.nodeType !== 1 || to.nodeType !== 1 || from.tagName !== to.tagName || from.getAttribute('data-key') !== to.getAttribute('data-key')) { from.replaceWith(to); return; }
  // Never touch a form control the operator has edited (or is editing): a background
  // refresh must not wipe a pasted stream key or a half-typed title.
  const dirty = document.activeElement === from || from.hasAttribute('data-dirty') || (from.form && from.form.hasAttribute('data-dirty'));
  for (const a of [...from.attributes]) if (!to.hasAttribute(a.name) && a.name !== 'data-dirty') from.removeAttribute(a.name);
  for (const a of [...to.attributes]) { if (dirty && (a.name==='value'||a.name==='checked'||a.name==='selected')) continue; if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value); }
  if (from.tagName==='INPUT' && !dirty && from.type!=='file') { if (from.type==='checkbox'||from.type==='radio') from.checked = to.hasAttribute('checked'); else if (from.value !== (to.getAttribute('value')||'')) from.value = to.getAttribute('value')||''; }
  if (from.tagName==='TEXTAREA' && !dirty && from.value !== to.textContent) from.value = to.textContent;
  if (from.tagName==='SELECT' && !dirty) { const v = to.querySelector('option[selected]'); if (v && from.value !== v.value) from.value = v.value; }
  if (dirty && (from.tagName==='INPUT'||from.tagName==='TEXTAREA'||from.tagName==='SELECT')) return;
  if (from.hasAttribute('data-static')) return;
  morphChildren(from, to);
}
// Reconciles from's live children against to's children in place (keyed by data-key, else
// positional) without ever detaching from itself from the document. setHTML used to move
// #root's entire real child list out into a throwaway wrapper and back on every single poll,
// which works for morph's own diffing but forces every child (sidebar, header, whatever page
// is open) through a disconnect+reconnect cycle each time — browsers reset a scrollable
// element's scrollTop on that round trip, and recompositing every backdrop-filter panel on an
// unrelated 5s poll reads as a visible blink. Diffing #root's children directly leaves anything
// unchanged (and anything scrolled) untouched.
function morphChildren(from, to) {
  const fc = [...from.childNodes], tc = [...to.childNodes];
  const keyed = new Map(); fc.forEach(n => { if (n.nodeType===1 && n.hasAttribute('data-key')) keyed.set(n.getAttribute('data-key'), n); });
  let i = 0;
  for (const t of tc) {
    let cur = from.childNodes[i];
    if (t.nodeType===1 && t.hasAttribute('data-key')) { const k = keyed.get(t.getAttribute('data-key')); if (k && k !== cur) { from.insertBefore(k, cur||null); cur = k; } }
    if (!cur) { from.appendChild(t); i++; continue; }
    if (cur.nodeType !== t.nodeType || (cur.nodeType===1 && (cur.tagName !== t.tagName || (cur.getAttribute('data-key')||'') !== (t.getAttribute('data-key')||'')))) { from.insertBefore(t, cur); i++; continue; }
    morph(cur, t); i++;
  }
  while (from.childNodes.length > tc.length) from.removeChild(from.lastChild);
}
function setHTML(el, html) { const tpl = document.createElement('template'); tpl.innerHTML = html; const wrap = document.createElement('div'); wrap.append(...tpl.content.childNodes); morphChildren(el, wrap); }

/* ---------------- shell ---------------- */
function shell(content) {
  const ov = state.overview; const c = state.alerts.counts || {};
  const badge = (c.crit||0)+(c.err||0); const warn = c.warn||0;
  const heroImg = mobile() ? ASSET.heroMobile : ASSET.hero; const sbImg = mobile() ? ASSET.sidebarSmall : ASSET.sidebar;
  return `
  ${state.navOpen ? '<div class="nav-scrim" data-act="nav-close"></div>' : ''}
  <div class="app">
    <aside class="sidebar" style="--sidebar-img:url(${sbImg})" data-key="sidebar">
      <div class="brand"><img class="mark" src="${ASSET.logo}" alt="HUNGREE Goat Music"><h1>HUNGREE GOAT</h1><small>CONTROL</small></div>
      <nav class="nav">${NAV.map(([id,l,ic])=>`<a href="#/${id}" class="${state.page===id?'active':''}" data-act="nav-close" data-key="nav-${id}">${ic}<span>${l}</span>${id==='alerts'&&badge?`<span class="badge" title="${badge} alert${badge===1?'':'s'} need attention (critical or error)">${badge}</span>`:''}</a>`).join('')}</nav>
      <div class="spacer"></div>
      <div class="tagline">A Brighter Sound<br>for a Higher Africa</div>
      <div class="version">HUNGREE GOAT CONTROL · v2.0</div>
    </aside>
    <main class="main" data-key="main">
      <header class="hero" style="--hero-img:url(${heroImg})" data-key="hero"><div class="topbar">
        <button class="hamburger" data-act="nav-toggle" aria-label="Menu">${I.menu}</button>
        <div class="title"><img class="mini" src="${ASSET.logoGold}" alt=""><h2><b>HUNGREE GOAT</b> CONTROL</h2></div>
        <span class="station-tabs">${ov?Object.values(ov.stations).map(x=>`<button class="${x.id===state.station?'active':''}" data-act="station" data-id="${x.id}"><span class="led ${x.on_air?'on':(x.audio_running?'blue':'')}"></span>${h(x.short)}</button>`).join(''):''}</span>
        <div class="topbar-right">
          <div class="search">${I.search}<input id="globalsearch" placeholder="Search tracks, playlists…" value="${h(state.search)}" data-act-enter="search"></div>
          <button class="iconbtn" data-act="listen-toggle" title="Listen Live">${state.player.on&&state.player.status==='playing'?I.pause:I.headphones}</button>
          <button class="iconbtn" data-act="alerts-open" title="${badge?`${badge} alert${badge===1?'':'s'} need attention (critical or error)`:warn?`${warn} warning${warn===1?'':'s'}`:'Alerts'}">${I.bell}${badge?`<span class="badge">${badge}</span>`:(warn?`<span class="badge warn">${warn}</span>`:'')}</button>
          <div class="operator" title="Signed in as ${h(state.user)}"><div class="avatar">HG</div><div class="who"><b>HUNGREE Goat</b><span>${h(state.user||'Operator')}</span></div><button class="btn xs ghost icon" data-act="logout" title="Sign out">${I.x}</button></div>
          <div class="script-tag">Good Music<br>Higher Vibes</div>
        </div></div></header>
      <div data-key="page">${content}</div>
    </main>
  </div>
  ${state.player.on ? playerBar() : ''}
  ${state.drawer==='alerts' ? alertsDrawer() : ''}
  ${state.modal ? modalView() : ''}`;
}
function modalView(){ const m=state.modal; if(m.kind==='confirm') return `<div class="modal-bg" data-act="modal-bg"><div class="panel modal" style="width:min(440px,100%)"><h3>${m.danger?I.alert:I.info} Confirm</h3><p style="margin:0 0 14px">${h(m.text)}</p><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-act="confirm-no">Cancel</button><button class="btn ${m.danger?'red':'gold'}" data-act="confirm-yes">${h(m.okLabel)}</button></div></div></div>`;
  return `<div class="modal-bg" data-act="modal-bg"><div class="panel modal" ${m.wide?'style="width:min(980px,100%)"':''}>${m.html()}</div></div>`; }

/* ---------------- Listen Live player ---------------- */
const audio = () => document.getElementById('live-audio');
function playerBar(){ const s=st(); const np=s?s.now_playing:{}; const p=state.player; const stMap={idle:['','Ready'],connecting:['warn pulse','Connecting…'],playing:['on','Live · '+ (s?s.short:'') ],paused:['blue','Paused'],reconnecting:['warn pulse','Reconnecting…'],error:['err','Unavailable']}; const [cls,lbl]=stMap[p.status]||['','']; 
  return `<div class="player" data-key="player"><img class="pa" src="${np.track_id?artUrl(np):ASSET.defaultArt}" alt=""><div class="pt"><b>${h(np.title||'Listen Live')}</b><span>${h(np.artist||'')}${np.artist?' · ':''}${h(s?s.name:'')}</span></div>
  <div class="pc"><span class="st"><span class="led ${cls}"></span>${lbl}</span><button class="pbtn" data-act="listen-play" title="${p.status==='playing'?'Pause listening':'Play'}">${p.status==='playing'?I.pause:I.play}</button><button class="btn xs icon ghost" data-act="listen-mute" title="Mute">${p.muted?I.mute:I.vol}</button><input type="range" min="0" max="1" step="0.02" value="${p.volume}" data-change="listen-volume" aria-label="Volume"><button class="btn xs icon ghost" data-act="listen-close" title="Close player">${I.x}</button></div></div>`; }
function listenStart(){ const a=audio(); state.player.on=true; document.body.classList.add('has-player'); a.volume=state.player.volume; a.muted=state.player.muted; a.src=`/api/stations/${state.station}/listen.mp3?t=${Date.now()}`; state.player.status='connecting'; const gen=(state.player.gen=(state.player.gen||0)+1); a.load(); a.play().catch(e=>{ if(gen!==state.player.gen) return; state.player.status='error'; toast('Playback blocked: '+e.message,'err'); render(); }); render();
  // stuck-connect guard: if no audio within 10 s, reconnect
  setTimeout(()=>{ if(gen===state.player.gen && state.player.on && state.player.status==='connecting'){ listenStart(); } }, 10000); }
function listenStop(pause=true){ const a=audio(); a.pause(); a.removeAttribute('src'); a.load(); state.player.status = pause?'paused':'idle'; render(); }
function initAudio(){ const a=audio(); let retry=0;
  a.addEventListener('playing', ()=>{ retry=0; state.player.status='playing'; render(); });
  a.addEventListener('waiting', ()=>{ if(state.player.status==='playing'){ state.player.status='reconnecting'; render(); } });
  const fail=()=>{ if(!state.player.on || state.player.status==='paused') return; state.player.status='reconnecting'; render(); const d=Math.min(15000, 1000*Math.pow(2,retry++)); setTimeout(()=>{ if(state.player.on && state.player.status!=='paused') listenStart(); }, d); };
  a.addEventListener('error', fail); a.addEventListener('stalled', ()=>{ if(state.player.status==='playing') fail(); }); a.addEventListener('ended', fail);
  const pv=document.getElementById('preview-audio'); pv.addEventListener('ended', ()=>{ state.previewing=null; render(); }); }
function previewTrack(id, title){ const pv=document.getElementById('preview-audio'); if(state.previewing===id){ pv.pause(); pv.removeAttribute('src'); pv.load(); state.previewing=null; render(); return; } pv.src=`/api/library/${id}/preview.mp3?t=${Date.now()}`; pv.volume=0.9; pv.play().then(()=>{ state.previewing=id; toast('Previewing: '+title); render(); }).catch(e=>toast(e.message,'err')); }

/* ---------------- alerts drawer ---------------- */
function alertsDrawer(){ const A=state.alerts; const sev={critical:'err',error:'err',warning:'warn',info:'blue'}; const view=state.alertView||'active';
  const list=(A.alerts||[]).filter(a=> view==='active'? a.state!=='resolved' : a.state==='resolved');
  return `<div class="nav-scrim" data-act="drawer-close"></div><div class="drawer" data-key="alerts"><div class="dh"><h3>${I.bell} Alerts</h3><span class="seg"><button class="${view==='active'?'active':''}" data-act="alert-view" data-v="active">Active</button><button class="${view==='resolved'?'active':''}" data-act="alert-view" data-v="resolved">Resolved</button></span><button class="btn xs icon ghost" data-act="drawer-close">${I.x}</button></div>
  <div class="db">${list.length?list.map(a=>`<div class="alert ${a.severity} ${a.read?'':'unread'} ${a.state==='resolved'?'resolved':''}" data-key="al-${a.id}"><span class="led ${a.state==='resolved'?'on':sev[a.severity]||''}"></span><div><b>${h(a.title)} ${a.count>1?`<span class="pill off">×${a.count}</span>`:''} ${a.state==='acknowledged'?'<span class="pill blue">acknowledged</span>':''}</b><p>${h(a.message)}</p><div class="meta">${h(a.station||'system')} · ${fmtDate(a.updated_at||a.ts)}${a.state==='resolved'?' · resolved '+fmtTime(a.resolved_at):''}</div></div><div class="acts">${a.state==='open'?`<button class="btn xs" data-act="alert" data-id="${a.id}" data-op="ack">Ack</button>`:''}${a.state!=='resolved'?`<button class="btn xs" data-act="alert" data-id="${a.id}" data-op="resolve">Resolve</button>`:''}<button class="btn xs ghost" data-act="alert" data-id="${a.id}" data-op="clear">${I.x}</button></div></div>`).join(''):`<div class="empty"><span class="ic">${I.check}</span><b>${view==='active'?'No active alerts':'No resolved alerts'}</b><p>${view==='active'?'Warnings, errors and critical conditions appear here as they happen.':'Resolved alerts are kept until you clear them.'}</p></div>`}</div>
  <div class="df"><button class="btn sm" data-act="alerts-bulk" data-op="read-all">Mark all read</button><button class="btn sm" data-act="alerts-bulk" data-op="clear-read">Clear read</button><button class="btn sm" data-act="alerts-bulk" data-op="clear-resolved">Clear resolved</button><a class="btn sm ghost" href="#/logs" data-act="drawer-close">Event log ${I.chev}</a></div></div>`; }

/* ---------------- render / refresh ---------------- */
let nowArtUrl = null;
function swapArt(){ const box=document.getElementById('np-art'); const s=st(); if(!box||!s) return; const url = s.now_playing.track_id ? artUrl(s.now_playing) : ASSET.defaultArtBig; if (url===nowArtUrl) return; nowArtUrl=url; const img=new Image(); img.alt=''; img.onload=()=>{ const old=box.querySelector('img'); box.appendChild(img); if(old){ old.classList.add('out'); setTimeout(()=>old.remove(),400); } }; img.onerror=()=>{ img.src=ASSET.defaultArtBig; }; img.src=url; }
async function render(){ const root=$('#root');
  if(!state.user){ setHTML(root, loginView(state._loginErr||'')); const pf=$('#login input[name=password]'); if(pf && document.activeElement!==pf && !state._loginErr) pf.focus(); return; }
  if(!state.overview){ setHTML(root, '<div class="scene"></div><div class="login"><div class="panel" style="padding:30px">Connecting to HUNGREE Goat Control…</div></div>'); return; }
  const pg=HGC.pages[state.page]||HGC.pages.dashboard; let content='';
  try{ if(pg.load && !state.pageData[state.page]) state.pageData[state.page] = await pg.load(); content = pg.view(state.pageData[state.page]); }catch(e){ content=`<div class="panel" style="padding:20px"><b>Page error:</b> ${h(e.message)}</div>`; console.error(e); }
  setHTML(root, '<div class="scene"></div>'+shell(content)); swapArt(); drawSparks();
  const wantNavLock = state.navOpen && mobile();   // desktop never locks — the drawer there is a sticky in-flow sidebar, not an overlay
  if (wantNavLock && !_navLocked) { lockBodyScroll(); _navLocked = true; }
  else if (!wantNavLock && _navLocked) { unlockBodyScroll(); _navLocked = false; }
  document.body.classList.toggle('nav-open', state.navOpen); if(pg.after) pg.after(); tickClock();
  // morph() can replace/remove the exact node a pinned or focused tooltip is anchored to
  // (e.g. a periodic poll re-renders a pipeline-stage card with a new data-key) — the
  // portal lives outside #root so it would otherwise survive as an orphaned, un-anchored
  // bubble; reposition against the live element, or close if it's really gone.
  if (ttOpenFor) { if (document.contains(ttOpenFor)) ttPosition(ttOpenFor); else ttHideNow(); } }
async function refresh(force=false){ if(!state.user) return; try{ const [ov, al] = await Promise.all([api('/api/overview'), api('/api/alerts?state=all&limit=100')]); const s=ov.stations[state.station];
    const [sch, pls] = await Promise.all([api(`/api/stations/${state.station}/schedules`), api(`/api/stations/${state.station}/playlists`)]);
    s.today_schedule=sch.today; s.playlists=pls; s.jingles={jingles:(pls.find(p=>p.kind==='jingles')||{}).track_count||0, station_ids:(pls.find(p=>p.kind==='station_ids')||{}).track_count||0};
    state.overview=ov; state.alerts=al; state.overviewAt=Date.now(); pushHist(ov);
    const pg=HGC.pages[state.page]; if(pg && pg.load && (force || pg.live)) state.pageData[state.page] = await pg.load();
    await render(); }catch(e){ if(e.message!=='Not signed in') { console.warn('refresh', e); } } }
function route(){ const p=(location.hash.replace(/^#\/?/,'')||'dashboard').split('/')[0]; state.page=HGC.pages[p]?p:'dashboard'; state.modal=null; state.navOpen=false; delete state.pageData[state.page]; render(); window.scrollTo(0,0); }
window.addEventListener('hashchange', route);
window.addEventListener('resize', ()=>{ clearTimeout(state._rz); state._rz=setTimeout(()=>render(),150); });

/* ---------------- sparklines / meters / clock ---------------- */
const hist = { cpu:[], temp:[], yt:{} };
// Per-station stream history (bitrate/speed/fps), sampled once per poll (~5s), kept
// ~30 min trailing — same rolling-buffer idea as cpu/temp above, just keyed by station
// so switching stations (or leaving/returning to the YouTube page) doesn't mix or lose data.
function pushHist(ov){ const sys=ov.system; hist.cpu.push(sys.cpu_percent); hist.temp.push(sys.temp_c||0);
  hist.cpu=hist.cpu.slice(-60); hist.temp=hist.temp.slice(-60);
  for (const sid in ov.stations||{}) { const s=ov.stations[sid].stream||{}; const b=hist.yt[sid] || (hist.yt[sid]={bitrate:[],speed:[],fps:[],t:[]});
    const running = s.state==='running' && !s.stale;
    b.bitrate.push(running ? (s.bitrate_kbps||0) : null);
    b.speed.push(running ? (parseFloat(String(s.speed||'').replace('x',''))||null) : null);
    b.fps.push(running ? (s.fps||0) : null);
    b.t.push(Date.now());
    const cap=360; if (b.t.length>cap) { b.bitrate=b.bitrate.slice(-cap); b.speed=b.speed.slice(-cap); b.fps=b.fps.slice(-cap); b.t=b.t.slice(-cap); } } }
function drawSparks(){ $$('canvas[data-spark]').forEach(c=>{ const d=hist[c.dataset.spark]; const W=c.width=Math.max(60,c.clientWidth*2), H=c.height=52; const ctx=c.getContext('2d'); ctx.clearRect(0,0,W,H); if(d.length<2) return; const max=Math.max(100, ...d); ctx.beginPath(); d.forEach((v,i)=>{ const x=i/59*W, y=H-(v/max)*(H-6)-3; i?ctx.lineTo(x,y):ctx.moveTo(x,y); }); ctx.strokeStyle=c.dataset.spark==='temp'?'#ffb454':'#4f8cff'; ctx.lineWidth=2.5; ctx.stroke(); }); }
/* General-purpose line chart for the YouTube dashboard's bitrate/speed panels: gridlines,
   an optional dashed target line (e.g. 1.0x realtime), an optional gradient fill, and a
   "no data yet" placeholder so a freshly (re)loaded page never renders a blank canvas. */
function drawLineChart(canvas, series, opts={}) {
  if (!canvas) return;
  const dpr = Math.min(2, window.devicePixelRatio||1);
  const cw = canvas.clientWidth||300, ch = canvas.clientHeight||150;
  canvas.width = Math.max(1,cw*dpr); canvas.height = Math.max(1,ch*dpr);
  const ctx = canvas.getContext('2d'); ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,cw,ch);
  const padL=36, padR=8, padT=10, padB=16, w=Math.max(1,cw-padL-padR), h=Math.max(1,ch-padT-padB);
  const vals = series.filter(v=>v!=null);
  const maxV = Math.max(opts.min||0.01, ...(vals.length?vals:[0]), opts.floor||0) * 1.2;
  ctx.font='10px Inter, sans-serif'; ctx.fillStyle='#6f8199'; ctx.strokeStyle='rgba(128,168,214,.12)'; ctx.lineWidth=1;
  for (let i=0;i<=3;i++) { const y=padT+h-h*i/3; ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(padL+w,y); ctx.stroke();
    ctx.fillText(opts.fmtY ? opts.fmtY(maxV*i/3) : Math.round(maxV*i/3), 2, y+3); }
  if (opts.target!=null && opts.target <= maxV) { const y=padT+h-h*(opts.target/maxV); ctx.setLineDash([4,4]); ctx.strokeStyle='rgba(159,176,198,.55)';
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(padL+w,y); ctx.stroke(); ctx.setLineDash([]); }
  const n = series.length;
  if (n<2 || !vals.length) { ctx.fillStyle='#6f8199'; ctx.font='12px Inter, sans-serif'; ctx.textAlign='center'; ctx.fillText('No data yet — keep this page open while streaming', padL+w/2, padT+h/2); ctx.textAlign='left'; return; }
  const pts = series.map((v,i)=>[padL + w*i/(n-1), v==null?null:padT+h-h*Math.min(1,v/maxV)]);
  if (opts.fill) { ctx.beginPath(); let started=false, first=null, last=null;
    pts.forEach(([x,y])=>{ if(y==null) return; if(!started){ ctx.moveTo(x,y); started=true; first=x; } else ctx.lineTo(x,y); last=x; });
    if (started) { ctx.lineTo(last,padT+h); ctx.lineTo(first,padT+h); ctx.closePath();
      const grad=ctx.createLinearGradient(0,padT,0,padT+h); grad.addColorStop(0,opts.color+'59'); grad.addColorStop(1,opts.color+'00'); ctx.fillStyle=grad; ctx.fill(); } }
  ctx.beginPath(); let started=false;
  pts.forEach(([x,y])=>{ if(y==null){ started=false; return; } if(!started){ ctx.moveTo(x,y); started=true; } else ctx.lineTo(x,y); });
  ctx.strokeStyle=opts.color||'#4f8cff'; ctx.lineWidth=2; ctx.lineJoin='round'; ctx.stroke();
}
let meterLevel=0, meterTarget=0;
function animateMeter(){ meterLevel += (meterTarget-meterLevel)*0.25; const t=performance.now()/1000;
  $$('.meter').forEach(m=>{ const bars=m.children; for(let i=0;i<bars.length;i++){ const env=Math.sin(i/bars.length*Math.PI); const jitter=0.65+0.35*Math.abs(Math.sin(t*3.1+i*0.9)); bars[i].style.height=Math.max(4, meterLevel*100*env*jitter)+'%'; } });
  $$('.vu b').forEach(b=>{ b.style.width=Math.min(100, meterLevel*115)+'%'; });
  const eq=$('#eq'); if(eq){ const on=!eq.classList.contains('dim'); [...eq.children].forEach((b,i)=>{ b.style.height=on?(30+60*Math.abs(Math.sin(t*2.6+i*0.7))*Math.min(1,meterLevel*3+0.2))+'%':'20%'; }); }
  requestAnimationFrame(animateMeter); }
async function pollMeter(){ if(!state.user || !st() || !st().audio_running) { meterTarget=0; return; } if(document.hidden) return; try{ const r=await api(`/api/stations/${state.station}/meter`); meterTarget = r.rms!=null ? Math.min(1, Math.pow(r.rms,0.5)*1.6) : 0; }catch{ meterTarget=0; } }
function tickClock(){ const s=st(); if(!s) return; const np=s.now_playing; if(np.elapsed==null) return; const age=(Date.now()-state.overviewAt)/1000; const e=Math.min(np.duration||1e9, np.elapsed+age);
  $$('[data-np-el]').forEach(el=>el.textContent=fmtDur(e)); if(np.duration){ $$('[data-np-rem]').forEach(el=>el.textContent='-'+fmtDur(np.duration-e)); const pct=Math.min(100,e/np.duration*100);
    $$('.progress[data-np]').forEach(p=>{ const b=p.firstElementChild, i=p.lastElementChild; const prev=parseFloat(b.style.width)||0;
      // A new track (or Skip) can land here well below the previous percentage; the bar's own
      // CSS transition would otherwise animate a visible backward "rewind" instead of a clean reset.
      if(pct < prev - 15){ b.style.transition='none'; i.style.transition='none'; b.style.width=pct+'%'; i.style.left=pct+'%'; b.offsetHeight; b.style.transition=''; i.style.transition=''; }
      else { b.style.width=pct+'%'; i.style.left=pct+'%'; } }); } }

/* ---------------- login ---------------- */
function loginView(err=''){ return `<div class="scene"></div><div class="login"><div class="panel"><div class="brand"><img class="mark" src="${ASSET.logo}" alt="HUNGREE Goat Music" style="width:120px;height:120px"><h1>HUNGREE GOAT</h1><small>CONTROL</small></div><form id="login" data-form="login"><label>Operator</label><input class="inp" name="username" value="operator" autocomplete="username"><label>Password</label><input class="inp" name="password" type="password" autocomplete="current-password"><div class="err">${h(err)}</div><button class="btn gold wide" type="submit">Sign In</button></form></div></div>`; }

/* ---------------- delegated events ---------------- */
// Guards a whitelist of state-changing actions against double-click / double-tap: a second
// click on the exact same control while the first request is still in flight is ignored,
// rather than firing a duplicate start/stop/restart/etc.
const BUSY = new Set();
const GUARDED_ACTIONS = new Set(['skip','restart-all','stream-start','stream-stop','stream-restart','svc','usb-repair',
  'alert','alerts-bulk','fallback-toggle','queue-clear','dj-take','dj-return','rescan','yt-reconnect']);
function delegate(){ const root=document.body;
  root.addEventListener('click', e=>{ const el=e.target.closest('[data-act]'); if(!el) return; const name=el.dataset.act; const fn=ACTIONS[name]; if(!fn) return;
    // container actions (backdrop, dropzones) must not swallow clicks on their own controls
    if(el!==e.target && e.target.closest('button,input,select,textarea,label,a,[data-act]')!==el && e.target.closest('button,input,select,textarea,label,a')) return;
    if(el.tagName!=='A' || name!=='nav-close') e.preventDefault();
    if(GUARDED_ACTIONS.has(name)){
      const key=name+':'+(el.dataset.id||'')+':'+(el.dataset.op||'')+':'+(el.dataset.svc||'')+':'+(el.dataset.qid||'');
      if(BUSY.has(key)) return;
      BUSY.add(key); Promise.resolve(fn(el,e)).finally(()=>BUSY.delete(key));
      return;
    }
    fn(el, e); });
  root.addEventListener('submit', e=>{ const f=e.target.closest('[data-form]'); if(!f) return; e.preventDefault(); const fn=FORMS[f.dataset.form]; f.removeAttribute('data-dirty'); f.querySelectorAll('[data-dirty]').forEach(x=>x.removeAttribute('data-dirty')); if(fn) fn(f, Object.fromEntries(new FormData(f).entries()), e); });
  root.addEventListener('input', e=>{ const t=e.target; if(t && (t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.tagName==='SELECT') && t.form && t.form.hasAttribute('data-form')) { t.setAttribute('data-dirty','1'); t.form.setAttribute('data-dirty','1'); } }, true);
  root.addEventListener('change', e=>{ const el=e.target.closest('[data-change]'); if(!el) return; const fn=CHANGES[el.dataset.change]; if(fn) fn(el, e); });
  root.addEventListener('input', e=>{ const el=e.target.closest('[data-input]'); if(!el) return; const fn=CHANGES[el.dataset.input]; if(fn) fn(el, e); });
  root.addEventListener('keydown', e=>{ if(e.key==='Enter'){ const el=e.target.closest('[data-act-enter]'); if(el){ e.preventDefault(); const fn=ACTIONS[el.dataset.actEnter]; if(fn) fn(el,e); } } if(e.key==='Escape'){ if(state.modal){ if(state.modal.res) state.modal.res(false); state.modal=null; render(); } else if(state.drawer){ state.drawer=null; render(); } else if(ttPinned){ ttHideNow(); } } });
}
Object.assign(ACTIONS, {
  'nav-toggle': ()=>{ state.navOpen=!state.navOpen; render(); }, 'nav-close': ()=>{ if(state.navOpen){ state.navOpen=false; render(); } },
  'drawer-close': ()=>{ state.drawer=null; render(); }, 'alerts-open': ()=>{ state.drawer = state.drawer==='alerts'?null:'alerts'; render(); }, 'alert-view': (el)=>{ state.alertView=el.dataset.v; render(); },
  'alert': async(el)=>{ const verb={ack:'Acknowledged',read:'Marked as read',resolve:'Resolved',clear:'Cleared'}[el.dataset.op]||'Updated'; await act(()=>post(`/api/alerts/${el.dataset.id}/${el.dataset.op}`), `${verb} 1 alert.`); },
  'alerts-bulk': async(el)=>{ const msg=(n)=>({ 'read-all':`Marked ${n} alert${n===1?'':'s'} as read.`, 'clear-read':`Cleared ${n} read alert${n===1?'':'s'}.`, 'clear-resolved':`Cleared ${n} resolved alert${n===1?'':'s'}.`, 'clear-all':`Cleared ${n} alert${n===1?'':'s'}.` }[el.dataset.op]);
    const r=await act(()=>post(`/api/alerts/bulk/${el.dataset.op}`), null); if(r) toast(msg(r.count),'ok'); },
  'modal-bg': (el,e)=>{ if(e.target===el){ if(state.modal&&state.modal.res) state.modal.res(false); state.modal=null; render(); } }, 'modal-close': ()=>{ if(state.modal&&state.modal.res) state.modal.res(false); state.modal=null; render(); },
  'confirm-yes': ()=>{ const r=state.modal.res; state.modal=null; render(); r(true); }, 'confirm-no': ()=>{ const r=state.modal.res; state.modal=null; render(); r(false); },
  'station': (el)=>{ state.station=el.dataset.id; localStorage.setItem('hgc.station',state.station); state.pageData={}; if(state.player.on) listenStart(); refresh(true); },
  'logout': ()=>act(async()=>{ await post('/api/logout'); state.user=null; state.overview=null; listenStop(false); state.player.on=false; document.body.classList.remove('has-player'); render(); }, null, {noRefresh:true}),
  'search': (el)=>{ state.search=el.value.trim(); state.pageData={}; if(state.page!=='library') location.hash='#/library'; else render(); },
  'listen-toggle': ()=>{ if(state.player.on && state.player.status==='playing') listenStop(); else listenStart(); },
  'listen-play': ()=>{ if(state.player.status==='playing') listenStop(); else listenStart(); },
  'listen-mute': ()=>{ state.player.muted=!state.player.muted; audio().muted=state.player.muted; render(); },
  'listen-close': ()=>{ listenStop(false); state.player.on=false; document.body.classList.remove('has-player'); render(); },
  'preview': (el)=>previewTrack(Number(el.dataset.id), el.dataset.title||''),
  'skip': ()=>act(()=>post(`/api/stations/${state.station}/skip`),'Skipped'),
  'restart-all': async()=>{ if(await confirmDlg('Restart the audio engine and video stream? Listeners hear a short interruption.','Restart',true)) act(()=>post(`/api/stations/${state.station}/restart-all`),'Restarting engine and stream'); },
  'stream-start': ()=>act(()=>post(`/api/stations/${state.station}/stream/start`),'Starting video stream'),
  'stream-stop': async()=>{ if(await confirmDlg('Stop the video stream output?','Stop stream',true)) act(()=>post(`/api/stations/${state.station}/stream/stop`),'Stopping video stream'); },
  'stream-restart': ()=>act(()=>post(`/api/stations/${state.station}/stream/restart`),'Restarting video stream'),
  'svc': async(el)=>{ const [k,a]=el.dataset.svc.split(':'); if(a==='stop' && !(await confirmDlg(`Stop the ${k==='liquidsoap'?'audio engine':'video pipeline'}?`,'Stop',true))) return; act(()=>post(`/api/stations/${state.station}/${k}/${a}`),`${k==='liquidsoap'?'Audio engine':'Video pipeline'}: ${a}`); },
  'fallback-toggle': ()=>{ const s=st(); act(()=>post(`/api/stations/${state.station}/fallback`,{force:!s.fallback.forced}), s.fallback.forced?'Fallback released':'Switched to fallback'); },
  'queue-clear': async()=>{ if(await confirmDlg('Clear all queued requests?','Clear queue',true)) act(()=>post(`/api/stations/${state.station}/queue/clear`),'Queue cleared'); },
  'q-add': (el)=>act(()=>post(`/api/stations/${state.station}/queue`,{track_id:Number(el.dataset.id)}),'Added to queue'),
  'q-next': (el)=>act(()=>post(`/api/stations/${state.station}/queue`,{track_id:Number(el.dataset.id),play_next:true}),'Will play next'),
  'q-del': (el)=>act(()=>del(`/api/stations/${state.station}/queue/${el.dataset.qid}`)),
  'q-move': (el)=>{ const s=st(); const ids=s.queue.map(q=>q.qid); const i=ids.indexOf(Number(el.dataset.qid)); const j=i+Number(el.dataset.dir); if(i<0||j<0||j>=ids.length) return; [ids[i],ids[j]]=[ids[j],ids[i]]; act(()=>post(`/api/stations/${state.station}/queue/reorder`,{order:ids})); },
  'toggle': (el)=>{ if(el.classList.contains('disabled')) return; const k=el.dataset.key; const v=!el.classList.contains('on'); el.classList.toggle('on'); act(()=>post(`/api/stations/${state.station}/settings`,{settings:{[k]:v}})); },
  'usb-repair': async()=>{ if(await confirmDlg('Unmount, check and remount the HUNGREE-GOAT drive? Playback stops during the repair.','Repair drive',true)) act(()=>post('/api/system/usb-repair'),'Repair started — watch Alerts'); },
});
Object.assign(CHANGES, {
  'setting': (el)=>{ const k=el.dataset.key; let v=el.value; if(!isNaN(v)&&k!=='output_target') v=Number(v); act(()=>post(`/api/stations/${state.station}/settings`,{settings:{[k]:v}}),'Saved'); },
  'mode': (el)=>act(()=>post(`/api/stations/${state.station}/settings`,{settings: el.value==='sequential'?{sequential:true,shuffle:false}:{shuffle:true,sequential:false}}),'Playback mode updated'),
  'listen-volume': (el)=>{ state.player.volume=+el.value; localStorage.setItem('hgc.vol', el.value); audio().volume=state.player.volume; },
});
Object.assign(FORMS, {
  'login': async(f,b)=>{ b.username=(b.username||'').trim(); const btn=f.querySelector('button[type=submit]'); btn.disabled=true; btn.textContent='Signing in…'; try{ const r=await post('/api/login',b); state.user=r.user; state._loginErr=''; await refresh(true); }catch(err){ state._loginErr=/401|credentials|Not signed/.test(err.message)?'Invalid username or password':err.message; render(); } },
});

/* ---------------- boot ---------------- */
(async () => {
  delegate(); initAudio();
  try { const me = await api('/api/me'); state.user = me.user; } catch { state.user = null; }
  route();
  if (state.user) await refresh(true);
  setInterval(() => { if (state.user && !state.modal && !document.hidden) refresh(); }, 5000);
  setInterval(pollMeter, 2500); setInterval(tickClock, 1000); animateMeter();
  setInterval(async()=>{ try{ const v=await api('/api/version'); if(window.HGC_V && v.assets!==window.HGC_V){ toast('HUNGREE Goat Control was updated — reloading','ok'); setTimeout(()=>location.reload(), 1500); } }catch{} }, 60000);
})();
return { state, api, post, put, patch, del, act, toast, confirmDlg, render, refresh, h, I, fmtDur, fmtLong, fmtBytes, fmtTime, fmtDate, st, artUrl, ASSET, ACTIONS, FORMS, CHANGES, previewTrack, listenStart, mobile, help, hist, drawLineChart, pages:{} };
})();
