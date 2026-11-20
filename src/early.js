// Runs at document_start in every frame, before Moodle paints, so there's no flash of stock styles.
// The on/off flag and theme are mirrored into the page's localStorage by main.js because chrome.storage is async.
(() => {
  const root = document.documentElement;
  let off = false, theme = 'minimal';
  try {
    off = localStorage.getItem('bm:off') === '1';
    theme = localStorage.getItem('bm:theme') || 'minimal';
  } catch (_) {}
  if (off) return;
  root.classList.add('bm');
  root.dataset.bmTheme = theme; // main.js corrects this from chrome.storage if it's stale
  // Inside our viewer iframe: strip Moodle's chrome so only the content shows.
  if (window.top !== window) {
    try { if (window.top.location.origin === location.origin) root.classList.add('bm-embed'); } catch (_) {}
  }
})();
