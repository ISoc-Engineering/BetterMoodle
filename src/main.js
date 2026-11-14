// Entry point: decides which features to run on the current Moodle page.
(async () => {
  const BM = globalThis.BM;
  if (window.top !== window) return; // inside our side viewer: reskin CSS only

  const { enabled } = await chrome.storage.sync.get({ enabled: true }).catch(() => ({ enabled: true }));
  if (!enabled) return;

  const id = BM.page.id();
  const { SEL } = BM;
  if (SEL.loginPageIds.includes(id) || !BM.uid() || !BM.sesskey()) return; // not logged in

  const run = (name, fn) => {
    try {
      fn();
    } catch (e) {
      console.warn(`[BetterMoodle] ${name} failed; page left as stock Moodle`, e);
    }
  };

  run('search', () => BM.palette.init());
  if (SEL.homePageIds.includes(id)) run('home', () => BM.home.init());
  if (BM.page.has(SEL.coursePageClass) || SEL.sectionPageIds.includes(id)) run('course', () => BM.course.init());
})();
