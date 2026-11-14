// Dashboard (/my/): Due soon, grouped by when, plus a clean course list. The stock dashboard sits behind a toggle.
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
    const toggle = h('button', { class: 'bm-link-btn' });
    const body = h('div', { class: 'bm-home-grid' },
      h('section', { class: 'bm-panel' }, h('h2', { class: 'bm-h2' }, 'Due soon'), this.dueEl),
      h('section', { class: 'bm-panel' }, h('h2', { class: 'bm-h2' }, 'Courses'), this.coursesEl));
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
    BM.store.swr('courses', 60 * 60 * 1000, () => BM.api.courses(), (c) => this.renderCourses(c), err(this.coursesEl));
  },

  renderDue(events) {
    const h = BM.h;
    if (!events.length) { this.dueEl.replaceChildren(h('p', { class: 'bm-muted' }, 'Nothing due. 🎉')); return; }
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
                h('span', { class: 'bm-muted bm-small' }, BM.fmtTime(e.ts))))))))));
  },

  renderCourses(courses) {
    const h = BM.h;
    if (!courses.length) { this.coursesEl.replaceChildren(h('li', { class: 'bm-muted' }, 'No current courses.')); return; }
    const sorted = courses.slice().sort((a, b) => (b.fav - a.fav) || a.name.localeCompare(b.name));
    this.coursesEl.replaceChildren(...sorted.map((c) => {
      const [code, ...rest] = c.name.split(':');
      const hasCode = rest.length && /^[A-Z]{3,5}\d{3,5}/.test(code.trim());
      return h('li', {},
        h('a', { class: 'bm-course', href: `/course/view.php?id=${c.id}` },
          h('span', { class: 'bm-course-code' }, c.fav ? '★ ' : '', hasCode ? code.trim() : c.short),
          h('span', { class: 'bm-course-name' }, hasCode ? rest.join(':').trim() : c.name)));
    }));
  },

  shortCourse(name) {
    const code = (name || '').split(':')[0].trim();
    return /^[A-Z]{3,5}\d{3,5}/.test(code) ? code : name;
  },
};
