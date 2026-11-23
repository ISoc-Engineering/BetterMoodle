// Dashboard (/my/): blocks you can arrange (see layout.js):
//   Courses: every current course as a compact card (a grid, or a sideways slider), most recently used
//     first or in your own dragged order. Each card says what needs attention: Slides (new files),
//     Forum (new posts), Due (this week), Grades.
//   To do: deadlines, tick-off. Forums: the 5 newest posts. Pinboard: files, posts, deadlines,
//     courses, links and your own notes, in your order. Feedback tracker.
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
    this.coursesEl.addEventListener('scroll', () => this.updateArrows(), { passive: true });
    this.dueEl = h('div', { class: 'bm-due-list' }, h('p', { class: 'bm-muted' }, 'Loading deadlines…'));
    this.newsEl = h('div', { class: 'bm-news' }, h('p', { class: 'bm-muted' }, 'Loading forums…'));
    this.boardEl = h('div', { class: 'bm-pinboard' });
    this.forumsLink = h('a', { class: 'bm-link-btn bm-open-forums', href: '#', hidden: true }, 'Open forums');
    const toggle = h('button', { class: 'bm-link-btn bm-classic-toggle' });
    const body = h('div', { class: 'bm-home-body' });
    const root = h('div', { id: 'bm-home', class: 'bm-root' },
      h('div', { class: 'bm-home-top' }, h('div', { class: 'bm-spacer' }), toggle, BM.layout.editButton(), BM.layout.customiseButton()),
      body);
    anchor.before(root);

    await BM.layout.init(body, [
      { id: 'courses', title: 'Courses', body: this.coursesEl, extra: this.coursesTools() },
      { id: 'todo', title: 'To do', body: this.dueEl },
      { id: 'forums', title: 'Forums', body: this.newsEl, extra: this.forumsLink },
      { id: 'pinboard', title: 'Pinboard', body: this.boardEl, extra: this.boardTools() },
      { id: 'feedback', title: 'Feedback tracker', bare: true, body: h('a', { class: 'bm-feedback-link', href: this.feedbackUrl() }, 'Feedback tracker', h('span', { 'aria-hidden': 'true' }, '›')) },
    ]);
    this.applyCoursesView();
    BM.layout.onChange(() => this.applyCoursesView());
    addEventListener('resize', () => this.updateArrows(), { passive: true });

    const setClassic = (v) => {
      classic = v;
      try { localStorage.setItem('bm:classicHome', v ? '1' : '0'); } catch (_) {}
      anchor.classList.toggle('bm-replaced', !v);
      body.hidden = v;
      for (const b of root.querySelectorAll('.bm-home-top .bm-custom-btn')) b.hidden = v;
      toggle.textContent = v ? 'Use BetterMoodle dashboard' : 'Classic dashboard';
    };
    toggle.addEventListener('click', () => setClassic(!classic));
    setClassic(classic);

    const err = (el) => () => el.replaceChildren(h('p', { class: 'bm-muted' }, "Couldn't load this. Try refreshing, or use the classic dashboard."));
    this.done = await BM.done.all();
    this.visits = await BM.recent.all();
    this.order = (await BM.store.get('course-order'))?.v || [];
    await this.renderPins();
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

  // Grid / Slider switch, plus the slider's arrows (only while sliding and only if it overflows).
  coursesTools() {
    const h = BM.h;
    const seg = (view, label, svg) => {
      const b = h('button', { class: 'bm-seg-btn', type: 'button', title: label, 'aria-label': `Show courses as a ${label.toLowerCase()}`, dataset: { view }, onclick: () => BM.layout.setCourses(view) });
      b.innerHTML = svg;
      return b;
    };
    this.prevBtn = h('button', { class: 'bm-strip-btn', type: 'button', 'aria-label': 'Scroll courses left', onclick: () => this.scrollCourses(-1) }, '‹');
    this.nextBtn = h('button', { class: 'bm-strip-btn', type: 'button', 'aria-label': 'Scroll courses right', onclick: () => this.scrollCourses(1) }, '›');
    this.viewSeg = h('div', { class: 'bm-seg', role: 'group', 'aria-label': 'Course view' },
      seg('grid', 'Grid', '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>'),
      seg('slider', 'Slider', '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1" y="3" width="4" height="10" rx="1"/><rect x="6" y="3" width="4" height="10" rx="1"/><rect x="11" y="3" width="4" height="10" rx="1" opacity=".45"/></svg>'));
    return h('div', { class: 'bm-block-tools' }, this.prevBtn, this.nextBtn, this.viewSeg);
  },

  applyCoursesView() {
    const slider = BM.layout.state.courses === 'slider';
    this.coursesEl.classList.toggle('is-slider', slider);
    for (const b of this.viewSeg.querySelectorAll('.bm-seg-btn')) b.setAttribute('aria-pressed', String(b.dataset.view === BM.layout.state.courses));
    this.updateArrows();
  },

  scrollCourses(dir) {
    const el = this.coursesEl;
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: smooth ? 'smooth' : 'auto' });
  },

  updateArrows() {
    const el = this.coursesEl;
    if (!el || !this.prevBtn) return;
    const slider = el.classList.contains('is-slider');
    const max = el.scrollWidth - el.clientWidth;
    this.prevBtn.hidden = this.nextBtn.hidden = !slider || max <= 1;
    this.prevBtn.disabled = el.scrollLeft <= 1;
    this.nextBtn.disabled = el.scrollLeft >= max - 1;
  },

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
    this.updateArrows();
  },

  card(c) {
    const h = BM.h;
    const { code, title } = this.splitName(c);
    const week = h('span', { class: 'bm-course-week bm-small' });
    const btn = (kind, label, href) => h('a', { class: 'bm-cbtn', href, draggable: 'false', dataset: { kind } },
      h('span', {}, label), h('span', { class: 'bm-count', hidden: true }));
    const li = h('li', { class: 'bm-course', draggable: 'true', dataset: { id: c.id }, style: `--c:${BM.courseColor(c.id)}` },
      h('div', { class: 'bm-course-head' },
        h('a', { class: 'bm-course-main', href: `/course/view.php?id=${c.id}`, draggable: 'false' },
          h('span', { class: 'bm-course-code' }, c.fav ? '★ ' : '', code),
          // Same name as the course page title, so it grows into it on the way there.
          h('span', { class: 'bm-course-name', style: `view-transition-name: bm-course-${c.id}` }, title)),
        this.pinButton({ kind: 'course', id: String(c.id), title: c.name, url: `/course/view.php?id=${c.id}`, course: c.name, courseId: c.id }),
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

  splitName(c) {
    const [code, ...rest] = c.name.split(':');
    const hasCode = rest.length && /^[A-Z]{3,5}\d{3,5}/.test(code.trim());
    return { code: hasCode ? code.trim() : c.short, title: hasCode ? rest.join(':').trim() : c.name };
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

  // Drag a card onto another to reorder; the order is remembered. In the slider the cards sit in a
  // row, in the grid in rows, so "after" means right of the middle either way.
  dragHandlers(li) {
    li.addEventListener('dragstart', (e) => {
      if (e.target !== li) return;
      this.dragging = li;
      li.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', li.dataset.id);
    });
    li.addEventListener('dragend', () => {
      if (this.dragging !== li) return;
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
    li.addEventListener('drop', (e) => { if (this.dragging) e.preventDefault(); });
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
      const pick = async (color) => { await BM.colors.set(c.id, color); this.rerenderAll(); };
      card.append(h('div', { class: 'bm-swatches', role: 'group', 'aria-label': 'Course colour' },
        BM.PALETTE.map((col) => h('button', { class: 'bm-swatch', style: `--c:${col}`, 'aria-label': col, onclick: () => pick(col) })),
        h('button', { class: 'bm-swatch is-reset', onclick: () => pick(''), title: 'Default' }, '↺')));
    });
    return btn;
  },

  rerenderAll() {
    if (this.lastCourses) this.renderCourses(this.lastCourses);
    this.renderDue(this.events || []);
    if (this.news) this.renderNews(this.news);
    this.renderPins();
  },

  // ---------------------------------------------------------------- pins

  // The pin button used on dashboard items (courses, deadlines, forum posts). Pressed = on the Pinboard.
  pinButton(p) {
    const on = this.pinned?.has(BM.pins.key(p));
    const b = BM.h('button', { class: 'bm-pin bm-pin-sm', type: 'button', 'aria-pressed': String(!!on), 'aria-label': `${on ? 'Unpin' : 'Pin'} ${p.title}`, title: on ? 'Unpin' : 'Pin to Pinboard', dataset: { key: BM.pins.key(p) } });
    b.innerHTML = BM.PIN_SVG;
    b.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const now = b.getAttribute('aria-pressed') !== 'true';
      await BM.pins.toggle(p, now);
      await this.renderPins();
      this.syncPinButtons();
      if (now) BM.toast('Pinned to your Pinboard');
    });
    return b;
  },

  syncPinButtons() {
    for (const b of document.querySelectorAll('#bm-home .bm-pin-sm')) {
      const label = b.getAttribute('aria-label').replace(/^(Unpin|Pin) /, '');
      const key = b.dataset.key;
      if (!key) continue;
      const on = this.pinned.has(key);
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', `${on ? 'Unpin' : 'Pin'} ${label}`);
      b.title = on ? 'Unpin' : 'Pin to Pinboard';
    }
  },

  // + Note and + Link, in the Pinboard's heading.
  boardTools() {
    const h = BM.h;
    return h('div', { class: 'bm-block-tools' },
      h('button', { class: 'bm-tool-btn', type: 'button', onclick: () => this.addNote() }, '+ Note'),
      h('button', { class: 'bm-tool-btn', type: 'button', onclick: () => this.linkForm() }, '+ Link'));
  },

  async addNote() {
    BM.layout.state.folded.pinboard && BM.layout.toggleFold('pinboard');
    const pins = await BM.pins.list();
    const used = new Set(pins.filter((p) => p.kind === 'note').map((p) => p.color));
    const color = BM.PALETTE.find((c) => !used.has(c)) || BM.PALETTE[pins.length % BM.PALETTE.length];
    const id = `n${Date.now().toString(36)}`;
    await BM.pins.toggle({ kind: 'note', id, title: '', text: '', color }, true);
    await this.renderPins();
    this.boardEl.querySelector(`[data-key="note:${id}"] textarea`)?.focus();
  },

  // A small inline form: address, and an optional name. Only http(s) addresses are accepted.
  linkForm() {
    const h = BM.h;
    BM.layout.state.folded.pinboard && BM.layout.toggleFold('pinboard');
    this.boardEl.querySelector('.bm-link-form')?.remove();
    const url = h('input', { class: 'bm-input', type: 'url', placeholder: 'Paste a link', 'aria-label': 'Link address', required: true });
    const name = h('input', { class: 'bm-input', type: 'text', placeholder: 'Name (optional)', 'aria-label': 'Link name' });
    const msg = h('span', { class: 'bm-small bm-form-msg', role: 'alert' });
    const form = h('form', { class: 'bm-link-form' }, url, name,
      h('div', { class: 'bm-form-row' }, msg, h('div', { class: 'bm-spacer' }),
        h('button', { class: 'bm-link-btn', type: 'button', onclick: () => form.remove() }, 'Cancel'),
        h('button', { class: 'bm-btn bm-btn-primary', type: 'submit' }, 'Pin link')));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      let u;
      try { u = new URL(url.value.trim(), location.href); } catch (_) {}
      if (!u || !/^https?:$/.test(u.protocol)) { msg.textContent = 'That isn’t a web address.'; url.focus(); return; }
      const title = name.value.trim() || (u.hostname + u.pathname).replace(/\/$/, '');
      await BM.pins.toggle({ kind: 'link', id: `l${Date.now().toString(36)}`, title, url: u.href }, true);
      form.remove();
      this.renderPins();
    });
    form.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); form.remove(); } });
    this.boardEl.prepend(form);
    url.focus();
  },

  KIND_LABEL: { file: 'File', post: 'Forum post', week: 'Week', deadline: 'Deadline', course: 'Course', link: 'Link' },

  // The Pinboard: everything you pinned as cards, in your order (drag to rearrange). Notes are typed
  // straight onto the card and saved as you go.
  async renderPins() {
    const h = BM.h;
    const pins = await BM.pins.list();
    this.pinned = new Set(pins.map((p) => BM.pins.key(p)));
    const form = this.boardEl.querySelector('.bm-link-form');
    if (!pins.length) {
      this.boardEl.replaceChildren(form || '', h('p', { class: 'bm-muted bm-small bm-board-empty' }, 'Nothing pinned yet. Use the pin on a course, deadline, post or file, or add a note.'));
      return;
    }
    const list = h('ul', { class: 'bm-board' }, pins.map((p) => this.pinCard(p)));
    this.boardEl.replaceChildren(...[form, list].filter(Boolean));
  },

  pinCard(p) {
    const h = BM.h;
    const key = BM.pins.key(p);
    const remove = h('button', { class: 'bm-pin-x', type: 'button', title: 'Unpin', 'aria-label': `Unpin ${p.title || 'note'}` }, '×');
    remove.addEventListener('click', async () => {
      await BM.pins.toggle(p, false);
      await this.renderPins();
      this.syncPinButtons();
      BM.toast(p.kind === 'note' ? 'Note deleted' : 'Unpinned', 'Undo', async () => { await BM.pins.toggle(p, true); await this.renderPins(); this.syncPinButtons(); });
    });
    let li;
    if (p.kind === 'note') {
      const text = h('textarea', { class: 'bm-note-text', rows: '3', placeholder: 'Write a note', 'aria-label': 'Note' });
      text.value = p.text || '';
      let timer;
      text.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => BM.pins.save({ ...p, text: text.value }), 400);
      });
      text.addEventListener('blur', () => { clearTimeout(timer); BM.pins.save({ ...p, text: text.value }); });
      const recolor = h('button', { class: 'bm-note-color', type: 'button', title: 'Change colour', 'aria-label': 'Change note colour' });
      recolor.addEventListener('click', async () => {
        const next = BM.PALETTE[(BM.PALETTE.indexOf(p.color) + 1) % BM.PALETTE.length];
        p.color = next;
        li.style.setProperty('--c', next);
        await BM.pins.save({ ...p, text: text.value });
      });
      li = h('li', { class: 'bm-pin-card is-note', dataset: { key }, style: `--c:${p.color || BM.PALETTE[1]}` },
        h('div', { class: 'bm-pin-bar' }, recolor, h('div', { class: 'bm-spacer' }), remove), text);
    } else {
      const course = p.kind === 'course' ? '' : this.shortCourse(p.course);
      li = h('li', { class: 'bm-pin-card', dataset: { key, kind: p.kind }, style: `--c:${p.courseId ? BM.courseColor(p.courseId) : 'var(--bm-line)'}` },
        h('a', { class: 'bm-pin-item', href: p.url, draggable: 'false' },
          h('span', { class: 'bm-pin-kind bm-small' }, [this.KIND_LABEL[p.kind] || 'Pinned', course].filter(Boolean).join(', ')),
          h('span', { class: 'bm-pin-title' }, p.kind === 'course' ? this.splitName({ name: p.title, short: p.title }).title : p.title),
          p.kind === 'deadline' && p.ts ? h('span', { class: 'bm-pin-when bm-small' }, BM.countdown(p.ts)) : null),
        remove);
    }
    this.pinDrag(li);
    return li;
  },

  // Drag a card to a new spot on the board. Typing in a note never starts a drag.
  pinDrag(li) {
    li.addEventListener('pointerdown', (e) => { li.draggable = !e.target.closest('textarea, button, input'); });
    li.addEventListener('dragstart', (e) => {
      if (e.target !== li) return;
      e.stopPropagation();
      this.pinDragging = li;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', li.dataset.key);
      requestAnimationFrame(() => { if (this.pinDragging === li) li.classList.add('is-dragging'); });
    });
    li.addEventListener('dragend', async (e) => {
      if (e.target !== li) return;
      e.stopPropagation();
      li.classList.remove('is-dragging');
      li.draggable = false;
      this.pinDragging = null;
      await BM.pins.reorder([...this.boardEl.querySelectorAll('.bm-pin-card')].map((x) => x.dataset.key));
    });
    li.addEventListener('dragover', (e) => {
      const from = this.pinDragging;
      if (!from || from === li) return;
      e.preventDefault();
      e.stopPropagation();
      const r = li.getBoundingClientRect();
      // One card per row (narrow column): above/below. Several per row: left/right.
      const wide = r.width > this.boardEl.clientWidth * 0.6;
      const after = wide ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
      li[after ? 'after' : 'before'](from);
    });
    li.addEventListener('drop', (e) => { if (this.pinDragging) { e.preventDefault(); e.stopPropagation(); } });
  },

  // ---------------------------------------------------------------- To do

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
                h('span', { class: 'bm-due-count', title: BM.fmtTime(e.ts) }, BM.countdown(e.ts)))),
            this.pinButton({ kind: 'deadline', id: String(e.id), title: e.name, url: e.url, ts: e.ts, course: e.courseName, courseId: e.courseId })))))));
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

  // ---------------------------------------------------------------- Forums

  // The 5 newest posts. Posts and "Open forums" go to our forum feed, not Moodle's pages.
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
      const href = n.courseId ? BM.forumLink(n.courseId, n.id) : n.url;
      return h('li', { class: 'bm-news-row' },
        h('a', { class: 'bm-news-item' + (fresh ? ' is-new' : ''), href, style: `--c:${BM.courseColor(n.courseId)}` },
          h('span', { class: 'bm-news-top' },
            h('span', { class: 'bm-news-title' }, n.title),
            fresh ? h('span', { class: 'bm-badge' }, 'New') : null),
          h('span', { class: 'bm-muted bm-small' },
            [this.shortCourse(n.courseName), n.forumName, n.ts ? BM.ago(n.ts) : ''].filter(Boolean).join(', '))),
        this.pinButton({ kind: 'post', id: String(n.id), title: n.title, url: href, course: n.courseName, courseId: n.courseId }));
    })));
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
