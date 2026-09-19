/* hungreegoat.com/business — static page, no live data/player. Just the shared mobile
   drawer toggle (same markup/behavior as the homepage's) and the footer year. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const yearEl = $('[data-year]'); if (yearEl) yearEl.textContent = new Date().getFullYear();
  const burger = $('[data-menu]'), drawer = $('#drawer');
  if (burger && drawer) {
    burger.addEventListener('click', () => { const open = drawer.hidden; drawer.hidden = !open; burger.setAttribute('aria-expanded', String(open)); });
    drawer.addEventListener('click', e => { if (e.target.tagName === 'A') { drawer.hidden = true; burger.setAttribute('aria-expanded', 'false'); } });
  }
})();
