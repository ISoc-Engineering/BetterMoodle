// Entry point: checks the on/off switch and theme, then routes features by Moodle's <body id>.
var BM = globalThis.BM;

(async () => {
  const root = document.documentElement;
  if (root.classList.contains('bm-embed')) return; // inside our viewer: CSS only

  // Source of truth is chrome.storage (set by the popup); mirror it to localStorage for early.js.
  let s = {};
  try { s = await chrome.storage.local.get(['enabled', 'aggressive', 'theme']); } catch (_) {}
  const enabled = s.enabled !== false;
  BM.settings = { aggressive: enabled && s.aggressive === true, theme: s.theme || 'minimal' };
  try { localStorage.setItem('bm:off', enabled ? '0' : '1'); } catch (_) {}
  try {
    chrome.storage.onChanged.addListener((ch) => {
      if ('enabled' in ch || 'aggressive' in ch) { location.reload(); return; }
      // Themes are pure CSS, so they switch live without a reload.
      if ('theme' in ch) { BM.settings.theme = BM.applyTheme(ch.theme.newValue); BM.cursor?.sync(); }
    });
  } catch (_) {}
  if (!enabled) { root.classList.remove('bm'); delete root.dataset.bmTheme; return; }
  root.classList.add('bm');
  BM.settings.theme = BM.applyTheme(BM.settings.theme);
  BM.cursor?.init();

  if (!BM.cfg().sesskey || !BM.cfg().userId) return; // logged out: reskin only

  const id = document.body.id;
  try {
    BM.palette.init();
    if (id === 'page-my-index') await BM.home.init();
    else if (/^page-course-view-/.test(id)) await BM.course.init(BM.courseIdFromBody());
  } catch (e) {
    console.warn('[BetterMoodle] feature failed; leaving the stock page alone', e);
  }
})();
