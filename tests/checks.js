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
  // Forum: wide screens open a discussion in the reading pane, narrower ones right under the post.
  const wide = () => BM.forum.wide();
  const shown = (card) => (wide() ? $('.bm-reader') : card);
  const topReplies = (card) => [...shown(card).querySelectorAll(wide() ? '.bm-reader-replies > .bm-replies > .bm-reply' : '.bm-thread > .bm-replies > .bm-reply')];

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
      await check('courses: top left, all six visible at once, most recently used first', async () => {
        await until(() => $$('.bm-course').length === 6, '6 courses');
        expect($('.bm-course').textContent.includes('Object-Oriented'), `Moodle's most recently accessed course should be first, got ${$('.bm-course').textContent}`);
        expect($('.bm-home-layout').firstElementChild.contains($('.bm-course-grid')), 'courses are the main (left) column');
        const grid = $('.bm-course-grid').getBoundingClientRect();
        expect($$('.bm-course').every((c) => { const r = c.getBoundingClientRect(); return r.right <= grid.right + 1 && r.width > 150; }), 'no slider: every card is fully in view');
        expect(!$('.bm-course img'), 'no cover images: compact cards');
      });
      await check('a course you just opened jumps to the front', async () => {
        await BM.recent.visit(103);
        BM.home.visits = await BM.recent.all();
        BM.home.renderCourses((await BM.store.get('courses-v2')).v);
        expect($('.bm-course').textContent.includes('Theory of Computation'), 'visited course should be first');
        expect($$('.bm-course')[1].textContent.includes('Object-Oriented'), 'then Moodle order');
      });
      await check('right column: To do, Forums, Pinboard, Feedback tracker; small labels, no headline', async () => {
        expect(!$('.bm-hero') && !$('.bm-home-top kbd'), 'no headline, no "Press Ctrl K" line');
        const side = $('.bm-col[data-col="1"]');
        expect(side.contains($('.bm-due-list')) && side.contains($('[data-block="forums"]')) && side.contains($('.bm-pinboard')) && side.contains($('.bm-feedback-link')), 'all in the right column');
        expect(texts('.bm-sec-label').join('|') === 'Courses|To do|Forums|Pinboard', `labels, got ${texts('.bm-sec-label').join('|')}`);
        expect($$('.bm-block').every((b) => b.querySelector('.bm-grip')), 'every block has a handle');
      });
      await check('each card: this week, and Slides / Forum / Due / Grades with counts', async () => {
        await until(() => $$('.bm-course-week').some((m) => m.textContent.includes('Week 2')), 'this week on the cards');
        const t = $('.bm-course[data-id="101"]');
        const b = (k) => t.querySelector(`.bm-cbtn[data-kind="${k}"]`);
        expect(b('slides').getAttribute('href') === '/course/view.php?id=101#bm-slides', 'Slides opens the course at this week');
        expect(b('forum').getAttribute('href') === '/mod/forum/index.php?id=101', 'Forum opens its forum feed');
        expect(b('due').getAttribute('href') === '/course/view.php?id=101#bm-assess', "Due opens the course's assessments");
        expect(b('grades').getAttribute('href') === '/grade/report/user/index.php?id=101', 'Grades opens its grade report');
        await until(() => !b('due').querySelector('.bm-count').hidden, 'Due count');
        expect(b('due').textContent === 'Due2', `COMP0002 has 2 due this week (overdue + tomorrow), got ${b('due').textContent}`);
        await until(() => !b('forum').querySelector('.bm-count').hidden, 'Forum count');
        expect(Number(b('forum').querySelector('.bm-count').textContent) >= 1 && b('forum').classList.contains('has-count'), 'new forum posts counted');
        expect(t.querySelector('.bm-course-name').style.viewTransitionName === 'bm-course-101', 'name grows into the course page title');
      });
      await check('pick a course colour: used on its card and its deadlines', async () => {
        const t = $('.bm-course[data-id="101"]');
        t.querySelector('.bm-swatch-btn').click();
        await until(() => $('.bm-swatches'), 'colour choices');
        $$('.bm-swatches .bm-swatch')[3].click();
        await until(() => $('.bm-course[data-id="101"]').style.getPropertyValue('--c') === BM.PALETTE[3], 'card takes the colour');
        expect((await BM.colors.all())[101] === BM.PALETTE[3], 'colour remembered');
        expect($$('.bm-due-item').filter((a) => a.textContent.includes('COMP0002')).every((a) => a.style.getPropertyValue('--c') === BM.PALETTE[3]), "and used on that course's deadlines");
      });
      await check('drag a card to reorder; the order is remembered', async () => {
        const cards = () => $$('.bm-course').map((c) => c.dataset.id);
        const before = cards();
        const [a, b] = [$$('.bm-course')[0], $$('.bm-course')[2]];
        const dt = new DataTransfer();
        a.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
        const r = b.getBoundingClientRect();
        b.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.right - 5, clientY: r.top + 5 }));
        a.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
        const after = cards();
        expect(after[2] === before[0] && after[0] === before[1], `moved first card after the third, got ${after.join(',')}`);
        await until(async () => true, 'save');
        expect(JSON.stringify((await BM.store.get('course-order')).v) === JSON.stringify(after.map(Number)), 'order saved');
        BM.home.order = [];
        await BM.store.set('course-order', []);
        BM.home.renderCourses(BM.home.lastCourses);
      });
      await check('Pinboard: pinned files show as cards, with Unpin and Undo', async () => {
        expect($('.bm-board-empty') && !$('.bm-pin-card'), 'empty board says how to pin');
        await BM.pins.toggle({ kind: 'file', id: '2001', title: 'Lecture 1 slides', url: '/mod/resource/view.php?id=2001', course: 'COMP0002: Principles of Programming', courseId: 101 }, true);
        await BM.home.renderPins();
        expect($('.bm-pin-title').textContent === 'Lecture 1 slides' && $('.bm-pin-kind').textContent === 'File, COMP0002', `pinned file card, got ${$('.bm-pin-kind')?.textContent}`);
        $('.bm-pin-x').click();
        await until(() => !$('.bm-pin-card'), 'Unpin removes it');
        await until(() => $('.bm-toast-btn'), 'Undo toast');
        $('.bm-toast-btn').click();
        await until(() => $('.bm-pin-card'), 'Undo brings it back');
        $('.bm-pin-x').click();
        await until(() => !$('.bm-pin-card'), 'removed again');
        $('.bm-toast')?.remove();
      });
      await check('Pinboard: pin a deadline and a course from their own pin buttons', async () => {
        const row = $$('.bm-due-row').find((r) => r.textContent.includes('Haskell sheet 1'));
        row.querySelector('.bm-pin-sm').click();
        await until(() => $$('.bm-pin-card').some((c) => c.textContent.includes('Haskell sheet 1')), 'deadline on the board');
        const card = $$('.bm-pin-card').find((c) => c.textContent.includes('Haskell sheet 1'));
        expect(card.querySelector('.bm-pin-kind').textContent === 'Deadline, COMP0002' && card.querySelector('.bm-pin-when'), 'labelled as a deadline with its countdown');
        expect(row.querySelector('.bm-pin-sm').getAttribute('aria-pressed') === 'true', 'its pin button shows it is pinned');
        $('.bm-course[data-id="102"] .bm-pin-sm').click();
        await until(() => $$('.bm-pin-card').some((c) => c.dataset.kind === 'course'), 'course on the board');
        expect($('.bm-pin-card[data-kind="course"] .bm-pin-title').textContent === 'Discrete Mathematics', 'course card shows its name');
        expect($('.bm-pin-card').dataset.kind === 'course', 'newest pin first');
        $('.bm-toast')?.remove();
      });
      await check('Pinboard: add a note, type on it (saved), drag to reorder, pin a link', async () => {
        $$('[data-block="pinboard"] .bm-tool-btn').find((b) => b.textContent === '+ Note').click();
        const note = await until(() => $('.bm-pin-card.is-note'), 'a new note');
        const ta = note.querySelector('textarea');
        await until(() => document.activeElement === ta, 'note is ready to type in');
        ta.value = 'Ask about lab 3';
        ta.dispatchEvent(new Event('input'));
        ta.dispatchEvent(new Event('blur'));
        await BM.pins.queue;
        await until(async () => true, 'save');
        expect(Object.values(await BM.pins.all()).find((p) => p.kind === 'note').text === 'Ask about lab 3', 'note text saved');
        const keys = () => $$('.bm-pin-card').map((c) => c.dataset.key);
        const before = keys();
        const [a, b] = [$$('.bm-pin-card')[0], $$('.bm-pin-card')[2]];
        const dt = new DataTransfer();
        a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        a.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
        const r = b.getBoundingClientRect();
        b.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.right - 3, clientY: r.bottom - 3 }));
        a.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
        await BM.pins.queue;
        await until(async () => true, 'save');
        const after = keys();
        expect(after[2] === before[0], `note moved after the third card, got ${after.join(',')}`);
        expect((await BM.pins.list()).map(BM.pins.key).join() === after.join(), 'order remembered');
        $$('[data-block="pinboard"] .bm-tool-btn').find((x) => x.textContent === '+ Link').click();
        const form = await until(() => $('.bm-link-form'), 'link form');
        form.querySelector('input[type="url"]').value = 'javascript:alert(1)';
        form.requestSubmit();
        await sleep(50);
        expect($('.bm-form-msg').textContent && !$$('.bm-pin-card').some((c) => c.dataset.kind === 'link'), 'non-web addresses are refused');
        form.querySelector('input[type="url"]').value = 'https://www.ucl.ac.uk/timetable';
        form.querySelector('input[type="text"]').value = 'Timetable';
        form.requestSubmit();
        await until(() => $('.bm-pin-card[data-kind="link"]'), 'link card');
        expect($('.bm-pin-card[data-kind="link"] a').href === 'https://www.ucl.ac.uk/timetable' && !$('.bm-link-form'), 'link pinned, form closed');
      });
      await check('blocks: drag one by its title bar onto another; a line shows where; remembered', async () => {
        const todo = $('[data-block="todo"]');
        const courses = $('[data-block="courses"]');
        const dt = new DataTransfer();
        todo.querySelector('.bm-grip').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        expect(todo.draggable, 'picked up by the handle');
        todo.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
        const r = courses.getBoundingClientRect();
        courses.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width / 2, clientY: r.top + 5 }));
        expect($('.bm-drop-line') && $('.bm-drop-line').nextElementSibling === courses, 'line shows above Courses');
        courses.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        todo.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
        expect($('.bm-col[data-col="0"]').firstElementChild === todo && !$('.bm-drop-line') && !todo.draggable, 'To do now sits above Courses');
        await until(async () => true, 'save');
        expect(JSON.stringify((await BM.store.get('home-layout')).v.cols[0]) === '["todo","courses"]', 'layout saved');
        const head = $('[data-block="forums"] .bm-block-head');
        head.querySelector('.bm-fold-head').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        expect($('[data-block="forums"]').draggable, 'the whole title bar picks a block up too');
        dispatchEvent(new PointerEvent('pointerup'));
        expect(!$('[data-block="forums"]').draggable, 'and lets go again');
      });
      await check('blocks: handle menu moves and hides; Alt+arrows move; Customise shows it again', async () => {
        const todo = () => $('[data-block="todo"]');
        todo().querySelector('.bm-grip').click();
        const menu = await until(() => $('.bm-menu[role="menu"]'), 'menu');
        const labels = [...menu.querySelectorAll('.bm-menu-item span')].map((s) => s.textContent);
        expect(labels.join('|') === 'Move down|New column on the left|Move right|Full width|Fold|Hide block', `menu items, got ${labels.join('|')}`);
        expect(document.activeElement === menu.querySelector('.bm-menu-item'), 'focus goes into the menu');
        [...menu.querySelectorAll('.bm-menu-item')].find((b) => b.textContent.startsWith('Move right')).click();
        expect($('.bm-col[data-col="1"]').contains(todo()) && !$('.bm-menu'), 'moved right, menu closed');
        todo().querySelector('.bm-grip').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true }));
        expect($('.bm-col[data-col="0"]').contains(todo()), 'Alt+Left moves it back');
        todo().querySelector('.bm-grip').click();
        [...$('.bm-menu').querySelectorAll('.bm-menu-item')].find((b) => b.textContent === 'Hide block').click();
        expect(!todo(), 'hidden');
        $('.bm-toast')?.remove();
        $('.bm-customise').click();
        const panel = await until(() => $('.bm-custom'), 'Customise panel');
        const box = [...panel.querySelectorAll('.bm-custom-check')].find((l) => l.textContent === 'To do').querySelector('input');
        expect(!box.checked, 'To do is unticked');
        box.click();
        expect(todo() && !(await BM.store.get('home-layout')).v.hidden.includes('todo'), 'ticking shows it again');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(!$('.bm-custom'), 'Escape closes Customise');
      });
      await check('blocks: fold one by clicking its name (remembered)', async () => {
        const head = $('[data-block="forums"] .bm-fold-head');
        head.click();
        await until(() => $('#bm-body-forums').hidden, 'to fold away');
        expect((await BM.store.get('home-layout')).v.folded.forums, 'remembered');
        head.click();
        await until(() => !$('#bm-body-forums').hidden, 'to open again');
      });
      // Drag helper: pick `id` up, hover `target` at (fx, fy) of its box, drop.
      const dragTo = (id, target, fx, fy) => {
        const sec = $(`[data-block="${id}"]`);
        const dt = new DataTransfer();
        sec.querySelector('.bm-grip').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        sec.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
        const r = target.getBoundingClientRect();
        target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + r.width * fx, clientY: r.top + r.height * fy }));
        const marks = { right: target.classList.contains('is-drop-right'), left: target.classList.contains('is-drop-left'), line: !!$('.bm-drop-line') };
        target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        sec.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
        return marks;
      };
      await check('layout by dragging: the side of a block makes a new column; an emptied column closes', async () => {
        const marks = dragTo('pinboard', $('[data-block="forums"]'), 0.97, 0.5);
        expect(marks.right && !marks.line, 'a bar on the right edge (not a line) shows a new column is coming');
        expect($$('.bm-col').length === 3 && $('.bm-col[data-col="2"]').firstElementChild.dataset.block === 'pinboard', `Pinboard got its own third column, got ${$$('.bm-col').length} columns`);
        expect($$('.bm-gutter').length === 2, 'a resizable gap between each pair of columns');
        expect(!$('.is-drop-right'), 'the bar goes away');
        dragTo('pinboard', $('[data-block="forums"]'), 0.5, 0.9);
        expect($$('.bm-col').length === 2 && $('[data-block="forums"]').nextElementSibling.dataset.block === 'pinboard', 'stacked back under Forums; the empty column closed');
        expect((await BM.store.get('home-layout')).v.cols.length === 2, 'remembered');
      });
      await check('layout by dragging: the strip at the top makes a block full width', async () => {
        dragTo('courses', $('.bm-top-drop'), 0.5, 0.5);
        expect($('.bm-top-row').firstElementChild.dataset.block === 'courses' && $('.bm-top-row').classList.contains('has-blocks'), 'Courses spans the page');
        expect($$('.bm-col').length === 1, 'its old column closed, the rest fill the width');
        $('[data-block="courses"] .bm-grip').click();
        [...$('.bm-menu').querySelectorAll('.bm-menu-item')].find((b) => b.textContent === 'Back into the columns').click();
        expect(!$('.bm-top-row').classList.contains('has-blocks') && $('.bm-col[data-col="0"]').firstElementChild.dataset.block === 'courses', 'and back into the columns');
      });
      await check('layout by dragging: drag the gap between columns to resize; double-click evens them', async () => {
        $('[data-block="todo"] .bm-grip').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));
        expect($$('.bm-col').length === 2, 'two columns again');
        const g = $('.bm-gutter');
        const before = BM.layout.state.widths.slice();
        g.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(BM.layout.state.widths[0] > before[0], `left column wider, ${before} -> ${BM.layout.state.widths}`);
        const r = g.getBoundingClientRect();
        g.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + 10, pointerId: 1 }));
        g.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left - 90, pointerId: 1 }));
        g.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.left - 90, pointerId: 1 }));
        const after = BM.layout.state.widths;
        expect(after[0] / after[1] < before[0] / before[1] + 1 && $('.bm-home-layout').style.gridTemplateColumns.includes('28px'), 'dragging the gap changes the widths');
        $('.bm-gutter').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
        expect(BM.layout.state.widths[0] === BM.layout.state.widths[1], 'double-click: even');
        await until(async () => true, 'save');
        expect(JSON.stringify((await BM.store.get('home-layout')).v.widths) === JSON.stringify(BM.layout.state.widths), 'widths remembered');
      });
      await check('Customise: theme, course slider, blocks, reset (no layout menu: you drag instead)', async () => {
        $('.bm-customise').click();
        const pick = (label) => [...$('.bm-custom').querySelectorAll('.bm-opt')].find((b) => b.textContent === label).click();
        expect(texts('.bm-custom-h').join('|') === 'Theme|Courses|Blocks', `sections, got ${texts('.bm-custom-h').join('|')}`);
        pick('Slider');
        expect($('.bm-course-grid').classList.contains('is-slider'), 'courses become a slider');
        expect($('[data-block="courses"] .bm-seg-btn[data-view="slider"]').getAttribute('aria-pressed') === 'true', 'the switch on the block agrees');
        const strip = $('.bm-course-grid');
        expect(strip.scrollWidth > strip.clientWidth && !$('.bm-strip-btn').hidden, 'it scrolls sideways, with arrows');
        pick('Night');
        expect(html.dataset.bmTheme === 'night' && css(html, '--bm-bg') === '#16191e', 'Night theme applied');
        expect((await chrome.storage.local.get('theme')).theme === 'night', 'theme saved for the popup and other tabs');
        expect($('.bm-custom .bm-opt[aria-pressed="true"]:has(.bm-theme-sw)').textContent === 'Night', 'Night shows as chosen');
        pick('Sage');
        expect(html.dataset.bmTheme === 'sage' && css(html, '--bm-accent') === '#2f6b4a', 'Sage theme applied');
        pick('Pop!');
        [...$('.bm-custom').querySelectorAll('.bm-link-btn')].find((b) => b.textContent === 'Reset layout').click();
        expect($$('.bm-col').length === 2 && $('.bm-col[data-col="0"]').firstElementChild.dataset.block === 'courses' && !$('.bm-course-grid').classList.contains('is-slider'), 'reset: back to courses + side column, grid');
        expect(JSON.stringify(BM.layout.state.widths) === '[2.6,1]', 'and the default widths');
        $('.bm-toast')?.remove();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      await check('courses: the switch on the block flips grid and slider', async () => {
        $('[data-block="courses"] .bm-seg-btn[data-view="slider"]').click();
        expect($('.bm-course-grid').classList.contains('is-slider'), 'slider');
        expect((await BM.store.get('home-layout')).v.courses === 'slider', 'remembered');
        $('[data-block="courses"] .bm-seg-btn[data-view="grid"]').click();
        expect(!$('.bm-course-grid').classList.contains('is-slider') && $('.bm-strip-btn').hidden, 'back to the grid, no arrows');
      });
      await check('instant pages: Chrome may load view pages early, never logout/posting/discussions', async () => {
        const rules = $('script[type="speculationrules"]');
        if (!HTMLScriptElement.supports?.('speculationrules')) { expect(!rules, 'only added where supported'); return; }
        const json = JSON.parse(rules.textContent).prerender[0].where.and;
        const text = JSON.stringify(json);
        expect(text.includes('/course/view.php') && text.includes('/mod/forum/index.php'), 'courses and forums load early');
        for (const bad of ['logout', 'sesskey', 'post.php', 'discuss.php']) expect(text.includes(bad), `excludes ${bad}`);
      });
      await check('live alerts: a new forum post pops up a toast', async () => {
        expect((await BM.app.live.check()).length === 0, 'first check just remembers what is there');
        const seen = (await BM.store.get('live-seen')).v;
        await BM.store.set('live-seen', seen.filter((k) => !k.startsWith('77:')));
        const fresh = await BM.app.live.check();
        expect(fresh.length === 1 && fresh[0].title === 'Problem class moved', 'the new post is found');
        await until(() => $('.bm-toast')?.textContent.includes('New in COMP0147: Problem class moved'), 'toast');
        $('.bm-toast').remove();
      });
      await check('Forums panel: newest posts from every forum in every course, new ones tagged', async () => {
        await until(() => $$('.bm-news-item').length === 5, '5 newest forum posts');
        const t = texts('.bm-news-title');
        expect(t[0] === 'Problem class moved' && t[1] === 'Segfault in the maze solver', `newest first, got ${t.slice(0, 2).join(' | ')}`);
        expect($$('.bm-news-item')[1].textContent.includes('Q&A forum'), 'not just announcements: Q&A posts too, with the forum named');
        const isNew = (title) => { const a = $$('.bm-news-item').find((x) => x.textContent.includes(title)); if (!a) throw new Error(`no "${title}" in ${texts('.bm-news-title').join(' | ')}`); return a.classList.contains('is-new'); };
        expect(isNew('Problem class moved') && isNew('Lab room change'), 'recent or unread posts are tagged New');
        const faq = BM.home.news.find((n) => n.title.startsWith('Coursework FAQ'));
        expect(BM.home.news.length === 8 && faq && !(faq.unread > 0 || faq.ts > BM.home.newSince), 'an old, read post is not new (and only the newest 5 are listed)');
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
      await check('Forums: posts and Open forums go to our feed; Feedback tracker below', async () => {
        const head = $('[data-block="forums"] .bm-fold-head');
        expect(head.textContent === 'Forums', 'block is called Forums');
        expect($('.bm-news-item').getAttribute('href') === '/mod/forum/index.php?id=102#post=77', `a post opens our feed at that post, got ${$('.bm-news-item').getAttribute('href')}`);
        expect(head.getAttribute('aria-expanded') === 'true' && !$('#bm-body-forums').hidden, 'starts open');
        const fb = $('.bm-feedback-link');
        expect(fb && fb.getAttribute('href') === '/local/ucl_tracker/index.php', `Feedback tracker = the top bar's link, got ${fb && fb.getAttribute('href')}`);
        expect(fb.textContent.trim().startsWith('Feedback tracker'), 'just the name, no explaining sentence');
        await until(() => !$('.bm-open-forums').hidden, 'Open forums button');
        const firstCourse = $('.bm-course').dataset.id;
        expect($('.bm-open-forums').getAttribute('href') === `/mod/forum/index.php?id=${firstCourse}`, 'Open forums opens your most recently used course');
        expect($('[data-block="forums"]').compareDocumentPosition($('.bm-feedback-link')) & Node.DOCUMENT_POSITION_FOLLOWING, 'Feedback tracker sits below Forums');
        expect($$('.bm-news-item').length <= 5, 'at most 5 posts in the column');
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
        expect(!$('.bm-cursor'), 'no cursor ring outside Pop!');
        await chrome.storage.local.set({ theme: 'pop' });
        expect(html.dataset.bmTheme === 'pop', 'theme should be pop');
        expect(localStorage.getItem('bm:theme') === 'pop', 'theme should be mirrored for early.js');
        expect(css(document.body, 'background-image').includes('radial-gradient'), 'Pop! should give dot-paper background');
        const wantsRing = matchMedia('(pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches;
        expect(!!$('.bm-cursor') === wantsRing, 'cursor ring should exist only with a mouse and motion allowed');
        if (wantsRing) {
          const move = (el) => {
            // Whole pixels: a synthetic pointer event can round fractional coordinates.
            const r = el.getBoundingClientRect();
            const b = { left: Math.round(r.left), top: Math.round(r.top) };
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
      await check('Soft theme: tokens applied', async () => {
        await until(() => $$('.bm-course').length === 6, '6 courses');
        expect(html.dataset.bmTheme === 'soft', 'theme should be soft');
        expect(css(html, '--bm-accent') === '#315f85', `accent should be #315f85, got ${css(html, '--bm-accent')}`);
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
      await check('files added since your last visit are tagged New', async () => {
        await until(() => $$('.bm-item.is-new').length === 2, 'two new files');
        expect(texts('.bm-item.is-new .bm-item-name').map((t) => t.replace(/New$/, '')).sort().join('|') === 'Lecture 2 slides|Starter code', 'the right ones');
      });
      await check('week progress ring fills as you open files', async () => {
        const ring = () => $$('.bm-section')[1].querySelector('.bm-ring');
        expect(ring().dataset.done === '0' && ring().dataset.total === '2', `Week 1 starts at 0/2, got ${ring().dataset.done}/${ring().dataset.total}`);
        BM.opened.mark('2002');
        await until(() => ring().dataset.done === '1', 'ring to show 1/2');
        expect($('.bm-item[data-id="2002"]').classList.contains('is-opened'), 'the file looks opened');
      });
      await check('Quick look: Space previews a file full screen, arrows flip, Esc closes', async () => {
        $('.bm-item[data-id="2001"] .bm-item-link').focus();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        await until(() => $('.bm-ql') && !$('.bm-ql').hidden, 'Quick look');
        expect($('.bm-ql iframe').getAttribute('src').includes('id=2001'), 'shows that file');
        const first = $('.bm-ql-count').textContent;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect($('.bm-ql-count').textContent !== first, 'arrow goes to the next file');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect($('.bm-ql').hidden, 'Esc closes');
        expect(BM.opened.cache['2001'], 'previewing counts as opened');
      });
      await check('pin a file to the dashboard', async () => {
        const btn = $('.bm-item[data-id="2005"] .bm-pin');
        btn.click();
        await until(async () => true, 'click');
        await BM.pins.queue;
        expect(btn.getAttribute('aria-pressed') === 'true' && (await BM.pins.all())['file:2005'], 'pinned');
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
        const shown = $$('.bm-item').filter((li) => !li.hidden).map((li) => li.querySelector('.bm-item-name').textContent.replace(/New$/, ''));
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
        await until(() => shown(seg).querySelectorAll('.bm-reply').length === 3, '3 replies');
        const top = topReplies(seg).map((r) => r.querySelector('.bm-post-author').textContent);
        expect(top.join('|') === 'TA Priya|Alex Peer', `direct answers, got ${top.join('|')}`);
        const nested = shown(seg).querySelector('.bm-reply .bm-replies .bm-post-author');
        expect(nested && nested.textContent === 'Sam Student', 'reply-to-a-reply nests under it');
        expect(shown(seg).querySelector('.bm-reply-body a[href="https://example.org/gdb"]'), 'links in replies work');
        expect(!seg.classList.contains('is-unread'), 'reading the replies clears "new"');
        expect(wide() ? seg.classList.contains('is-reading') : btn.textContent === 'Hide replies', 'button flips to Hide replies (or the post is marked as the one being read)');
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
        await until(() => $$('.bm-post').length === 3, '3 posts (Announcements + the Advanced Forum)');
        expect($('#region-main').classList.contains('bm-replaced'), 'the stock content is hidden');
        expect($('.bm-forum-title').textContent.startsWith('Discrete Mathematics'), 'the right course');
        expect(!$('.bm-forum-note'), 'no error note');
      });
    },

    // UCL's Q&A boards are often Advanced Forum (mod/hsuforum): different pages, different markup.
    async forumAdvanced(check) {
      const card = (t) => $$('.bm-post').find((p) => p.querySelector('.bm-post-title').textContent === t);
      await check('Advanced Forum: its discussions are in the feed, with its own tab', async () => {
        await until(() => card('Induction help') && card('Proof by contradiction?'), 'both Advanced Forum posts');
        expect(texts('.bm-forum-tabs .bm-chip').some((t) => t.startsWith('Discussion board')), `tab for the board, got ${texts('.bm-forum-tabs .bm-chip').join('|')}`);
        expect(card('Induction help').dataset.id === 'h901', 'Advanced Forum ids never clash with mod/forum ones');
        expect(card('Induction help').querySelector('.bm-post-title a').getAttribute('href') === '/mod/hsuforum/discuss.php?d=901', 'title opens the Advanced Forum page');
        expect($('.bm-forum-head .bm-btn-primary').getAttribute('href') === '/mod/hsuforum/post.php?forum=12', 'New post goes to the board');
      });
      await check('Advanced Forum: replies load, the latest two show under the post, and they nest properly', async () => {
        const c = card('Induction help');
        await until(() => c.isConnected ? c.classList.contains('is-loaded') : card('Induction help').classList.contains('is-loaded'), 'post loaded');
        const p = card('Induction help');
        expect(p.querySelector('.bm-post-body').textContent.includes('Opening post of Induction help'), 'opening post text');
        const prev = [...p.querySelectorAll('.bm-preview-item .bm-post-author')].map((e) => e.textContent);
        expect(prev.join('|') === 'Dana Student|Alex Peer', `latest two replies previewed, oldest first, got ${prev.join('|')}`);
        const said = [...p.querySelectorAll('.bm-preview-text p')].map((e) => e.textContent);
        expect(said.join('|') === 'Thanks, that fixed it!|Or n = 0 if it holds there.', `just what they wrote (no name or date), got ${said.join('|')}`);
        expect(!/null/.test($('.bm-feed').firstChild.textContent || ''), 'no stray "null" text above the posts');
        const btn = [...p.querySelectorAll('.bm-post-action')].find((b) => b.textContent === 'View 3 replies');
        expect(btn, 'reply count');
        btn.click();
        await until(() => shown(p).querySelectorAll('.bm-reply').length === 3, '3 replies');
        const top = topReplies(p).map((r) => r.querySelector('.bm-reply-head .bm-post-author').textContent);
        expect(top.join('|') === 'TA Priya|Alex Peer', `two answers to the opening post, got ${top.join('|')}`);
        expect(shown(p).querySelector('.bm-reply .bm-replies .bm-post-author')?.textContent === 'Dana Student', "Dana's thanks sits under Priya's answer");
        expect(shown(p).querySelector('.bm-reply a.bm-post-action[href="/mod/hsuforum/post.php?reply=9011"]'), 'Reply uses the Advanced Forum form');
      });
      await check("Advanced Forum: a post the list gives no count for still opens its replies", async () => {
        card('Proof by contradiction?').scrollIntoView(); // posts load as they come near the screen
        const p = await until(() => card('Proof by contradiction?')?.classList.contains('is-loaded') && card('Proof by contradiction?'), 'loaded');
        const btn = [...p.querySelectorAll('.bm-post-action')].find((b) => b.textContent === 'View 1 reply');
        expect(btn && !btn.disabled, `counted from the discussion page, got ${p.querySelector('.bm-post-foot').textContent}`);
      });
    },

    async forumAdvancedView(check) {
      await check('an Advanced Forum page opens the feed on that board', async () => {
        await until(() => $('.bm-post'), 'feed');
        expect($('.bm-forum-tabs .bm-chip[aria-selected="true"]').textContent.startsWith('Discussion board'), 'the board is the selected tab');
        expect($$('.bm-post').every((p) => p.dataset.id.startsWith('h')), 'only its posts');
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

    async courseSlides(check) {
      await check("Slides on a course tile opens Slides & files at this week", async () => {
        await until(() => $$('.bm-section').length === 3, 'sections');
        await until(() => $('.bm-chip[data-chip="materials"]').getAttribute('aria-pressed') === 'true', 'Slides & files selected');
        expect(!location.hash, 'the address is tidied');
      });
    },

    async forumDeep(check) {
      await check('opening a post from the dashboard: our feed, scrolled to it, replies open', async () => {
        await until(() => $('.bm-post.is-target'), 'the post highlighted');
        const card = $('.bm-post.is-target');
        expect(card.dataset.id === '202', 'the right post');
        try { await until(() => shown(card).querySelectorAll('.bm-reply').length === 3, 'its replies open'); }
        catch (e) { const f = card.querySelector('.bm-post-foot'); throw new Error(`${e.message}; connected=${card.isConnected} foot=${f && f.textContent} expanded=${f && f.querySelector('[aria-expanded]')?.getAttribute('aria-expanded')} thread=${card.querySelector('.bm-thread')?.textContent.slice(0, 80)}`); }
      });
      await check('pin a forum post', async () => {
        const btn = [...$('.bm-post[data-id="202"]').querySelectorAll('.bm-post-action')].find((b) => b.textContent === 'Pin');
        btn.click();
        await BM.pins.queue;
        expect(btn.textContent === 'Pinned' && (await BM.pins.all())['post:202'].url === '/mod/forum/index.php?id=101#post=202', 'pinned, linking back into the feed');
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
