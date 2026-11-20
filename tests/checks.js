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
        expect(!texts('.bm-due-name').includes('Individual video presentation'), 'a closed item you cannot submit any more is not overdue');
        expect(!texts('.bm-due-name').includes('Mark the robot mazes'), 'staff grading deadlines are hidden');
        expect($('.bm-due-group').classList.contains('is-overdue'), 'first group should be Overdue');
        expect($('.bm-due-name').textContent.includes('Robot maze'), 'Robot maze should come first');
      });
      await check('courses: most recently used first, external image dropped, images shown in Pop!', async () => {
        await until(() => $$('.bm-course').length === 6, '6 courses');
        expect($('.bm-course').textContent.includes('Object-Oriented'), `Moodle's most recently accessed course should be first, got ${$('.bm-course').textContent}`);
        const imgs = $$('.bm-course-img');
        expect(imgs.length === 1, `only the safe data: image should be kept, got ${imgs.length}`);
        expect(css(imgs[0], 'display') === 'block', 'Pop! should show course images');
      });
      await check('a course you just opened jumps to the front', async () => {
        await BM.recent.visit(103);
        BM.home.visits = await BM.recent.all();
        BM.home.renderCourses((await BM.store.get('courses-v2')).v);
        expect($('.bm-course').textContent.includes('Theory of Computation'), 'visited course should be first');
        expect($$('.bm-course')[1].textContent.includes('Object-Oriented'), 'then Moodle order');
      });
      await check('hero: what is due, the next deadline and a ticking countdown', async () => {
        await until(() => $('.bm-hero:not([hidden]) .bm-hero-count'), 'hero');
        const lines = texts('.bm-hero-line');
        expect(lines.join('|') === '1 due this week.|1 overdue.', `headline should be "1 due this week. 1 overdue.", got ${lines.join(' ')}`);
        expect($('.bm-hero-next-name').textContent === 'Haskell sheet 1', 'next up should be Haskell sheet 1');
        expect(!$('.bm-hero-next').classList.contains('is-soon'), 'due in 26h is not "soon" (under a day)');
        const before = $('.bm-hero-count').textContent;
        expect(/^1d \d\d:\d\d:\d\d$/.test(before), `countdown should look like 1d 01:59:59, got ${before}`);
        await until(() => $('.bm-hero-count').textContent !== before, 'countdown to tick');
      });
      await check('courses sit in one sideways-scrolling row above the deadlines', async () => {
        await until(() => !$('.bm-course.bm-enter'), 'Pop! entrance animation to finish');
        const strip = $('.bm-course-strip');
        expect(strip.closest('.bm-panel').compareDocumentPosition($('#bm-h-due')) & Node.DOCUMENT_POSITION_FOLLOWING, 'courses should come before Due soon');
        const tops = new Set($$('.bm-course').map((c) => Math.round(c.getBoundingClientRect().top)));
        expect(tops.size === 1, `all course tiles should be on one row, got ${tops.size} rows`);
        expect(strip.scrollWidth > strip.clientWidth, '6 courses should overflow and scroll');
        const [prev, next] = $$('.bm-strip-btn');
        expect(!prev.hidden && prev.disabled && !next.disabled, 'at the start: left arrow off, right arrow on');
        next.click();
        await until(() => strip.scrollLeft > 0, 'strip to scroll right');
        await until(() => !prev.disabled, 'left arrow to turn on');
        strip.scrollLeft = strip.scrollWidth;
        await until(() => next.disabled, 'right arrow off at the end');
      });
      await check('announcements from the forum API, newest first', async () => {
        await until(() => $$('.bm-news-item').length === 2, '2 announcements');
        expect(texts('.bm-news-title')[0] === 'Problem class moved', 'newest announcement should be first');
      });
      await check('tick off a deadline, then undo it', async () => {
        const row = $$('.bm-due-row').find((r) => r.textContent.includes('Proofs problem set'));
        row.querySelector('.bm-check').click();
        expect(row.classList.contains('is-done'), 'row is marked done straight away');
        await until(() => !texts('.bm-due-name').includes('Proofs problem set'), 'row to fold away');
        expect((await BM.done.all())[903], 'remembered as done');
        await until(() => $('.bm-toast-btn'), 'Undo toast');
        $('.bm-toast-btn').click();
        await until(() => texts('.bm-due-name').includes('Proofs problem set'), 'Undo to bring it back');
        await BM.done.queue;
        expect(!(await BM.done.all())[903], 'no longer remembered as done');
      });
      await check('Announcements fold away and back; All forums and Feedback links', async () => {
        const head = $('.bm-news-panel .bm-fold-head');
        expect(head.getAttribute('aria-expanded') === 'true' && !$('#bm-news-body').hidden, 'Announcements start open');
        head.click();
        await until(() => $('#bm-news-body').hidden, 'Announcements to fold away');
        expect(localStorage.getItem('bm:fold:news') === '1', 'the choice is remembered');
        head.click();
        await until(() => !$('#bm-news-body').hidden, 'Announcements to open again');
        await until(() => !$('.bm-news-panel .bm-link-btn').hidden, 'All forums link');
        expect($('.bm-news-panel .bm-link-btn').getAttribute('href') === '/mod/forum/view.php?id=3011', 'All forums opens the forum page (newest announcement first)');
        const fb = $('.bm-feedback-panel a.bm-btn-primary');
        expect(fb && fb.getAttribute('href') === '/local/ucl_tracker/index.php', `Feedback opens the same page as the top bar's Feedback tracker, got ${fb && fb.getAttribute('href')}`);
        await until(() => !$('.bm-feedback-forums .bm-btn').hidden, 'Open forums button');
        const firstCourse = $('.bm-course').getAttribute('href').split('id=')[1];
        expect($('.bm-feedback-forums .bm-btn').getAttribute('href') === `/mod/forum/index.php?id=${firstCourse}`, 'Open forums goes to the most recently used course');
        expect(fb.closest('.bm-home-side') === $('.bm-news-panel').closest('.bm-home-side') &&
          ($('.bm-news-panel').compareDocumentPosition($('.bm-feedback-panel')) & Node.DOCUMENT_POSITION_FOLLOWING), 'Feedback sits below Announcements');
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
        if (wantsRing) {
          const move = (el) => {
            const b = el.getBoundingClientRect();
            el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: b.left + 5, clientY: b.top + 5 }));
            return b;
          };
          const b = move($('.bm-due-item'));
          const ring = $('.bm-cursor');
          expect(html.classList.contains('bm-cursor-on') && ring.classList.contains('is-on'), 'our cursor shows and the system pointer is hidden');
          expect(ring.style.transform.includes(`${b.left + 5}px`), 'the ring sits exactly on the pointer (no lag)');
          expect(ring.classList.contains('is-hot'), 'the ring grows over clickable things');
          expect(Math.round(ring.getBoundingClientRect().width) === 30, `ring is 30px, got ${ring.getBoundingClientRect().width}`);
          const input = document.createElement('input');
          document.body.append(input);
          move(input);
          expect(!html.classList.contains('bm-cursor-on') && getComputedStyle(input).cursor !== 'none', 'over a text box the normal text cursor comes back');
          input.remove();
        }
        await chrome.storage.local.set({ theme: 'not-a-theme' });
        expect(html.dataset.bmTheme === 'pop', 'unknown theme should fall back to pop');
        expect(window.notReloaded, 'page should not have reloaded');
      });
    },

    async homeSoft(check) {
      await check('Soft theme: tokens applied and course images shown', async () => {
        await until(() => $$('.bm-course').length === 6, '6 courses');
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
      await check('sections rise into view and end fully visible', async () => {
        await until(() => !$('.bm-reveal'), 'reveal to finish');
        expect($$('.bm-section').every((sec) => css(sec, 'opacity') === '1'), 'every section should end at full opacity');
      });
      await check('Weeks view: latest weeks open, General collapsed, your choices remembered', async () => {
        const folded = $$('.bm-section').map((sec) => sec.classList.contains('is-collapsed'));
        expect(folded.join() === 'true,false,false', `General collapsed, Week 1 and 2 open; got ${folded.join()}`);
        $$('.bm-section-head')[1].click();
        expect($$('.bm-section-head')[1].getAttribute('aria-expanded') === 'false', 'the arrow turns straight away');
        await until(() => $$('.bm-section')[1].classList.contains('is-collapsed'), 'Week 1 to fold away');
        expect(JSON.parse(localStorage.getItem('bm:fold:101'))['1001'] === true, 'the choice is saved for next time');
        $$('.bm-section-head')[1].click();
        await until(() => !$$('.bm-section')[1].classList.contains('is-collapsed'), 'Week 1 to open again');
      });
      await check('the tab highlight slides to the chosen tab', async () => {
        const pill = $('.bm-chip-pill');
        const at = (chip) => Math.abs(pill.getBoundingClientRect().left - $(`.bm-chip[data-chip="${chip}"]`).getBoundingClientRect().left) < 2;
        await until(() => at('weeks'), 'highlight under Weeks');
        $('.bm-chip[data-chip="forums"]').click();
        await until(() => at('forums'), 'highlight to slide to Forums');
        $('.bm-chip[data-chip="weeks"]').click();
        await until(() => at('weeks'), 'highlight back under Weeks');
      });
      await check('Weeks view: each week split into Slides, Files, Activities', async () => {
        const week1 = $$('.bm-section')[1];
        const shownHeads = [...week1.querySelectorAll('.bm-subhead')].filter((e) => !e.hidden).map((e) => e.textContent);
        expect(shownHeads.join('|') === 'Slides|Files|Activities', `got ${shownHeads.join('|')}`);
        const y = (sel) => week1.querySelector(sel).getBoundingClientRect().top;
        const order = [y('.bm-subhead[data-group="slides"]'), y('[data-slides="1"]'), y('.bm-subhead[data-group="files"]'),
          y('.bm-item[data-slides="0"][data-cat="files"]'), y('.bm-subhead[data-group="other"]'), y('.bm-item[data-cat="assess"]')];
        expect(order.every((v, i) => !i || v > order[i - 1]), 'Slides, then Files, then Activities');
        expect(!$$('.bm-section')[2].querySelector('.bm-subhead[data-group="other"]').hidden === false, 'no Activities heading in a week without activities');
      });
      await check('Slides & files: only material, each week split into Slides then Files', async () => {
        $('.bm-chip[data-chip="materials"]').click();
        const shown = $$('.bm-item').filter((li) => !li.hidden).map((li) => li.querySelector('.bm-item-name').textContent);
        expect(shown.sort().join('|') === 'Lab sheet 1|Lecture 1 slides|Lecture 2 slides|Module handbook|Starter code', `got ${shown.join('|')}`);
        const week1 = $$('.bm-section')[1];
        const top = (sel) => [...week1.querySelectorAll(sel)].find((e) => !e.hidden).getBoundingClientRect().top;
        const order = [top('.bm-subhead[data-group="slides"]'), top('[data-slides="1"]'), top('.bm-subhead[data-group="files"]'), top('.bm-item[data-slides="0"][data-cat="files"]')];
        expect(order.every((y, i) => !i || y > order[i - 1]), 'Slides heading, slides, Files heading, files, in that order');
        expect(getComputedStyle(week1.querySelector('.bm-items')).display !== 'none', 'collapsed weeks still show their material');
        $('.bm-chip[data-chip="weeks"]').click();
        expect(!$$('.bm-section')[1].querySelector('.bm-subhead[data-group="other"]').hidden, 'Weeks shows Activities again');
        expect($$('.bm-item').every((li) => !li.hidden), 'Weeks shows everything again');
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

    async forum(check) {
      const titles = () => texts('.bm-post-title');
      const card = (word) => $$('.bm-post').find((p) => p.textContent.includes(word));
      await check('a forum opens as a course feed, read from the forum pages (forum web services off, like UCL)', async () => {
        await until(() => $$('.bm-post').length === 4, '4 posts');
        expect($('#page-content').classList.contains('bm-replaced'), 'stock forum page hidden');
        expect($('.bm-forum-title').textContent === 'Principles of Programming.', `course title, got ${$('.bm-forum-title').textContent}`);
        expect($('.bm-rail-course[aria-current="page"]')?.textContent.includes('Principles of Programming'), 'this course highlighted in the rail');
        expect(texts('.bm-forum-tabs .bm-chip').map((t) => t.replace(/\d+$/, '')).join('|') === 'All forums|Announcements|Q&A forum', `tabs, got ${texts('.bm-forum-tabs .bm-chip').join('|')}`);
        expect($('.bm-forum-tabs [aria-selected="true"]').textContent.startsWith('Q&A forum'), 'opened forum is the selected tab');
        expect(!$('.bm-forum-note'), 'no error note');
      });
      await check('list details read from the page: author, replies, unread, pinned', async () => {
        const seg = card('Segfault');
        expect(seg.querySelector('.bm-post-author').textContent === 'Sam Student', 'author');
        expect(seg.querySelector('.bm-avatar').textContent === 'SS', 'default photo becomes initials');
        expect(seg.classList.contains('is-unread') && seg.querySelector('.bm-badge').textContent === '2 new', 'unread count (not mixed up with replies)');
        expect(titles()[0] === 'Coursework FAQ (read first)' && $('.bm-feed > .bm-h3').textContent === 'Pinned', 'pinned first');
      });
      await check('each post fills in from its discussion page: full text with working links', async () => {
        await until(() => card('Segfault')?.classList.contains('is-loaded'), 'the post to load');
        const seg = card('Segfault');
        const link = seg.querySelector('.bm-post-body a');
        expect(link && link.href === 'https://example.org/log' && link.target === '_blank' && link.rel.includes('noopener'), 'links in posts work and open safely in a new tab');
        await until(() => !card('Segfault').querySelector('.bm-post-more').hidden, 'a long post to offer Show more');
        card('Segfault').querySelector('.bm-post-more').click();
        expect(card('Segfault').querySelector('.bm-post-body').classList.contains('is-open'), 'Show more expands it');
        expect(card('Segfault').querySelector('a.bm-post-action[href="/mod/forum/post.php?reply=2020"]'), 'Reply answers the opening post');
      });
      await check('replies open right under the post, threaded', async () => {
        const seg = card('Segfault');
        const btn = [...seg.querySelectorAll('.bm-post-action')].find((b) => b.textContent === 'View 3 replies');
        btn.click();
        await until(() => seg.querySelectorAll('.bm-reply').length === 3, '3 replies');
        const top = [...seg.querySelectorAll('.bm-thread > .bm-replies > .bm-reply')].map((r) => r.querySelector('.bm-post-author').textContent);
        expect(top.join('|') === 'TA Priya|Alex Peer', `direct answers, got ${top.join('|')}`);
        const nested = seg.querySelector('.bm-reply .bm-replies .bm-post-author');
        expect(nested && nested.textContent === 'Sam Student', 'reply-to-a-reply nests under it');
        expect(seg.querySelector('.bm-reply-body a[href="https://example.org/gdb"]'), 'links in replies work');
        expect(!seg.classList.contains('is-unread'), 'reading the replies clears "new"');
        expect(btn.textContent === 'Hide replies', 'button flips to Hide replies');
      });
      await check('show, search and sort', async () => {
        const set = (i, v) => { const s = $$('#bm-forum .bm-select')[i]; s.value = v; s.dispatchEvent(new Event('change')); };
        set(0, 'mine');
        expect(titles().join('|') === 'Is recursion allowed in Q3?', `started by me, got ${titles().join('|')}`);
        set(0, 'all');
        const input = $('#bm-forum .bm-input');
        input.value = 'maze'; input.dispatchEvent(new Event('input'));
        expect(titles().join('|') === 'Segfault in the maze solver', 'search');
        input.value = ''; input.dispatchEvent(new Event('input'));
        set(1, 'replies');
        expect(titles()[0] === 'Segfault in the maze solver' && !$('.bm-feed > .bm-h3'), 'most replies first, no Pinned heading');
        set(1, 'activity');
      });
      await check('All forums merges every forum; a post names its forum', async () => {
        $('.bm-forum-tabs [data-forum="all"]').click();
        await until(() => $$('.bm-post').length === 5, '4 Q&A posts + 1 announcement');
        expect(location.pathname === '/mod/forum/index.php', 'address follows the tab');
        expect($('.bm-post-forum'), 'each post says which forum it is in');
      });
    },

    async forumCourse(check) {
      await check('course forum index opens the same feed, All forums selected', async () => {
        await until(() => $$('.bm-post').length === 5, '5 posts');
        expect($('.bm-forum-tabs [aria-selected="true"]').dataset.forum === 'all', 'All forums selected');
        const np = $('.bm-forum-head .bm-btn-primary');
        expect(!np.hidden && np.getAttribute('href') === '/mod/forum/post.php?forum=10' && np.textContent === 'New post in Q&A forum', 'New post goes to a forum students can post in');
      });
    },

    async forumNoPageContent(check) {
      await check('works on a UCL page with no #page-content (uses #region-main)', async () => {
        await until(() => $$('.bm-post').length === 1, '1 post');
        expect($('#region-main').classList.contains('bm-replaced'), 'the stock content is hidden');
        expect($('.bm-forum-title').textContent.startsWith('Discrete Mathematics'), 'the right course');
        expect(!$('.bm-forum-note'), 'no error note');
      });
    },

    async forumFails(check) {
      await check("if the forum pages fail to load, the Moodle page stays usable, says why, and doesn't stick", async () => {
        await until(() => $('.bm-forum-note'), 'the note');
        expect($('.bm-forum-note').textContent.includes("couldn't show its forum view"), 'explains what happened');
        expect($('.bm-forum-note button').textContent === 'Try again', 'offers Try again');
        expect(!$('#page-content').classList.contains('bm-replaced') && visible($('#stock')), 'Moodle page still shown');
        expect(localStorage.getItem('bm:classicForum') !== '1', 'not stuck on Classic view next time');
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
