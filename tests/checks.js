// Checks for one scenario, run inside tests/fixture.html. The scenario name comes from ?check=<name>.
// Each check is a plain function that throws (via expect) when something is wrong.
(() => {
  const name = new URLSearchParams(location.search).get('check');
  if (!name) return;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const html = document.documentElement;
  const css = (el, prop) => getComputedStyle(el).getPropertyValue(prop).trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function expect(ok, message) { if (!ok) throw new Error(message); }

  // Wait until fn() returns something truthy (or give up after 8s).
  async function until(fn, what) {
    for (let i = 0; i < 80; i++) {
      try { const v = fn(); if (v) return v; } catch (_) {}
      await sleep(100);
    }
    throw new Error('timed out waiting for ' + what);
  }

  const texts = (sel) => $$(sel).map((e) => e.textContent.trim());
  const visible = (el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed';

  const SCENARIOS = {
    async home(check) {
      await check('dashboard replaces the stock one', async () => {
        await until(() => $('#bm-home'), '#bm-home');
        expect(html.classList.contains('bm'), 'html should have class bm');
        expect(html.dataset.bmTheme === 'pop', `theme should default to pop, got ${html.dataset.bmTheme}`);
        expect($('#page-content').classList.contains('bm-replaced'), 'stock dashboard should be hidden');
      });
      await check('due soon lists all three deadlines, overdue first', async () => {
        await until(() => $$('.bm-due-item').length === 3, '3 due items');
        expect($('.bm-due-group').classList.contains('is-overdue'), 'first group should be Overdue');
        expect($('.bm-due-name').textContent.includes('Robot maze'), 'Robot maze should come first');
      });
      await check('courses: favourite first, external image dropped, images shown in Pop!', async () => {
        await until(() => $$('.bm-course').length === 2, '2 courses');
        expect($('.bm-course').textContent.includes('Discrete'), 'starred course should be first');
        const imgs = $$('.bm-course-img');
        expect(imgs.length === 1, `only the safe data: image should be kept, got ${imgs.length}`);
        expect(css(imgs[0], 'display') === 'block', 'Pop! should show course images');
      });
      await check('announcements from the forum API, newest first', async () => {
        await until(() => $$('.bm-news-item').length === 2, '2 announcements');
        expect(texts('.bm-news-title')[0] === 'Problem class moved', 'newest announcement should be first');
      });
      await check('classic dashboard toggle swaps views', async () => {
        const btn = $('.bm-home-top .bm-link-btn');
        btn.click();
        expect(!$('#page-content').classList.contains('bm-replaced'), 'stock dashboard should show');
        expect(btn.textContent === 'Use BetterMoodle dashboard', 'button text should flip');
        btn.click();
        expect($('#page-content').classList.contains('bm-replaced'), 'should switch back');
      });
      await check('Ctrl+K opens and closes the search palette', async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
        await until(() => $('.bm-palette') && !$('.bm-palette').hidden, 'palette open');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
        expect($('.bm-palette').hidden, 'second Ctrl+K should close it');
      });
      await check('theme switches live from the popup setting, no reload', async () => {
        window.notReloaded = true;
        await chrome.storage.local.set({ theme: 'minimal' });
        expect(html.dataset.bmTheme === 'minimal', 'theme should be minimal');
        expect(!css(document.body, 'background-image').includes('radial-gradient'), 'Minimal should have a plain background');
        expect(css($('.bm-course-img'), 'display') === 'none', 'Minimal should not show course images');
        expect(!$('.bm-cursor'), 'no cursor ring outside Pop!');
        await chrome.storage.local.set({ theme: 'pop' });
        expect(html.dataset.bmTheme === 'pop', 'theme should be pop');
        expect(localStorage.getItem('bm:theme') === 'pop', 'theme should be mirrored for early.js');
        expect(css(document.body, 'background-image').includes('radial-gradient'), 'Pop! should give dot-paper background');
        const wantsRing = matchMedia('(pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches;
        expect(!!$('.bm-cursor') === wantsRing, 'cursor ring should exist only with a mouse and motion allowed');
        await chrome.storage.local.set({ theme: 'not-a-theme' });
        expect(html.dataset.bmTheme === 'pop', 'unknown theme should fall back to pop');
        expect(window.notReloaded, 'page should not have reloaded');
      });
    },

    async homeSoft(check) {
      await check('Soft theme: tokens applied and course images shown', async () => {
        await until(() => $$('.bm-course').length === 2, '2 courses');
        expect(html.dataset.bmTheme === 'soft', 'theme should be soft');
        expect(css(html, '--bm-accent') === '#315f85', `accent should be #315f85, got ${css(html, '--bm-accent')}`);
        expect(css($('.bm-course-img'), 'display') === 'block', 'Soft should show course images');
      });
    },

    async homeForumFallback(check) {
      await check('announcements fall back to the stock dashboard links, safely', async () => {
        await until(() => $$('.bm-news-item').length, 'fallback announcements');
        const items = $$('.bm-news-item');
        expect(items.length === 1, `duplicate, external and javascript: links should be dropped, got ${items.length}`);
        expect(items[0].getAttribute('href') === '/mod/forum/discuss.php?d=55', 'link should be the local discussion');
      });
    },

    async storageFails(check) {
      await check('works with defaults when chrome.storage throws', async () => {
        await until(() => $$('.bm-due-item').length === 3, 'due items');
        expect(html.dataset.bmTheme === 'pop', 'theme should be the default, pop');
      });
    },

    async switchedOff(check) {
      await check('switched off: Moodle is left completely alone', async () => {
        await until(() => window.loaded, 'scripts loaded');
        await sleep(500);
        expect(!html.classList.contains('bm'), 'html should not have class bm');
        expect(!('bmTheme' in html.dataset), 'no theme attribute');
        expect(!$('#bm-home') && visible($('#stock')), 'stock dashboard should show, ours should not');
      });
    },

    async course(check) {
      await check('course page shows every section on one page', async () => {
        await until(() => $$('.bm-section').length === 3, '3 sections');
        expect(texts('.bm-section-title').join('|') === 'General|Week 1|Week 2', 'section order');
        expect($$('.bm-section').every((s) => s.style.getPropertyValue('--c')), 'each section gets a colour (--c)');
      });
      await check('Slides chip shows only lecture slides', async () => {
        $('.bm-chip[data-chip="slides"]').click();
        const shown = $$('.bm-item').filter((li) => !li.hidden).map((li) => li.textContent);
        expect(shown.length === 2, `expected 2 slide decks, got ${shown.length}`);
        expect(shown.every((t) => /Lecture \d slides/.test(t)), 'only "Lecture N slides" should show');
        $('.bm-chip[data-chip="all"]').click();
        expect($$('.bm-item').every((li) => !li.hidden), 'All shows everything again');
      });
      await check('filter box narrows the list', async () => {
        const input = $('#bm-course .bm-input');
        input.value = 'starter';
        input.dispatchEvent(new Event('input'));
        const shown = $$('.bm-item').filter((li) => !li.hidden);
        expect(shown.length === 1 && shown[0].textContent.includes('Starter code'), 'only Starter code should match');
        input.value = '';
        input.dispatchEvent(new Event('input'));
      });
    },

    async coursePopAggressive(check) {
      await check('aggressive mode hides the General section', async () => {
        await until(() => $$('.bm-section').length === 2, '2 sections');
        expect(!texts('.bm-section-title').includes('General'), 'General should be hidden');
      });
      await check('Pop! theme: coloured, boxed sections', async () => {
        expect(html.dataset.bmTheme === 'pop', 'theme should be pop');
        const sec = $('.bm-section');
        expect(css(sec, 'background-color') !== 'rgba(0, 0, 0, 0)', 'section should have a colour fill');
        expect(parseFloat(css(sec, 'border-top-width')) >= 3, 'section should have a thick border');
      });
    },
  };

  (async () => {
    const results = [];
    const check = async (label, fn) => {
      try { await fn(); results.push(`PASS: ${name}: ${label}`); }
      catch (e) { results.push(`FAIL: ${name}: ${label} (${e.message})`); }
    };
    const run = SCENARIOS[name];
    if (!run) results.push(`FAIL: unknown scenario ${name}`);
    else await run(check);
    if (window.errors.length) results.push(`FAIL: ${name}: page errors: ${window.errors.join('; ')}`);
    else results.push(`PASS: ${name}: no page errors`);

    const all = JSON.parse(sessionStorage.getItem('bm-test-results') || '[]').concat(results);
    sessionStorage.setItem('bm-test-results', JSON.stringify(all));
    const queue = JSON.parse(sessionStorage.getItem('bm-test-queue') || '[]');
    if (queue.length) {
      sessionStorage.setItem('bm-test-queue', JSON.stringify(queue.slice(1)));
      location.href = queue[0];
    } else {
      location.href = '/tests/index.html?done';
    }
  })();
})();
