// Dashboard (/my/): a headline with what's due and a live countdown to the next deadline, then a sideways-scrolling strip of Courses (cover images where the theme
// shows them), then Due soon grouped by when, and the latest Announcements from every current course.
// The stock dashboard sits behind a toggle.
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
    this.newsEl = h('div', { class: 'bm-news' }, h('p', { class: 'bm-muted' }, 'Loading announcements…'));
    this.heroEl = h('section', { class: 'bm-hero', 'aria-label': 'Summary', hidden: true });
    const toggle = h('button', { class: 'bm-link-btn' });
    const body = h('div', { class: 'bm-home-body' },
      this.heroEl,
      h('section', { class: 'bm-panel bm-courses', 'aria-labelledby': 'bm-h-courses' },
        h('div', { class: 'bm-courses-head' },
          h('h2', { class: 'bm-h2', id: 'bm-h-courses' }, 'Courses'), h('div', { class: 'bm-spacer' }), this.prevBtn, this.nextBtn),
        this.coursesEl),
      h('div', { class: 'bm-home-grid' },
        h('section', { class: 'bm-panel', 'aria-labelledby': 'bm-h-due' }, h('h2', { class: 'bm-h2', id: 'bm-h-due' }, 'Due soon'), this.dueEl),
        h('div', { class: 'bm-home-side' }, this.newsPanel(), this.feedbackPanel())));
    addEventListener('resize', () => this.updateArrows(), { passive: true });
    const root = h('div', { id: 'bm-home', class: 'bm-root' },
      h('div', { class: 'bm-home-top' },
        h('span', { class: 'bm-muted bm-small' }, 'Press ', h('kbd', {}, navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl K'), ' to search everything'),
        h('div', { class: 'bm-spacer' }), toggle),
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
    const courses = await BM.store.swr('courses-v2', 60 * 60 * 1000, () => BM.api.courses(), (c) => this.renderCourses(c), err(this.coursesEl));

    // Announcements come from Moodle's forum web services. If UCL doesn't allow those over AJAX,
    // fall back to the forum links Moodle itself prints in the (hidden) stock dashboard blocks.
    await BM.store.swr('news', 15 * 60 * 1000, async () => {
      try {
        return (await BM.api.announcements(courses || [])).slice(0, 8);
      } catch (e) {
        const scraped = this.scrapeNews(anchor);
        if (scraped.length) return scraped;
        throw e;
      }
    }, (n) => this.renderNews(n), () => this.newsEl.replaceChildren(h('p', { class: 'bm-muted' }, "Couldn't load announcements.")));
  },

  renderDue(all) {
    const h = BM.h;
    this.events = all;
    const events = all.filter((e) => !this.done?.[e.id]); // ticked off here
    this.renderHero(events);
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
            h('a', { class: 'bm-due-item', href: e.url },
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
    if (!courses.length) { this.coursesEl.replaceChildren(h('li', { class: 'bm-muted' }, 'No current courses.')); return; }
    const first = !this.coursesEl.querySelector('.bm-course');
    // Most recently used on the left: courses you opened with BetterMoodle first (newest visit first),
    // then the rest in Moodle's last-accessed order.
    const order = new Map(courses.map((c, i) => [c.id, i]));
    const v = this.visits || {};
    const sorted = courses.slice().sort((a, b) => ((v[b.id] || 0) - (v[a.id] || 0)) || (order.get(a.id) - order.get(b.id)));
    this.coursesEl.replaceChildren(...sorted.map((c, i) => {
      const [code, ...rest] = c.name.split(':');
      const hasCode = rest.length && /^[A-Z]{3,5}\d{3,5}/.test(code.trim());
      return h('li', {},
        h('a', { class: 'bm-course', href: `/course/view.php?id=${c.id}`, style: `--c:${BM.colorFor(i)}` },
          c.image ? h('img', { class: 'bm-course-img', src: c.image, alt: '', loading: 'lazy' }) : null,
          h('span', { class: 'bm-course-text' },
            h('span', { class: 'bm-course-code' }, c.fav ? '★ ' : '', hasCode ? code.trim() : c.short),
            h('span', { class: 'bm-course-name' }, hasCode ? rest.join(':').trim() : c.name))));
    }));
    if (first) BM.enter(this.coursesEl.querySelectorAll('.bm-course'));
    this.updateArrows();
  },

  // The big headline: how much is due this week, then the next deadline with a ticking countdown.
  // Pop! animates it in once (lines wipe in, a glow sweeps behind); other themes show it plainly.
  renderHero(events) {
    const h = BM.h;
    const now = BM.now();
    const upcoming = events.filter((e) => e.ts >= now).sort((a, b) => a.ts - b.ts);
    const overdue = events.length - upcoming.length;
    const week = upcoming.filter((e) => e.ts - now < 7 * 86400).length;
    const next = upcoming[0];
    const line = (text, i, cls = '') => h('span', { class: 'bm-hero-line ' + cls, style: `--i:${i}` }, text, h('span', { class: 'bm-hero-dot' }, '.'));

    const lines = [line(week ? `${week} due this week` : 'Nothing due this week', 0)];
    if (overdue) lines.push(line(`${overdue} overdue`, 1, 'is-overdue'));

    clearInterval(this.tick);
    let meta = null;
    if (next) {
      this.countEl = h('span', { class: 'bm-hero-count bm-mono', 'aria-label': 'Time left' });
      const soon = next.ts - now < 86400;
      meta = h('a', { class: 'bm-hero-next' + (soon ? ' is-soon' : ''), href: next.url },
        h('span', { class: 'bm-ping', 'aria-hidden': 'true' }),
        h('span', { class: 'bm-hero-next-text' },
          h('span', { class: 'bm-hero-next-label' }, 'Next up'),
          h('span', { class: 'bm-hero-next-name' }, next.name),
          h('span', { class: 'bm-muted bm-small' }, this.shortCourse(next.courseName))),
        this.countEl);
      // Each digit is its own span so only the ones that change roll in (Pop!), like a flip clock.
      const update = () => {
        const str = BM.clock(next.ts - BM.now());
        const prev = this.countEl.dataset.v || '';
        if (str.length !== prev.length) this.countEl.replaceChildren(...[...str].map((ch) => h('span', { class: 'bm-digit' }, ch)));
        else [...str].forEach((ch, i) => { if (ch !== prev[i]) this.countEl.children[i].replaceWith(h('span', { class: 'bm-digit is-tick' }, ch)); });
        this.countEl.dataset.v = str;
      };
      update();
      this.tick = setInterval(update, 1000);
    }

    const first = this.heroEl.hidden;
    this.heroEl.replaceChildren(h('h1', { class: 'bm-hero-title' }, lines), meta);
    this.heroEl.hidden = false;
    if (!first) this.heroEl.classList.add('is-settled'); // re-renders (fresh data after cache) don't replay the entrance
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

  // Announcements: open by default; the heading folds it away (remembered). "All forums" opens the
  // forum page (forum.js) on your newest course's Announcements forum.
  newsPanel() {
    const h = BM.h;
    let folded = false;
    try { folded = localStorage.getItem('bm:fold:news') === '1'; } catch (_) {}
    this.forumsLink = h('a', { class: 'bm-link-btn', hidden: true }, 'All forums');
    const head = h('button', { class: 'bm-fold-head', 'aria-expanded': String(!folded), 'aria-controls': 'bm-news-body' },
      h('h2', { class: 'bm-h2', id: 'bm-h-news' }, 'Announcements'));
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

  // UCL's My Feedback report: marks and feedback from every module on one page.
  feedbackPanel() {
    const h = BM.h;
    return h('section', { class: 'bm-panel bm-feedback-panel', 'aria-labelledby': 'bm-h-feedback' },
      h('h2', { class: 'bm-h2', id: 'bm-h-feedback' }, 'Feedback'),
      h('p', { class: 'bm-muted' }, 'Marks and feedback from all your modules, in one place.'),
      h('a', { class: 'bm-btn bm-btn-primary', href: '/report/myfeedback/index.php' }, 'Open feedback tracker'));
  },

  renderNews(items) {
    const h = BM.h;
    const hub = items.find((n) => n.forumUrl);
    if (hub) { this.forumsLink.href = hub.forumUrl; this.forumsLink.hidden = false; }
    if (!items.length) { this.newsEl.replaceChildren(h('p', { class: 'bm-muted' }, 'No recent announcements.')); return; }
    this.newsEl.replaceChildren(h('ul', { class: 'bm-news-list' }, items.map((n) =>
      h('li', {},
        h('a', { class: 'bm-news-item', href: n.url },
          h('span', { class: 'bm-news-title' }, n.title),
          h('span', { class: 'bm-muted bm-small' },
            [this.shortCourse(n.courseName), n.author, n.ts ? BM.ago(n.ts) : ''].filter(Boolean).join(' · ')))))));
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
