/* hungreegoat.com/business — static page, no live data/player. Mobile drawer toggle
   (same markup/behavior as the homepage's), footer year, and the screenshot lightbox. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const yearEl = $('[data-year]'); if (yearEl) yearEl.textContent = new Date().getFullYear();
  const burger = $('[data-menu]'), drawer = $('#drawer');
  if (burger && drawer) {
    burger.addEventListener('click', () => { const open = drawer.hidden; drawer.hidden = !open; burger.setAttribute('aria-expanded', String(open)); });
    drawer.addEventListener('click', e => { if (e.target.tagName === 'A') { drawer.hidden = true; burger.setAttribute('aria-expanded', 'false'); } });
  }

  const box = $('#lightbox');
  if (!box) return;
  const frame = $('#lightboxFrame', box), img = $('#lightboxImg', box);
  const titleEl = $('#lightboxTitle', box), descEl = $('#lightboxDesc', box);
  const closeBtn = $('[data-lightbox-close]', box);
  let lastFocused = null;

  function openLightbox(trigger) {
    lastFocused = trigger;
    img.src = trigger.dataset.full;
    img.alt = trigger.querySelector('img')?.alt || trigger.dataset.title || '';
    titleEl.textContent = trigger.dataset.title || '';
    descEl.textContent = trigger.dataset.desc || '';
    frame.classList.remove('zoomed');
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    closeBtn.focus();
  }
  function closeLightbox() {
    box.hidden = true;
    document.body.style.overflow = '';
    img.src = '';
    if (lastFocused) lastFocused.focus();
  }
  function toggleZoom() { frame.classList.toggle('zoomed'); }

  document.querySelectorAll('[data-lightbox-trigger]').forEach(btn => {
    btn.addEventListener('click', () => openLightbox(btn));
  });
  closeBtn.addEventListener('click', closeLightbox);
  box.addEventListener('click', e => { if (e.target === box) closeLightbox(); });
  frame.addEventListener('click', toggleZoom);
  frame.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleZoom(); }
  });
  document.addEventListener('keydown', e => {
    if (box.hidden) return;
    if (e.key === 'Escape') { closeLightbox(); return; }
    if (e.key === 'Tab') {
      const focusables = [closeBtn, frame];
      const i = focusables.indexOf(document.activeElement);
      e.preventDefault();
      const next = e.shiftKey ? (i <= 0 ? focusables.length - 1 : i - 1) : (i === focusables.length - 1 ? 0 : i + 1);
      focusables[next < 0 ? 0 : next].focus();
    }
  });
})();
