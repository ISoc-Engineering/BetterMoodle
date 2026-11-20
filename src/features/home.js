// Dashboard (/my/): Due soon, grouped by when; Courses (with cover images where the theme shows them);
// and the latest Announcements from every current course. The stock dashboard sits behind a toggle.
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
    this.coursesEl = h('ul', { class: 'bm-course-list' }, h('li', { class: 'bm-muted' }, 'Loading courses…'));
    this.newsEl = h('div', { class: 'bm-news' }, h('p', { class: 'bm-muted' }, 'Loading announcements…'));
    const toggle = h('button', { class: 'bm-link-btn' });
    const body = h('div', { class: 'bm-home-grid' },
      h('section', { class: 'bm-panel', 'aria-labelledby': 'bm-h-due' }, h('h2', { class: 'bm-h2', id: 'bm-h-due' }, 'Due soon'), this.dueEl),
      h('div', { class: 'bm-home-side' },
        h('section', { class: 'bm-panel', 'aria-labelledby': 'bm-h-courses' }, h('h2', { class: 'bm-h2', id: 'bm-h-courses' }, 'Courses'), this.coursesEl),
        h('section', { class: 'bm-panel', 'aria-labelledby': 'bm-h-news' }, h('h2', { class: 'bm-h2', id: 'bm-h-news' }, 'Announcements'), this.newsEl)));
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
    BM.store.swr('deadlines', 5 * 60 * 1000, () => BM.api.deadlines(), (ev) => this.renderDue(ev), err(this.dueEl));
    const courses = await BM.store.swr('courses', 60 * 60 * 1000, () => BM.api.courses(), (c) => this.renderCourses(c), err(this.coursesEl));

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

  renderDue(events) {
    const h = BM.h;
    if (!events.length) { this.dueEl.replaceChildren(h('p', { class: 'bm-muted' }, 'Nothing due. 🎉')); return; }
    const first = !this.dueEl.querySelector('.bm-due-group');
    const groups = new Map(BM.BUCKETS.map((b) => [b, []]));
    for (const e of events.slice().sort((a, b) => a.ts - b.ts)) groups.get(BM.bucket(e.ts)).push(e);
    this.dueEl.replaceChildren(...[...groups].filter(([, l]) => l.length).map(([name, list]) =>
      h('div', { class: 'bm-due-group' + (name === 'Overdue' ? ' is-overdue' : '') },
        h('h3', { class: 'bm-h3' }, name),
        h('ul', { class: 'bm-due-items' }, list.map((e) =>
          h('li', {},
            h('a', { class: 'bm-due-item', href: e.url },
              h('span', { class: 'bm-due-main' },
                h('span', { class: 'bm-due-name' }, e.name),
                h('span', { class: 'bm-muted bm-small' }, [this.shortCourse(e.courseName), e.kind ? ' · ' + e.kind : ''])),
              h('span', { class: 'bm-due-side' },
                h('span', { class: 'bm-due-count' }, BM.countdown(e.ts)),
                h('span', { class: 'bm-muted bm-small bm-mono' }, BM.fmtTime(e.ts))))))))));
    if (first) BM.enter(this.dueEl.querySelectorAll('.bm-due-item'));
  },

  renderCourses(courses) {
    const h = BM.h;
    if (!courses.length) { this.coursesEl.replaceChildren(h('li', { class: 'bm-muted' }, 'No current courses.')); return; }
    const first = !this.coursesEl.querySelector('.bm-course');
    const sorted = courses.slice().sort((a, b) => (b.fav - a.fav) || a.name.localeCompare(b.name));
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
  },

  renderNews(items) {
    const h = BM.h;
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
