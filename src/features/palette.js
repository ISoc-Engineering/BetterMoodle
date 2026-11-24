// Ctrl/⌘+K: search courses, deadlines and every activity in every current course.
// The index is built from core_courseformat_get_state per course (no need to visit each course first)
// and from the per-course cache that course pages fill in with file types.
var BM = globalThis.BM;

BM.palette = {
  INDEX_MAX_AGE: 60 * 60 * 1000,
  el: null,
  results: [],
  sel: 0,

  init() {
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.isOpen() ? this.close() : this.open();
      }
    }, true);
  },

  isOpen() { return !!this.el && !this.el.hidden; },

  build() {
    if (this.el) return;
    const h = BM.h;
    this.input = h('input', { class: 'bm-p-input', type: 'text', placeholder: 'Search courses, deadlines, files…', 'aria-label': 'Search Moodle' });
    this.list = h('ul', { class: 'bm-p-list', role: 'listbox' });
    this.hint = h('div', { class: 'bm-p-hint bm-muted bm-small' });
    this.el = h('div', { class: 'bm-palette', hidden: true, onclick: (e) => { if (e.target === this.el) this.close(); } },
      h('div', { class: 'bm-p-box', role: 'dialog', 'aria-label': 'Search' }, this.input, this.list, this.hint));
    document.body.append(this.el);
    this.input.addEventListener('input', () => { this.sel = 0; this.search(); });
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { this.move(1); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { this.move(-1); e.preventDefault(); }
      else if (e.key === 'Enter') { this.choose(this.results[this.sel], e); e.preventDefault(); }
      else if (e.key === 'Escape') { this.close(); e.preventDefault(); e.stopPropagation(); }
    });
  },

  async open() {
    this.build();
    this.el.hidden = false;
    this.input.value = '';
    this.input.focus();
    this.docs = this.docs || [];
    this.search();
    await this.loadIndex();
    this.search();
  },

  close() { if (this.el) this.el.hidden = true; },

  async loadIndex() {
    const [courses, deadlines] = await Promise.all([
      BM.store.swr('courses-v2', 60 * 60 * 1000, () => BM.api.courses(), () => {}),
      BM.store.swr('deadlines-v2', 5 * 60 * 1000, () => BM.api.deadlines(), () => {}),
    ]);
    const docs = [];
    for (const c of courses || []) docs.push({ kind: 'Course', title: c.name, sub: c.category, url: `/course/view.php?id=${c.id}` });
    for (const e of deadlines || []) docs.push({ kind: 'Due', title: e.name, sub: `${e.courseName.split(':')[0]} · ${BM.countdown(e.ts)}`, url: e.url });

    const states = await BM.pool(courses || [], 2, async (c) => {
      const hit = await BM.store.get(`course:${c.id}`);
      if (hit && Date.now() - hit.t < this.INDEX_MAX_AGE) return { c, model: BM.courseData.merge(hit.v.model, hit.v.enrich || {}) };
      const model = BM.courseData.fromState(await BM.api.courseState(c.id));
      // Keep enrichment from an earlier course-page visit; only the structure is refreshed here.
      await BM.store.set(`course:${c.id}`, { model, enrich: hit?.v?.enrich || {}, rev: hit?.v?.rev || '' });
      return { c, model: BM.courseData.merge(model, hit?.v?.enrich || {}) };
    });
    for (const s of states) {
      if (!s) continue;
      const code = s.c.name.split(':')[0];
      for (const it of BM.courseData.items(s.model)) {
        if (it.module === 'label' || !it.url) continue;
        docs.push({
          kind: it.badge || BM.course.modLabel(it.module),
          title: it.name,
          sub: `${code} · ${s.model.sections.find((x) => x.id === it.sectionId)?.title || ''}`,
          url: it.url,
          item: it,
          courseId: s.c.id,
          extra: s.c.name, // searchable, not shown: lets "networked lecture" match COMP0023 files
        });
      }
    }
    this.docs = docs;
  },

  norm(s) { return s.toLowerCase().replace(/[_\-]+/g, ' '); },

  score(doc, terms) {
    const t = this.norm(doc.title);
    const all = this.norm(`${doc.title} ${doc.sub} ${doc.kind} ${doc.extra || ''}`);
    let s = 0;
    for (const term of terms) {
      if (!all.includes(term)) return 0;
      s += t.startsWith(term) ? 4 : t.includes(term) ? 2 : 1;
    }
    if (doc.kind === 'Course') s += 1;
    if (doc.kind === 'Due') s += 0.5;
    return s;
  },

  search() {
    const h = BM.h;
    const q = this.norm(this.input.value.trim());
    const terms = q.split(/\s+/).filter(Boolean);
    let res;
    if (!terms.length) res = this.docs.filter((d) => d.kind === 'Due' || d.kind === 'Course').slice(0, 12);
    else res = this.docs.map((d) => [this.score(d, terms), d]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).slice(0, 30).map(([, d]) => d);
    this.results = res;
    this.sel = Math.min(this.sel, Math.max(0, res.length - 1));
    this.list.replaceChildren(...res.map((d, i) => h('li', {
      class: 'bm-p-item' + (i === this.sel ? ' is-sel' : ''), role: 'option',
      onmousemove: () => { if (this.sel !== i) { this.sel = i; this.paintSel(); } },
      onclick: (e) => this.choose(d, e),
    }, h('span', { class: 'bm-p-kind' }, d.kind), h('span', { class: 'bm-p-title' }, d.title), h('span', { class: 'bm-p-sub bm-muted bm-small' }, d.sub))));
    this.hint.textContent = this.docs.length ? (res.length ? '↑↓ to move · Enter to open · Ctrl/⌘+Enter for a new tab' : 'No matches') : 'Loading…';
  },

  move(d) {
    if (!this.results.length) return;
    this.sel = (this.sel + d + this.results.length) % this.results.length;
    this.paintSel();
  },

  paintSel() {
    [...this.list.children].forEach((li, i) => li.classList.toggle('is-sel', i === this.sel));
    this.list.children[this.sel]?.scrollIntoView({ block: 'nearest' });
  },

  choose(d, e) {
    if (!d) return;
    if (e && (e.metaKey || e.ctrlKey)) { window.open(d.url, '_blank', 'noopener'); return; }
    this.close();
    if (d.item && BM.courseData.viewMode(d.item)) {
      // Open files in the viewer: right here if we're on that course, otherwise jump there.
      if (BM.course.model && BM.course.model.id === d.courseId) { BM.course.openItem(d.item.id); return; }
      location.href = `/course/view.php?id=${d.courseId}#bm-open=${d.item.id}`;
      return;
    }
    location.href = d.url;
  },
};
