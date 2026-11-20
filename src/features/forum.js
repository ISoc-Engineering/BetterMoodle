// Forum page (/mod/forum/view.php): replaces Moodle's discussion table with an organised view.
//   Left: every forum in your current courses, grouped by course (most recently used course first),
//         so you can hop between forums without going back to the course.
//   Right: this forum's discussions, grouped by when they were last active (pinned first), with search,
//          All / Unread / Pinned / Started by me filters, sorting, unread counts and the last reply.
// Clicking a discussion opens it in the side viewer (j/k steps through them); Ctrl/Shift-click opens a tab.
// If anything fails, the stock Moodle page is left alone.
var BM = globalThis.BM;

BM.forum = {
  FILTERS: [['all', 'All'], ['unread', 'Unread'], ['pinned', 'Pinned'], ['mine', 'Started by me']],
  SORTS: [['activity', 'Latest activity'], ['newest', 'Newest first'], ['replies', 'Most replies']],
  PER_PAGE: 100,
  state: { q: '', filter: 'all', sort: 'activity' },

  async init() {
    const anchor = document.querySelector('#page-content');
    const params = new URLSearchParams(location.search);
    const cmid = Number(params.get('id')) || 0;
    const fid = Number(params.get('f')) || 0;
    if (!anchor || (!cmid && !fid)) return;

    // Which forums exist: every forum in your current courses, plus this page's course.
    const courses = (await BM.store.swr('courses-v2', 60 * 60 * 1000, () => BM.api.courses(), () => {})) || [];
    const courseIds = [...new Set([...courses.map((c) => c.id), BM.cfg().courseId].filter(Boolean))];
    const forums = await BM.api.forums(courseIds);
    const forum = forums.find((f) => (cmid && f.cmid === cmid) || (fid && f.id === fid));
    if (!forum) return;
    this.forum = forum;
    this.discussions = [];
    this.page = 0;

    const h = BM.h;
    this.listEl = h('div', { class: 'bm-forum-list', 'aria-live': 'polite' }, h('p', { class: 'bm-muted' }, 'Loading discussions…'));
    this.moreEl = h('button', { class: 'bm-btn', hidden: true, onclick: () => this.loadMore() }, 'Load more');
    this.countEl = h('span', { class: 'bm-muted' });
    this.input = h('input', { type: 'search', class: 'bm-input', placeholder: 'Search discussions…  ( / )', 'aria-label': 'Search discussions' });
    this.input.addEventListener('input', () => { this.state.q = this.input.value.trim().toLowerCase(); this.render(); });
    this.chipsEl = h('div', { class: 'bm-chips', role: 'group', 'aria-label': 'Show' },
      this.FILTERS.map(([k, label]) => h('button', {
        class: 'bm-chip', dataset: { chip: k }, 'aria-pressed': String(k === this.state.filter),
        onclick: () => { this.state.filter = k; this.render(); },
      }, label)));
    const sort = h('select', { class: 'bm-select', 'aria-label': 'Sort discussions' },
      this.SORTS.map(([k, label]) => h('option', { value: k, selected: k === this.state.sort }, label)));
    sort.addEventListener('change', () => { this.state.sort = sort.value; this.render(); });

    const course = courses.find((c) => c.id === forum.course);
    const toggle = h('button', { class: 'bm-link-btn' });
    this.root = h('div', { id: 'bm-forum', class: 'bm-root' },
      h('div', { class: 'bm-forum-top' }, h('div', { class: 'bm-spacer' }), toggle),
      h('div', { class: 'bm-forum-layout' },
        this.rail(forums, courses),
        h('section', { class: 'bm-forum-main', 'aria-labelledby': 'bm-forum-title' },
          h('header', { class: 'bm-forum-head' },
            h('div', { class: 'bm-forum-titles' },
              h('h1', { class: 'bm-forum-title', id: 'bm-forum-title' }, forum.name, h('span', { class: 'bm-hero-dot' }, '.')),
              h('p', { class: 'bm-muted' }, course ? course.name : '', ' ', this.countEl)),
            h('div', { class: 'bm-spacer' }),
            h('a', { class: 'bm-btn bm-btn-primary', href: `/mod/forum/post.php?forum=${forum.id}` }, 'New discussion')),
          h('div', { class: 'bm-filterbar' }, this.input, this.chipsEl, h('div', { class: 'bm-spacer' }), sort),
          this.listEl,
          h('div', { class: 'bm-forum-more' }, this.moreEl))));
    anchor.before(this.root);

    let classic = false;
    try { classic = localStorage.getItem('bm:classicForum') === '1'; } catch (_) {}
    const setClassic = (v) => {
      classic = v;
      try { localStorage.setItem('bm:classicForum', v ? '1' : '0'); } catch (_) {}
      anchor.classList.toggle('bm-replaced', !v);
      this.root.querySelector('.bm-forum-layout').hidden = v;
      toggle.textContent = v ? 'Use BetterMoodle view' : 'Classic view';
    };
    toggle.addEventListener('click', () => setClassic(!classic));
    setClassic(classic);

    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !BM.isTyping(e) && !e.metaKey && !e.ctrlKey && !classic) { e.preventDefault(); this.input.focus(); }
    });
    BM.viewer.onChange = (it) => {
      for (const el of this.root.querySelectorAll('.bm-disc.is-active')) el.classList.remove('is-active');
      if (!it) return;
      const row = this.root.querySelector(`.bm-disc[data-id="${it.did}"]`);
      if (row) { row.classList.add('is-active'); row.scrollIntoView({ block: 'nearest' }); this.markRead(it.did); }
    };

    try {
      await this.loadMore();
    } catch (e) {
      console.warn('[BetterMoodle] forum load failed', e);
      setClassic(true);
    }
  },

  // Left rail: forums grouped by course. The current course is open; Announcements forums first.
  rail(forums, courses) {
    const h = BM.h;
    const byCourse = new Map();
    for (const f of forums) (byCourse.get(f.course) || byCourse.set(f.course, []).get(f.course)).push(f);
    const order = courses.map((c) => c.id).filter((id) => byCourse.has(id));
    for (const id of byCourse.keys()) if (!order.includes(id)) order.push(id);
    const name = (id) => courses.find((c) => c.id === id)?.name || this.forum.courseName || 'This course';
    return h('nav', { class: 'bm-forum-rail bm-panel', 'aria-label': 'Forums' },
      h('h2', { class: 'bm-h2' }, 'Forums'),
      order.map((id, i) => {
        const list = byCourse.get(id).slice().sort((a, b) => (b.type === 'news') - (a.type === 'news') || a.name.localeCompare(b.name));
        const unread = list.reduce((n, f) => n + (f.unread || 0), 0);
        return h('details', { class: 'bm-rail-course', open: id === this.forum.course, style: `--c:${BM.colorFor(i)}` },
          h('summary', {}, h('span', { class: 'bm-rail-course-name' }, name(id)),
            unread ? h('span', { class: 'bm-badge' }, String(unread)) : null),
          h('ul', {}, list.map((f) => h('li', {},
            h('a', { class: 'bm-rail-forum', href: `/mod/forum/view.php?id=${f.cmid}`, 'aria-current': f.id === this.forum.id ? 'page' : null },
              h('span', {}, f.name), f.unread ? h('span', { class: 'bm-badge' }, String(f.unread)) : null)))));
      }));
  },

  async loadMore() {
    this.moreEl.disabled = true;
    const got = await BM.api.discussions(this.forum.id, this.page, this.PER_PAGE);
    this.discussions.push(...got);
    this.page++;
    this.moreEl.hidden = got.length < this.PER_PAGE;
    this.moreEl.disabled = false;
    this.render();
  },

  // The timestamp a discussion is sorted and grouped by.
  when(d) { return this.state.sort === 'newest' ? d.created : d.lastTs; },

  visible() {
    const { q, filter, sort } = this.state;
    const me = BM.cfg().userId;
    return this.discussions
      .filter((d) => filter === 'all' || (filter === 'unread' ? d.unread > 0 : filter === 'pinned' ? d.pinned : d.authorId === me))
      .filter((d) => !q || d.search.includes(q))
      .sort((a, b) => sort === 'replies' ? (b.replies - a.replies) || (b.lastTs - a.lastTs)
        : (b.pinned - a.pinned) || (this.when(b) - this.when(a)));
  },

  group(d) {
    if (this.state.sort === 'replies') return '';
    if (d.pinned) return 'Pinned';
    const t = new Date(this.when(d) * 1000);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.floor((today - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return 'This week';
    if (days < 31) return 'This month';
    return 'Earlier';
  },

  render() {
    const h = BM.h;
    for (const b of this.chipsEl.children) b.setAttribute('aria-pressed', String(b.dataset.chip === this.state.filter));
    const all = this.discussions;
    const unread = all.filter((d) => d.unread > 0).length;
    this.countEl.textContent = `· ${all.length}${this.moreEl.hidden ? '' : '+'} discussion${all.length === 1 ? '' : 's'}${unread ? `, ${unread} unread` : ''}`;
    const list = this.visible();
    this.shown = list;
    if (!all.length) {
      this.listEl.replaceChildren(h('div', { class: 'bm-forum-empty' },
        h('p', {}, 'No discussions yet.'),
        h('a', { class: 'bm-btn bm-btn-primary', href: `/mod/forum/post.php?forum=${this.forum.id}` }, 'Start one')));
      return;
    }
    if (!list.length) { this.listEl.replaceChildren(h('p', { class: 'bm-muted bm-forum-empty' }, 'Nothing matches. Try All, or clear the search.')); return; }
    const first = !this.listEl.querySelector('.bm-disc');
    const groups = new Map();
    for (const d of list) { const g = this.group(d); (groups.get(g) || groups.set(g, []).get(g)).push(d); }
    this.listEl.replaceChildren(...[...groups].map(([name, ds]) =>
      h('section', { class: 'bm-disc-group' },
        name ? h('h3', { class: 'bm-h3' }, name) : null,
        h('ul', { class: 'bm-disc-list' }, ds.map((d) => h('li', {}, this.row(d)))))));
    if (first) BM.enter(this.listEl.querySelectorAll('.bm-disc'));
  },

  row(d) {
    const h = BM.h;
    const a = h('a', { class: 'bm-disc' + (d.unread ? ' is-unread' : ''), href: d.url, dataset: { id: d.id } },
      h('span', { class: 'bm-disc-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'bm-disc-main' },
        h('span', { class: 'bm-disc-title' }, d.title,
          d.pinned ? h('span', { class: 'bm-tag' }, 'Pinned') : null,
          d.locked ? h('span', { class: 'bm-tag' }, 'Locked') : null),
        h('span', { class: 'bm-muted bm-small' }, `${d.author} · started ${BM.ago(d.created)}`)),
      h('span', { class: 'bm-disc-side' },
        h('span', { class: 'bm-disc-replies' }, d.replies === 1 ? '1 reply' : `${d.replies} replies`,
          d.unread ? h('span', { class: 'bm-badge', title: 'Unread posts' }, `${d.unread} new`) : null),
        h('span', { class: 'bm-muted bm-small' }, d.replies ? `last: ${d.lastBy}, ${BM.ago(d.lastTs)}` : '')));
    a.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      const items = this.shown.map((x) => ({ id: `d${x.id}`, did: x.id, name: x.title, module: 'discussion', url: x.url }));
      BM.viewer.open(items, `d${d.id}`);
    });
    return a;
  },

  // Opening a discussion marks it read in Moodle; reflect that here straight away.
  markRead(id) {
    const d = this.discussions.find((x) => x.id === id);
    if (!d || !d.unread) return;
    d.unread = 0;
    const row = this.root.querySelector(`.bm-disc[data-id="${id}"]`);
    row?.classList.remove('is-unread');
    row?.querySelector('.bm-disc-replies .bm-badge')?.remove();
  },
};
