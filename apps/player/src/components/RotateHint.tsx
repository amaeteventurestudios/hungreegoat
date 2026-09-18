import { useEffect, useState } from 'react';

const SEEN_KEY = 'hg.rotateHintSeen';
const isPortraitPhone = () => window.innerWidth < 768 && window.innerHeight > window.innerWidth;

/* A one-time, self-dismissing nudge toward the full 16:9 experience — never a blocker.
   Shown at most once per browser session (sessionStorage, not localStorage: a returning
   visitor tomorrow sees it again, but reloading/navigating within today's session does
   not re-show it), only while genuinely in portrait on a phone-sized viewport, and
   dismissed the instant the device is actually rotated (resize is the one event that
   reliably fires for orientation changes across iOS/Android browsers; no reload
   involved — the CSS containment in Scene.tsx already responds to the same resize on
   its own). */
export default function RotateHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(SEEN_KEY)) return;
    if (!isPortraitPhone()) return;
    const showTimer = window.setTimeout(() => {
      setVisible(true);
      try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode, etc — fine to just not persist */ }
    }, 1800);
    return () => clearTimeout(showTimer);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const hideTimer = window.setTimeout(() => setVisible(false), 5000);
    const onResize = () => { if (!isPortraitPhone()) setVisible(false); };
    window.addEventListener('resize', onResize);
    return () => { clearTimeout(hideTimer); window.removeEventListener('resize', onResize); };
  }, [visible]);

  if (!visible) return null;
  return (
    <div className="rotate-hint" role="status" aria-live="polite">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="6" y="2" width="12" height="16" rx="2" transform="rotate(90 12 10)" />
        <path d="M12 18a8 8 0 0 0 7-4M19 10v4h-4" />
      </svg>
      <span>Turn your phone sideways for the full cinematic view</span>
    </div>
  );
}
