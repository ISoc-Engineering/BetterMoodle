// Dashboard (/my/), laid out like the student dashboards people rate best (Canvas, Classroom):
//   Main (top left, where eyes go first): every current course as a compact card, all visible, most
//     recently used first or in your own dragged order. Each card says what needs attention inside it:
//     Slides (new files), Forum (new posts), Due (deadlines this week), Grades.
//   Right column: To do (deadlines, tick-off), Forums (5 newest posts, open our feed), Pinned, and the
//     Feedback tracker.
// The stock dashboard sits behind a toggle.
var BM = globalThis.BM;

BM.home = {
  counts: { forum: {}, due: {} }, // per course id, filled as the data arrives

  async init() {
    // UCL's dashboard has no #page-content: the block regions sit in #topofscroll > .row.
    const anchor = document.querySelector('#page-content') || document.querySelector('#topofscroll > .row');
    if (!anchor) return;
    const h = BM.h;

    let classic = false;
    try { classic = localStorage.getItem('bm:classicHome') === '1'; } catch (_) {}

    this.coursesEl = h('ul', { class: 'bm-course-grid' }, h('li', { class: 'bm-muted' }, 'Loading courses…'));
    this.dueEl = h('div', { class: 'bm-due-list' }, h('p', { class: 'bm-muted' }, 'Loading deadlines…'));
    this.newsEl = h('div', { class: 'bm-news' }, h('p', { class: 'bm-muted' }, 'Loading forums…'));
    this.pinsPanel = h('section', { class: 'bm-side-block bm-pins-panel', 'aria-labelledby': 'bm-h-pins', hidden: true });
    const toggle = h('button', { class: 'bm-link-btn' });
    const body = h('div', { class: 'bm-home-layout' },
      h('section', { class: 'bm-home-main', 'aria-labelledby': 'bm-h-courses' },
        h('h2', { class: 'bm-sec-label', id: 'bm-h-courses' }, 'Courses'),
        this.coursesEl),
      h('aside', { class: 'bm-home-side', 'aria-label': 'To do and updates' },
        h('section', { class: 'bm-side-block', 'aria-labelledby': 'bm-h-due' }, h('h2', { class: 'bm-sec-label', id: 'bm-h-due' }, 'To do'), this.dueEl),
        this.newsPanel(),
        this.pinsPanel,
        h('a', { class: 'bm-feedback-link', href: this.feedbackUrl() }, 'Feedback tracker', h('span', { 'aria-hidden': 'true' }, '›'))));
    const root = h('div', { id: 'bm-home', class: 'bm-root' },
      h('div', { class: 'bm-home-top' }, h('div', { class: 'bm-spacer' }), toggle),
      body);
    anchor.before(root);

    const setClassic = (v) => {
      classic = v;
      try { localStorage.setItem('bm:classicHome', v ? '1' : '0'); } catch (_) {}
      anchor.classList.toggle('bm-replaced', !v);
      body.hidden = v;
      toggle.textContent = v ? 'Use BetterMoodle dashboard' : 'Classic dashboard';
    };
    toggle.addEventListener('click', () => setClassic(!classic));
    setClassic(classic);

    const err = (el) => () => el.replaceChildren(h('p', { class: 'bm-muted' }, "Couldn't load this. Try refreshing, or use the classic dashboard."));
    this.done = await BM.done.all();
    this.visits = await BM.recent.all();
    this.order = (await BM.store.get('course-order'))?.v || [];
    this.renderPins();
    BM.store.swr('deadlines-v2', 5 * 60 * 1000, () => BM.api.deadlines(), (ev) => this.renderDue(ev), err(this.dueEl));
    const courses = await BM.store.swr('courses-v2', 60 * 60 * 1000, () => BM.api.courses(), (c) => this.renderCourses(c), err(this.coursesEl));

    // Forums: the newest posts in every forum of every current course, read from the forum pages
    // (UCL blocks the forum web services). "New" = since your previous dashboard visit, or unread in
    // Moodle. If the pages can't be read, fall back to the forum links in the stock dashboard blocks.
    let seen = 0;
    try { seen = Number(localStorage.getItem('bm:forumSeen')) || 0; } catch (_) {}
    this.newSince = seen || BM.now() - 3 * 86400;
    BM.whenShown(() => setTimeout(() => { try { localStorage.setItem('bm:forumSeen', String(BM.now())); } catch (_) {} }, 4000));
    await BM.store.swr('forum-updates-v2', 10 * 60 * 1000, async () => {
      try {
        return await BM.forumData.recent(courses || [], 30);
      } catch (e) {
        const scraped = this.scrapeNews(anchor);
        if (scraped.length) return scraped;
        throw e;
      }
    }, (n) => this.renderNews(n), () => this.newsEl.replaceChildren(h('p', { class: 'bm-muted' }, "Couldn't load the forums.")));
  },

  // ---------------------------------------------------------------- courses

  // Your dragged order first (if any), then most recently used, then Moodle's last-accessed order.
  sortCourses(courses) {
    const api = new Map(courses.map((c, i) => [c.id, i]));
    const mine = new Map(this.order.map((id, i) => [Number(id), i]));
    const v = this.visits || {};
    return courses.slice().sort((a, b) =>
      ((mine.has(a.id) ? mine.get(a.id) : 1e6) - (mine.has(b.id) ? mine.get(b.id) : 1e6)) ||
      ((v[b.id] || 0) - (v[a.id] || 0)) || (api.get(a.id) - api.get(b.id)));
  },

  renderCourses(courses) {
    const h = BM.h;
    this.lastCourses = courses;
    if (!courses.length) { this.coursesEl.replaceChildren(h('li', { class: 'bm-muted' }, 'No current courses.')); return; }
    const first = !this.coursesEl.querySelector('.bm-course');
    const sorted = this.sortCourses(courses);
    this.coursesEl.replaceChildren(...sorted.map((c) => this.card(c)));
    if (first) BM.enter(this.coursesEl.querySelectorAll('.bm-course'));
    if (this.forumsLink && sorted[0]) { this.forumsLink.href = BM.forumLink(sorted[0].id); this.forumsLink.hidden = false; }
  },

  card(c) {
    const h = BM.h;
    const [code, ...rest] = c.name.split(':');
    const hasCode = rest.length && /^[A-Z]{3,5}\d{3,5}/.test(code.trim());
    const week = h('span', { class: 'bm-course-week bm-small' });
    const btn = (kind, label, href) => h('a', { class: 'bm-cbtn', href, draggable: 'false', dataset: { kind } },
      h('span', {}, label), h('span', { class: 'bm-count', hidden: true }));
    const li = h('li', { class: 'bm-course', draggable: 'true', dataset: { id: c.id }, style: `--c:${BM.courseColor(c.id)}` },
      h('div', { class: 'bm-course-head' },
        h('a', { class: 'bm-course-main', href: `/course/view.php?id=${c.id}`, draggable: 'false' },
          h('span', { class: 'bm-course-code' }, c.fav ? '★ ' : '', hasCode ? code.trim() : c.short),
          // Same name as the course page title, so it grows into it on the way there.
          h('span', { class: 'bm-course-name', style: `view-transition-name: bm-course-${c.id}` }, hasCode ? rest.join(':').trim() : c.name)),
        this.colorButton(c)),
      week,
      h('div', { class: 'bm-course-actions' },
        btn('slides', 'Slides', `/course/view.php?id=${c.id}#bm-slides`),
        btn('forum', 'Forum', BM.forumLink(c.id)),
        btn('due', 'Due', `/course/view.php?id=${c.id}#bm-assess`),
        btn('grades', 'Grades', `/grade/report/user/index.php?id=${c.id}`)));
    this.dragHandlers(li);
    this.fillCourse(c.id, li, week);
    this.setCount(li, 'forum', this.counts.forum[c.id]);
    this.setCount(li, 'due', this.counts.due[c.id]);
    return li;
  },

  setCount(card, kind, n) {
    const el = card?.querySelector(`.bm-cbtn[data-kind="${kind}"] .bm-count`);
    if (!el) return;
    el.hidden = !n;
    el.textContent = n ? String(n) : '';
    el.closest('.bm-cbtn').classList.toggle('has-count', !!n);
  },

  // This week's title and files added since you last opened the course.
  async fillCourse(courseId, card, week) {
    try {
      const info = await BM.courseInfo.get(courseId);
      if (!info) return;
      week.textContent = info.weekTitle || '';
      this.setCount(card, 'slides', (await BM.courseInfo.newFiles(courseId, info.files)).length);
    } catch (_) { /* the card still works without it */ }
  },

  // Drag a card onto another to reorder; the order is remembered.
  dragHandlers(li) {
    li.addEventListener('dragstart', (e) => {
      this.dragging = li;
      li.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', li.dataset.id);
    });
    li.addEventListener('dragend', () => {
      li.classList.remove('is-dragging');
      this.dragging = null;
      this.saveOrder();
    });
    li.addEventListener('dragover', (e) => {
      const from = this.dragging;
      if (!from || from === li) return;
      e.preventDefault();
      const r = li.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      li[after ? 'after' : 'before'](from);
    });
    li.addEventListener('drop', (e) => e.preventDefault());
  },

  saveOrder() {
    this.order = [...this.coursesEl.querySelectorAll('.bm-course')].map((el) => Number(el.dataset.id));
    BM.store.set('course-order', this.order);
  },

  // Pick a colour for a course; it's used for that course everywhere (cards, deadlines, forums, pins).
  colorButton(c) {
    const h = BM.h;
    const btn = h('button', { class: 'bm-swatch-btn', type: 'button', 'aria-expanded': 'false', title: 'Course colour', 'aria-label': `Colour for ${c.name}` });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.bm-course');
      const open = card.querySelector('.bm-swatches');
      document.querySelector('.bm-swatches')?.remove();
      if (open) { btn.setAttribute('aria-expanded', 'false'); return; }
      btn.setAttribute('aria-expanded', 'true');
      const pick = async (color) => { await BM.colors.set(c.id, color); this.renderCourses(this.lastCourses); this.renderDue(this.events || []); if (this.news) this.renderNews(this.news); };
      card.append(h('div', { class: 'bm-swatches', role: 'group', 'aria-label': 'Course colour' },
        BM.PALETTE.map((col) => h('button', { class: 'bm-swatch', style: `--c:${col}`, 'aria-label': col, onclick: () => pick(col) })),
        h('button', { class: 'bm-swatch is-reset', onclick: () => pick(''), title: 'Default' }, '↺')));
    });
    return btn;
  },

  // ---------------------------------------------------------------- right column

  renderDue(all) {
    const h = BM.h;
    this.events = all;
    const events = all.filter((e) => !this.done?.[e.id]); // ticked off here
    // "Due" count per course: deadlines in the next 7 days (and overdue ones).
    this.counts.due = {};
    for (const e of events) if (e.ts - BM.now() < 7 * 86400) this.counts.due[e.courseId] = (this.counts.due[e.courseId] || 0) + 1;
    for (const card of this.coursesEl.querySelectorAll('.bm-course')) this.setCount(card, 'due', this.counts.due[card.dataset.id]);
    if (!events.length) { this.dueEl.replaceChildren(h('p', { class: 'bm-muted' }, 'Nothing due.')); return; }
    const groups = new Map(BM.BUCKETS.map((b) => [b, []]));
    for (const e of events.slice().sort((a, b) => a.ts - b.ts)) groups.get(BM.bucket(e.ts)).push(e);
    this.dueEl.replaceChildren(...[...groups].filter(([, l]) => l.length).map(([name, list]) =>
      h('div', { class: 'bm-due-group' + (name === 'Overdue' ? ' is-overdue' : '') },
        h('h3', { class: 'bm-h3' }, name),
        h('ul', { class: 'bm-due-items' }, list.map((e) =>
          h('li', { class: 'bm-due-row' },
            this.checkButton(e),
            h('a', { class: 'bm-due-item', href: e.url, style: `--c:${BM.courseColor(e.courseId)}` },
              h('span', { class: 'bm-due-main' },
                h('span', { class: 'bm-due-name' }, e.name),
                h('span', { class: 'bm-muted bm-small' }, this.shortCourse(e.courseName))),
              h('span', { class: 'bm-due-side' },
                h('span', { class: 'bm-due-count', title: BM.fmtTime(e.ts) }, BM.countdown(e.ts))))))))));
  },

  // Tick a deadline off: the circle fills and draws a check, confetti pops (Pop!), the row is struck
  // through and folds away, and a toast offers Undo. It only hides the item in BetterMoodle.
  checkButton(e) {
    const icon = document.createElement('span');
    icon.className = 'bm-check-icon';
    icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M7.5 12.5l3 3 6-6.5"/></svg>';
    const btn = BM.h('button', { class: 'bm-check', type: 'button', title: 'Mark as done (hides it here only)', 'aria-label': `Mark ${e.name} as done` }, icon);
    btn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const row = btn.closest('li');
      row.classList.add('is-done');
      btn.disabled = true;
      BM.burst(btn);
      this.done[e.id] = Date.now();
      BM.done.set(e.id, true);
      setTimeout(() => BM.slide(row, false, () => this.renderDue(this.events)), 600);
      BM.toast(`Ticked off ${e.name}`, 'Undo', () => {
        delete this.done[e.id];
        BM.done.set(e.id, false);
        this.renderDue(this.events);
      });
    });
    return btn;
  },

  // Forums: the 5 newest posts (open by default; the heading folds it away, remembered).
  // Posts and "Open forums" go to our forum feed, not Moodle's pages.
  newsPanel() {
    const h = BM.h;
    let folded = false;
    try { folded = localStorage.getItem('bm:fold:news') === '1'; } catch (_) {}
    this.forumsLink = h('a', { class: 'bm-link-btn bm-open-forums', href: '#', hidden: true }, 'Open forums');
    const head = h('button', { class: 'bm-fold-head', 'aria-expanded': String(!folded), 'aria-controls': 'bm-news-body' },
      h('h2', { class: 'bm-sec-label', id: 'bm-h-news' }, 'Forums'));
    const body = h('div', { id: 'bm-news-body', hidden: folded }, this.newsEl);
    head.addEventListener('click', () => {
      const open = head.getAttribute('aria-expanded') !== 'true';
      head.setAttribute('aria-expanded', String(open));
      try { localStorage.setItem('bm:fold:news', open ? '0' : '1'); } catch (_) {}
      if (open) { body.hidden = false; BM.slide(body, true); } else BM.slide(body, false, () => { body.hidden = head.getAttribute('aria-expanded') !== 'true'; });
    });
    return h('section', { class: 'bm-side-block bm-news-panel', 'aria-labelledby': 'bm-h-news' },
      h('div', { class: 'bm-panel-head' }, head, h('div', { class: 'bm-spacer' }), this.forumsLink), body);
  },

  renderNews(items) {
    const h = BM.h;
    this.news = items;
    const isNew = (n) => n.unread > 0 || (n.ts && n.ts > this.newSince);
    // "Forum" count per course: new posts.
    this.counts.forum = {};
    for (const n of items) if (n.courseId && isNew(n)) this.counts.forum[n.courseId] = (this.counts.forum[n.courseId] || 0) + 1;
    for (const card of this.coursesEl.querySelectorAll('.bm-course')) this.setCount(card, 'forum', this.counts.forum[card.dataset.id]);
    if (!items.length) { this.newsEl.replaceChildren(h('p', { class: 'bm-muted' }, 'No forum posts yet.')); return; }
    this.newsEl.replaceChildren(h('ul', { class: 'bm-news-list' }, items.slice(0, 5).map((n) => {
      const fresh = isNew(n);
      return h('li', {},
        h('a', { class: 'bm-news-item' + (fresh ? ' is-new' : ''), href: n.courseId ? BM.forumLink(n.courseId, n.id) : n.url, style: `--c:${BM.courseColor(n.courseId)}` },
          h('span', { class: 'bm-news-top' },
            h('span', { class: 'bm-news-title' }, n.title),
            fresh ? h('span', { class: 'bm-badge' }, 'New') : null),
          h('span', { class: 'bm-muted bm-small' },
            [this.shortCourse(n.courseName), n.forumName, n.ts ? BM.ago(n.ts) : ''].filter(Boolean).join(' · '))));
    })));
  },

  // Pinned: files and forum posts you pinned, newest first, each with Unpin.
  async renderPins() {
    const h = BM.h;
    const pins = await BM.pins.list();
    this.pinsPanel.hidden = !pins.length;
    if (!pins.length) return;
    this.pinsPanel.replaceChildren(
      h('h2', { class: 'bm-sec-label', id: 'bm-h-pins' }, 'Pinned'),
      h('ul', { class: 'bm-pin-list' }, pins.map((p) => h('li', {},
        h('a', { class: 'bm-pin-item', href: p.url, style: `--c:${BM.courseColor(p.courseId)}` },
          h('span', { class: 'bm-pin-title' }, p.title),
          h('span', { class: 'bm-muted bm-small' }, [this.shortCourse(p.course), p.kind === 'post' ? 'Forum post' : 'File'].filter(Boolean).join(' · '))),
        h('button', { class: 'bm-link-btn bm-unpin', 'aria-label': `Unpin ${p.title}`, onclick: async () => { await BM.pins.toggle(p, false); this.renderPins(); } }, 'Unpin')))));
  },

  // The Feedback tracker: the same page as the "Feedback tracker" link in Moodle's top bar (read from
  // that link, so it always matches).
  feedbackUrl() {
    const link = [...document.querySelectorAll('#ucl-navbar a[href], .primary-navigation a[href], nav a[href]')]
      .find((a) => /feedback\s*tracker/i.test(a.textContent));
    return link ? link.getAttribute('href') : '/report/myfeedback/index.php';
  },

  // Fallback: forum discussion links that Moodle printed into the stock dashboard's blocks.
  scrapeNews(scope) {
    const out = [];
    const seen = new Set();
    for (const a of scope.querySelectorAll('[data-block="news_items"] a[href], [data-block="recent_activity"] a[href], .block_news_items a[href], .block_recent_activity a[href]')) {
      let u;
      try { u = new URL(a.getAttribute('href'), location.href); } catch (_) { continue; }
      const d = u.searchParams.get('d');
      if (u.origin !== location.origin || u.pathname !== '/mod/forum/discuss.php' || !d || seen.has(d)) continue;
      const title = a.textContent.replace(/\s+/g, ' ').trim();
      if (!title) continue;
      seen.add(d);
      const post = a.closest('.post, li');
      out.push({ id: d, title, author: post?.querySelector('.head .name, .author, .head')?.textContent.replace(/\s+/g, ' ').trim() || '', ts: 0, courseName: '', url: `/mod/forum/discuss.php?d=${encodeURIComponent(d)}` });
    }
    return out.slice(0, 8);
  },

  shortCourse(name) {
    const code = (name || '').split(':')[0].trim();
    return /^[A-Z]{3,5}\d{3,5}/.test(code) ? code : name;
  },
};
