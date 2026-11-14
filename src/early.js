// Runs at document_start in every frame, before Moodle paints, so there's no flash of stock styles.
// The on/off flag is mirrored into the page's localStorage by main.js because chrome.storage is async.
(() => {
  const root = document.documentElement;
  let off = false;
  try { off = localStorage.getItem('bm:off') === '1'; } catch (_) {}
  if (off) return;
  root.classList.add('bm');
  // Inside our viewer iframe: strip Moodle's chrome so only the content shows.
  if (window.top !== window) {
    try { if (window.top.location.origin === location.origin) root.classList.add('bm-embed'); } catch (_) {}
  }
})();
