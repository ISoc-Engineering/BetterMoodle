// Runs at document_start so the reskin applies before first paint (no flash of classic Moodle).
// All BetterMoodle CSS is scoped under `html.bm`, so removing the class restores stock Moodle.
(() => {
  const root = document.documentElement;
  root.classList.add('bm');
  // Moodle pages shown inside our side viewer get a chrome-less layout.
  if (window.top !== window) root.classList.add('bm-embed');

  chrome.storage.sync.get({ enabled: true }, ({ enabled }) => {
    if (!enabled) root.classList.remove('bm', 'bm-embed');
  });
})();
