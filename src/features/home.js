// Dashboard (/my/): Due soon (grouped by when, tick-off) beside Forums (newest posts in every course,
// opening our forum feed) and anything you've pinned; then your Courses, most recently used first, each
// with this week, files new since your last visit, and one-click Slides / Forum. The stock dashboard
// sits behind a toggle.
var BM = globalThis.BM;

BM.home = {
  async init() {
    // UCL's dashboard has no #page-content: the block regions sit in #topofscroll > .row.
    const anchor = document.querySelector('#page-content') || document.querySelector('#topofscroll > .row');
    if (!anchor) return;
    const h = BM.h;

    let classic = false;
    try { classic = localStorage.getItem('bm:classicHome') === '1'; } catch (_) {}

    this.dueEl = h('div', { class: 'bm-due-list' }, h('p', { class: 'bm-muted' }, 'Loading deadlines…'));
    this.coursesEl = h('ul', { class: 'bm-course-list bm-course-strip' }, h('li', { class: 'bm-muted' }, 'Loading courses…'));
    this.coursesEl.addEventListener('scroll', () => this.updateArrows(), { passive: true });
    // Pop!'s entrance animation shrinks the tiles at first, so re-measure once it finishes.
    this.coursesEl.addEventListener('animationend', () => this.updateArrows());
    this.prevBtn = h('button', { class: 'bm-strip-btn', 'aria-label': 'Scroll courses left', onclick: () => this.scrollCourses(-1) }, '‹');
    this.nextBtn = h('button', { class: 'bm-strip-btn', 'aria-label': 'Scroll courses right', onclick: () => this.scrollCourses(1) }, '›');
    this.newsEl = h('div', { class: 'bm-news' }, h('p', { class: 'bm-muted' }, 'Loading forums…'));
    this.pinsPanel = h('section', { class: 'bm-panel bm-pins-panel', 'aria-labelledby': 'bm-h-pins', hidden: true });
    const toggle = h('button', { class: 'bm-link-btn' });
    const body = h('div', { class: 'bm-home-body' },
      h('div', { class: 'bm-home-grid' },
        h('section', { class: 'bm-panel', 'aria-labelledby': 'bm-h-due' }, h('h2', { class: 'bm-h2', id: 'bm-h-due' }, 'Due soon'), this.dueEl),
        h('div', { class: 'bm-home-side' }, this.newsPanel(), this.pinsPanel, this.shortcuts())),
      h('section', { class: 'bm-panel bm-courses', 'aria-labelledby': 'bm-h-courses' },
        h('div', { class: 'bm-courses-head' },
          h('h2', { class: 'bm-h2', id: 'bm-h-courses' }, 'Courses'), h('div', { class: 'bm-spacer' }), this.prevBtn, this.nextBtn),
        this.coursesEl));
    addEventListener('resize', () => this.updateArrows(), { passive: true });
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
    BM.store.swr('deadlines-v2', 5 * 60 * 1000, () => BM.api.deadlines(), (ev) => this.renderDue(ev), err(this.dueEl));
    this.visits = await BM.recent.all();
    this.renderPins();
    const courses = await BM.store.swr('courses-v2', 60 * 60 * 1000, () => BM.api.courses(), (c) => this.renderCourses(c), err(this.coursesEl));

    // Forum updates: the newest posts in every forum of every current course, read from the forum
    // pages (UCL blocks the forum web services). "New" = posted since your previous dashboard visit,
    // or unread in Moodle. If the pages can't be read, fall back to the forum links Moodle prints in
    // the (hidden) stock dashboard blocks.
    let seen = 0;
    try { seen = Number(localStorage.getItem('bm:forumSeen')) || 0; } catch (_) {}
    this.newSince = seen || BM.now() - 3 * 86400;
    BM.whenShown(() => setTimeout(() => { try { localStorage.setItem('bm:forumSeen', String(BM.now())); } catch (_) {} }, 4000));
    await BM.store.swr('forum-updates-v1', 10 * 60 * 1000, async () => {
      try {
        return await BM.forumData.recent(courses || []);
      } catch (e) {
        const scraped = this.scrapeNews(anchor);
        if (scraped.length) return scraped;
        throw e;
      }
    }, (n) => this.renderNews(n), () => this.newsEl.replaceChildren(h('p', { class: 'bm-muted' }, "Couldn't load the forums.")));
  },

  renderDue(all) {
    const h = BM.h;
    this.events = all;
    const events = all.filter((e) => !this.done?.[e.id]); // ticked off here
    if (!events.length) { this.dueEl.replaceChildren(h('p', { class: 'bm-muted' }, 'Nothing due. 🎉')); return; }
    const first = !this.dueEl.querySelector('.bm-due-group');
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
                h('span', { class: 'bm-muted bm-small' }, [this.shortCourse(e.courseName), e.kind ? ' · ' + e.kind : ''])),
              h('span', { class: 'bm-due-side' },
                h('span', { class: 'bm-due-count' }, BM.countdown(e.ts)),
                h('span', { class: 'bm-muted bm-small bm-mono' }, BM.fmtTime(e.ts))))))))));
    if (first) BM.enter(this.dueEl.querySelectorAll('.bm-due-item'));
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

  renderCourses(courses) {
    const h = BM.h;
    this.lastCourses = courses;
    if (!courses.length) { this.coursesEl.replaceChildren(h('li', { class: 'bm-muted' }, 'No current courses.')); return; }
    const first = !this.coursesEl.querySelector('.bm-course');
    // Most recently used on the left: courses you opened with BetterMoodle first (newest visit first),
    // then the rest in Moodle's last-accessed order.
    const order = new Map(courses.map((c, i) => [c.id, i]));
    const v = this.visits || {};
    const sorted = courses.slice().sort((a, b) => ((v[b.id] || 0) - (v[a.id] || 0)) || (order.get(a.id) - order.get(b.id)));
    this.coursesEl.replaceChildren(...sorted.map((c) => {
      const [code, ...rest] = c.name.split(':');
      const hasCode = rest.length && /^[A-Z]{3,5}\d{3,5}/.test(code.trim());
      const meta = h('span', { class: 'bm-course-meta bm-small' });
      const slides = h('a', { class: 'bm-course-btn', href: `/course/view.php?id=${c.id}#bm-slides` }, 'Slides');
      const tile = h('div', { class: 'bm-course', dataset: { id: c.id }, style: `--c:${BM.courseColor(c.id)}` },
        h('a', { class: 'bm-course-main', href: `/course/view.php?id=${c.id}` },
          c.image ? h('img', { class: 'bm-course-img', src: c.image, alt: '', loading: 'lazy' }) : null,
          h('span', { class: 'bm-course-text' },
            h('span', { class: 'bm-course-code' }, c.fav ? '\u2605 ' : '', hasCode ? code.trim() : c.short),
            // Same name as the course page title, so it grows into it on the way there.
            h('span', { class: 'bm-course-name', style: `view-transition-name: bm-course-${c.id}` }, hasCode ? rest.join(':').trim() : c.name))),
        h('div', { class: 'bm-course-foot' },
          meta,
          h('div', { class: 'bm-course-actions' },
            slides,
            h('a', { class: 'bm-course-btn', href: BM.forumLink(c.id) }, 'Forum'),
            this.colorButton(c))));
      this.fillCourse(c.id, meta, slides);
      return h('li', {}, tile);
    }));
    if (first) BM.enter(this.coursesEl.querySelectorAll('.bm-course'));
    this.updateArrows();
    // Forums opens on the course you used most recently.
    if (this.forumsLink && sorted[0]) { this.forumsLink.href = BM.forumLink(sorted[0].id); this.forumsLink.hidden = false; }
  },

  // "Week 7 · 3 new" under each course: this week's title and files added since you last opened it.
  async fillCourse(courseId, meta, slides) {
    try {
      const info = await BM.courseInfo.get(courseId);
      if (!info) return;
      const fresh = await BM.courseInfo.newFiles(courseId, info.files);
      meta.replaceChildren(info.weekTitle || '', fresh.length ? BM.h('span', { class: 'bm-tag bm-tag-new' }, `${fresh.length} new`) : '');
    } catch (_) { /* the tile still works without it */ }
  },

  // Pick a colour for a course; it's used for that course everywhere (tiles, deadlines, forums).
  colorButton(c) {
    const h = BM.h;
    const btn = h('button', { class: 'bm-swatch-btn', type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false', title: 'Course colour', 'aria-label': `Colour for ${c.name}` });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelector('.bm-swatches')?.remove();
      if (btn.getAttribute('aria-expanded') === 'true') { btn.setAttribute('aria-expanded', 'false'); return; }
      btn.setAttribute('aria-expanded', 'true');
      const pick = async (color) => { pop.remove(); await BM.colors.set(c.id, color); this.renderCourses(this.lastCourses); this.renderDue(this.events || []); };
      const pop = h('div', { class: 'bm-swatches', role: 'menu' },
        BM.PALETTE.map((col) => h('button', { class: 'bm-swatch', role: 'menuitem', style: `--c:${col}`, 'aria-label': col, onclick: () => pick(col) })),
        h('button', { class: 'bm-swatch is-reset', role: 'menuitem', onclick: () => pick(''), title: 'Default' }, '\u21BA'));
      btn.closest('.bm-course-foot').append(pop);
      const close = (ev) => { if (!pop.contains(ev.target) && ev.target !== btn) { pop.remove(); btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', close); } };
      setTimeout(() => document.addEventListener('click', close), 0);
    });
    return btn;
  },

  // Pinned: files and forum posts you pinned, newest first, each with Unpin.
  async renderPins() {
    const h = BM.h;
    const pins = await BM.pins.list();
    this.pinsPanel.hidden = !pins.length;
    if (!pins.length) return;
    this.pinsPanel.replaceChildren(
      h('h2', { class: 'bm-h2', id: 'bm-h-pins' }, 'Pinned'),
      h('ul', { class: 'bm-pin-list' }, pins.map((p) => h('li', {},
        h('a', { class: 'bm-pin-item', href: p.url, style: `--c:${BM.courseColor(p.courseId)}` },
          h('span', { class: 'bm-pin-title' }, p.title),
          h('span', { class: 'bm-muted bm-small' }, [this.shortCourse(p.course), p.kind === 'post' ? 'Forum post' : 'File'].filter(Boolean).join(' \u00b7 '))),
        h('button', { class: 'bm-link-btn bm-unpin', 'aria-label': `Unpin ${p.title}`, onclick: async () => { await BM.pins.toggle(p, false); this.renderPins(); } }, 'Unpin')))));
  },

  // The arrows move the course strip by about one screenful; they grey out at either end.
  scrollCourses(dir) {
    const el = this.coursesEl;
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * Math.max(200, el.clientWidth * 0.8), behavior: smooth ? 'smooth' : 'auto' });
  },

  updateArrows() {
    const el = this.coursesEl;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    this.prevBtn.disabled = el.scrollLeft <= 1;
    this.nextBtn.disabled = el.scrollLeft >= max - 1;
    this.prevBtn.hidden = this.nextBtn.hidden = max <= 1; // everything fits: no arrows
  },

  // Forums: the newest posts in all your courses. Open by default; the heading folds it away
  // (remembered). Posts and "Open forums" go to our forum feed, not Moodle's pages.
  newsPanel() {
    const h = BM.h;
    let folded = false;
    try { folded = localStorage.getItem('bm:fold:news') === '1'; } catch (_) {}
    this.forumsLink = h('a', { class: 'bm-btn bm-open-forums', href: '#', hidden: true }, 'Open forums');
    const head = h('button', { class: 'bm-fold-head', 'aria-expanded': String(!folded), 'aria-controls': 'bm-news-body' },
      h('h2', { class: 'bm-h2', id: 'bm-h-news' }, 'Forums'));
    const body = h('div', { id: 'bm-news-body', hidden: folded }, this.newsEl);
    head.addEventListener('click', () => {
      const open = head.getAttribute('aria-expanded') !== 'true';
      head.setAttribute('aria-expanded', String(open));
      try { localStorage.setItem('bm:fold:news', open ? '0' : '1'); } catch (_) {}
      if (open) { body.hidden = false; BM.slide(body, true); } else BM.slide(body, false, () => { body.hidden = head.getAttribute('aria-expanded') !== 'true'; });
    });
    return h('section', { class: 'bm-panel bm-news-panel', 'aria-labelledby': 'bm-h-news' },
      h('div', { class: 'bm-panel-head' }, head, h('div', { class: 'bm-spacer' }), this.forumsLink), body);
  },

  // The Feedback tracker: the same page as the "Feedback tracker" link in Moodle's top bar (read from
  // that link, so it always matches), then a way into the forum feeds.
  feedbackUrl() {
    const link = [...document.querySelectorAll('#ucl-navbar a[href], .primary-navigation a[href], nav a[href]')]
      .find((a) => /feedback\s*tracker/i.test(a.textContent));
    return link ? link.getAttribute('href') : '/report/myfeedback/index.php';
  },

  // The Feedback tracker as one big tile; the name says what it is.
  shortcuts() {
    const h = BM.h;
    const tile = (cls, label, href) => h('a', { class: `bm-shortcut ${cls}`, href },
      h('span', { class: 'bm-shortcut-label' }, label), h('span', { class: 'bm-shortcut-go', 'aria-hidden': 'true' }, '\u203A'));
    return h('nav', { class: 'bm-shortcuts', 'aria-label': 'Shortcuts' }, tile('is-feedback', 'Feedback tracker', this.feedbackUrl()));
  },

  renderNews(items) {
    const h = BM.h;
    if (!items.length) { this.newsEl.replaceChildren(h('p', { class: 'bm-muted' }, 'No forum posts yet.')); return; }
    this.newsEl.replaceChildren(h('ul', { class: 'bm-news-list' }, items.map((n) => {
      const fresh = n.unread > 0 || (n.ts && n.ts > this.newSince);
      return h('li', {},
        h('a', { class: 'bm-news-item' + (fresh ? ' is-new' : ''), href: n.courseId ? BM.forumLink(n.courseId, n.id) : n.url, style: `--c:${BM.courseColor(n.courseId)}` },
          h('span', { class: 'bm-news-top' },
            h('span', { class: 'bm-news-title' }, n.title),
            fresh ? h('span', { class: 'bm-badge' }, 'New') : null),
          h('span', { class: 'bm-muted bm-small' },
            [this.shortCourse(n.courseName), n.forumName, n.author, n.ts ? BM.ago(n.ts) : ''].filter(Boolean).join(' \u00b7 '))));
    })));
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
