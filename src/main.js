// Entry point: checks the on/off switch, then routes features by Moodle's <body id>.
var BM = globalThis.BM;

(async () => {
  const root = document.documentElement;
  if (root.classList.contains('bm-embed')) return; // inside our viewer: CSS only

  // Source of truth is chrome.storage (set by the popup); mirror it to localStorage for early.js.
  let enabled = true;
  try { enabled = (await chrome.storage.local.get('enabled')).enabled !== false; } catch (_) {}
  try { localStorage.setItem('bm:off', enabled ? '0' : '1'); } catch (_) {}
  try {
    chrome.storage.onChanged.addListener((ch) => { if ('enabled' in ch) location.reload(); });
  } catch (_) {}
  if (!enabled) { root.classList.remove('bm'); return; }
  root.classList.add('bm');

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
