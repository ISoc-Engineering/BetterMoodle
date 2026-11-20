// Course page: replaces UCL's one-section-per-page layout with every section on one page,
// a filter bar, a "due in this course" strip, and click-to-open in the side viewer.
var BM = globalThis.BM;

BM.course = {
  // "Weeks" is the normal view: every section (the current weeks open), each split into Slides, Files,
  // then Activities. "Slides & files" shows only course material, split the same way.
  CHIPS: [['weeks', 'Weeks'], ['materials', 'Slides & files'], ['recordings', 'Recordings'], ['assess', 'Assessments'], ['forums', 'Forums']],
  model: null,
  filter: { q: '', chip: 'weeks' },

  async init(courseId) {
    const anchor = document.querySelector('#page-content');
    if (!anchor || !courseId) return;
    const h = BM.h;
    this.courseId = courseId;
    BM.recent.visit(courseId);

    let classic = false;
    try { classic = localStorage.getItem('bm:classicCourse') === '1'; } catch (_) {}

    this.dueEl = h('div', { class: 'bm-due-strip', hidden: true });
    this.input = h('input', { type: 'search', class: 'bm-input', placeholder: 'Filter this course…  ( / )', 'aria-label': 'Filter this course' });
    this.input.addEventListener('input', () => { this.filter.q = this.input.value.trim().toLowerCase(); this.applyFilter(); });
    this.chipsEl = h('div', { class: 'bm-chips', role: 'group' },
      this.CHIPS.map(([k, label]) => h('button', {
        class: 'bm-chip', dataset: { chip: k }, 'aria-pressed': String(k === 'weeks'),
        onclick: () => { this.filter.chip = k; this.applyFilter(); },
      }, label)));
    // One highlight that slides between the chips instead of each chip switching colour.
    this.pill = h('span', { class: 'bm-chip-pill', 'aria-hidden': 'true' });
    this.chipsEl.prepend(this.pill);
    this.chipsEl.classList.add('has-pill');
    addEventListener('resize', () => this.movePill(), { passive: true });
    this.statusEl = h('span', { class: 'bm-muted bm-small' });
    this.modeEl = h('span', { class: 'bm-muted bm-small', title: 'Turn off in the BetterMoodle toolbar popup' });
    const toggle = h('button', { class: 'bm-link-btn', onclick: () => setClassic(!classic) });
    this.listEl = h('div', { class: 'bm-sections' }, h('p', { class: 'bm-muted' }, 'Loading course…'));

    this.root = h('div', { id: 'bm-course', class: 'bm-root' },
      this.dueEl,
      h('div', { class: 'bm-filterbar' }, this.input, this.chipsEl, h('div', { class: 'bm-spacer' }), this.statusEl, this.modeEl, toggle),
      this.listEl);
    anchor.before(this.root);

    const setClassic = (v) => {
      classic = v;
      try { localStorage.setItem('bm:classicCourse', v ? '1' : '0'); } catch (_) {}
      anchor.classList.toggle('bm-replaced', !v);
      toggle.textContent = v ? 'Use BetterMoodle view' : 'Classic view';
      this.listEl.hidden = v;
      this.chipsEl.hidden = this.input.hidden = v;
    };
    setClassic(classic);

    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !BM.isTyping(e) && !e.metaKey && !e.ctrlKey && !classic) { e.preventDefault(); this.input.focus(); }
    });

    BM.viewer.onChange = (it) => {
      for (const el of this.root.querySelectorAll('.bm-item.is-active')) el.classList.remove('is-active');
      if (!it) return;
      const row = this.root.querySelector(`.bm-item[data-id="${it.id}"]`);
      if (row) { row.classList.add('is-active'); row.scrollIntoView({ block: 'nearest' }); }
    };

    this.loadDue(courseId);
    this.courseName = (document.querySelector('#course-header-bg h1, .page-header-headings h1, #page-header h1')?.textContent || '').replace(/\s+/g, ' ').trim();
    this.pinned = new Set(Object.keys(await BM.pins.all()));
    this.newSet = new Set();

    // Quick look: Space on the file under the pointer (or the focused one).
    this.listEl.addEventListener('pointerover', (e) => { this.hovered = e.target.closest?.('.bm-item'); });
    this.listEl.addEventListener('pointerleave', () => { this.hovered = null; });
    document.addEventListener('keydown', (e) => {
      if (e.key !== ' ' || BM.isTyping(e) || e.metaKey || e.ctrlKey || e.altKey || BM.quicklook.isOpen() || classic) return;
      const row = document.activeElement?.closest?.('.bm-item') || this.hovered;
      const list = this.viewables();
      if (!row || !list.some((i) => i.id === row.dataset.id)) return;
      e.preventDefault();
      BM.quicklook.open(list, row.dataset.id);
    });
    // Opening a file anywhere (click, viewer, quick look) fills in its week's progress ring.
    document.addEventListener('bm:opened', (e) => this.markOpened(e.detail));

    let first = true;
    try {
      await BM.courseData.load(courseId, (model, info) => {
        this.model = model;
        this.render();
        // Files added since you last opened this course get a New tag. This visit then becomes the
        // new baseline (only once the page is actually shown, not while Chrome loads it early).
        if (!info.enriching && !this.newChecked) {
          this.newChecked = true;
          const files = BM.courseData.items(model).filter((it) => BM.courseData.FILE_MODS.includes(it.module)).map((it) => it.id);
          BM.courseInfo.newFiles(courseId, files).then((list) => {
            this.newSet = new Set(list.map(String));
            if (list.length) this.render();
            BM.whenShown(() => BM.courseInfo.markSeen(courseId, files));
          });
        }
        this.statusEl.textContent = info.enriching ? 'Checking for new files…' : '';
        if (first) { first = false; this.afterFirstRender(); }
      });
    } catch (e) {
      console.warn('[BetterMoodle] course load failed', e);
      setClassic(true);
      this.statusEl.textContent = "Couldn't load this course. Showing the classic view.";
    }
  },

  afterFirstRender() {
    // Section pages (section.php?id=X) scroll to their section.
    const sp = new URLSearchParams(location.search);
    if (location.pathname.endsWith('/course/section.php') && sp.get('id')) {
      this.root.querySelector(`.bm-section[data-id="${sp.get('id')}"]`)?.scrollIntoView({ block: 'start' });
    }
    // From the dashboard: #bm-slides opens Slides & files at this week; #bm-week=<id> opens that week.
    const week = location.hash.match(/bm-week=(\d+)/)?.[1] || (location.hash.includes('bm-slides') ? this.currentWeekId() : '');
    if (location.hash.includes('bm-slides')) { this.filter.chip = 'materials'; this.applyFilter(); }
    if (week) {
      const sec = this.root.querySelector(`.bm-section[data-id="${week}"]`);
      if (sec?.classList.contains('is-collapsed') && !this.root.classList.contains('is-filtering')) sec.querySelector('.bm-section-head').click();
      sec?.scrollIntoView({ block: 'start' });
    }
    if (week || location.hash.includes('bm-slides')) history.replaceState(null, '', location.pathname + location.search);
    // Deep link from Ctrl+K on another page: #bm-open=<cmid>
    const m = location.hash.match(/bm-open=(\d+)/);
    if (m) {
      history.replaceState(null, '', location.pathname + location.search);
      this.openItem(m[1]);
    }
  },

  // The week that's "now": Moodle's highlighted section, else the latest one with files.
  currentWeekId() {
    const cd = BM.courseData;
    const weeks = cd.visibleSections(this.model).filter((s) => !cd.isNoise(s));
    const cur = weeks.find((s) => s.current) || [...weeks].reverse().find((s) => s.items.some((it) => cd.category(it) === 'files'));
    return cur ? cur.id : '';
  },

  // Week progress: how many of a week's files you've opened, as a small ring in its header.
  ring(s) {
    const files = s.items.filter((it) => BM.courseData.category(it) === 'files');
    if (!files.length) return null;
    const done = files.filter((it) => BM.opened.cache[it.id]).length;
    const r = 7, c = 2 * Math.PI * r;
    const el = BM.h('span', { class: 'bm-ring' + (done === files.length ? ' is-full' : ''), title: `${done} of ${files.length} files opened`, dataset: { done, total: files.length } });
    el.innerHTML = `<svg viewBox="0 0 18 18" aria-hidden="true"><circle cx="9" cy="9" r="${r}" class="bm-ring-track"/><circle cx="9" cy="9" r="${r}" class="bm-ring-fill" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - done / files.length)}"/></svg>`;
    el.append(BM.h('span', { class: 'bm-ring-text' }, `${done}/${files.length}`));
    return el;
  },

  markOpened(id) {
    const row = this.root?.querySelector(`.bm-item[data-id="${id}"]`);
    if (!row) return;
    row.classList.add('is-opened');
    const s = this.model.sections.find((x) => x.items.some((it) => it.id === String(id)));
    const old = row.closest('.bm-section')?.querySelector('.bm-section-head .bm-ring');
    const fresh = s && this.ring(s);
    if (old && fresh) old.replaceWith(fresh);
  },

  pinButton(it) {
    const p = { kind: 'file', id: it.id, title: it.name, url: it.url || BM.courseData.frameUrl(it), course: this.courseName, courseId: this.courseId };
    const on = this.pinned.has(BM.pins.key(p));
    const b = BM.h('button', { class: 'bm-pin', type: 'button', 'aria-pressed': String(on), 'aria-label': `${on ? 'Unpin' : 'Pin'} ${it.name}`, title: on ? 'Unpin from dashboard' : 'Pin to dashboard' });
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3l6 6-3 1-4 4 1 5-2 2-4-4-5 5-1-1 5-5-4-4 2-2 5 1 4-4z"/></svg>';
    b.addEventListener('click', async () => {
      const now = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(now));
      b.title = now ? 'Unpin from dashboard' : 'Pin to dashboard';
      b.setAttribute('aria-label', `${now ? 'Unpin' : 'Pin'} ${it.name}`);
      if (now) this.pinned.add(BM.pins.key(p)); else this.pinned.delete(BM.pins.key(p));
      await BM.pins.toggle(p, now);
      BM.toast(now ? 'Pinned to your dashboard' : 'Unpinned');
    });
    return b;
  },

  viewables() {
    return BM.courseData.visibleSections(this.model).flatMap((s) => s.items).filter((i) => BM.courseData.viewMode(i));
  },

  openItem(id) {
    let list = this.viewables();
    // A file from a hidden section (e.g. opened via Ctrl+K) still opens, on its own.
    if (!list.some((i) => i.id === String(id))) {
      const it = BM.courseData.items(this.model).find((i) => i.id === String(id));
      if (!it || !BM.courseData.viewMode(it)) return;
      list = [it];
    }
    BM.viewer.open(list, id);
  },

  render() {
    const h = BM.h;
    const m = this.model;
    const sections = BM.courseData.visibleSections(m);
    const hidden = m.sections.filter((s) => s.items.length).length - sections.length;
    // Shown whenever the mode is on, so it's obvious the page has picked up the setting.
    this.modeEl.textContent = BM.settings?.aggressive
      ? `Aggressive mode${hidden ? ` · ${hidden} section${hidden > 1 ? 's' : ''} hidden` : ''}` : '';
    if (!sections.length) { this.listEl.replaceChildren(h('p', { class: 'bm-muted' }, 'This course has no content yet.')); return; }
    const folded = this.foldState(sections);

    const firstPaint = !this.listEl.querySelector('.bm-section');
    this.listEl.replaceChildren(...sections.map((s, i) => {
      const count = s.items.filter((i) => i.module !== 'label').length;
      const head = h('button', { class: 'bm-section-head', 'aria-expanded': 'true' },
        h('span', { class: 'bm-section-title' }, s.title || `Section ${s.number}`),
        this.ring(s),
        count ? h('span', { class: 'bm-muted bm-small' }, String(count)) : null);
      const sec = h('section', { class: 'bm-section', dataset: { id: s.id }, style: `--c:${BM.colorFor(i)}` },
        head, h('ul', { class: 'bm-items' },
          h('li', { class: 'bm-subhead', dataset: { group: 'slides' }, hidden: true }, 'Slides'),
          h('li', { class: 'bm-subhead', dataset: { group: 'files' }, hidden: true }, 'Files'),
          h('li', { class: 'bm-subhead', dataset: { group: 'other' }, hidden: true }, 'Activities'),
          s.items.map((it) => this.renderItem(it))));
      head.addEventListener('click', () => {
        const collapsing = head.getAttribute('aria-expanded') === 'true';
        head.setAttribute('aria-expanded', String(!collapsing));
        this.saveFold(s.id, collapsing);
        const items = sec.querySelector('.bm-items');
        if (this.root.classList.contains('is-filtering')) { sec.classList.toggle('is-collapsed', collapsing); return; }
        if (collapsing) BM.slide(items, false, () => sec.classList.toggle('is-collapsed', head.getAttribute('aria-expanded') === 'false'));
        else { sec.classList.remove('is-collapsed'); BM.slide(items, true); }
      });
      if (folded.has(s.id)) { sec.classList.add('is-collapsed'); head.setAttribute('aria-expanded', 'false'); }
      return sec;
    }));
    if (firstPaint) BM.reveal(this.listEl.children);
    this.applyFilter();
    if (BM.viewer.isOpen()) BM.viewer.refresh(this.viewables());
  },

  // Which sections start collapsed. By default the current week and the one before it are open, and
  // everything else (older weeks, later weeks, General and other admin sections) is collapsed.
  // Anything you open or close yourself is remembered per course.
  foldState(sections) {
    const cd = BM.courseData;
    const weeks = sections.filter((s) => !cd.isNoise(s));
    let cur = weeks.findIndex((s) => s.current);
    if (cur < 0) { // Moodle doesn't mark a current section: use the latest one with files in it
      for (let i = weeks.length - 1; i >= 0 && cur < 0; i--) if (weeks[i].items.some((it) => cd.category(it) === 'files')) cur = i;
    }
    const open = new Set(cur < 0 ? weeks.slice(0, 1).map((s) => s.id) : weeks.slice(Math.max(0, cur - 1), cur + 1).map((s) => s.id));
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(`bm:fold:${this.courseId}`) || '{}'); } catch (_) {}
    return new Set(sections.filter((s) => (s.id in saved ? saved[s.id] : !open.has(s.id))).map((s) => s.id));
  },

  saveFold(sectionId, collapsed) {
    try {
      const key = `bm:fold:${this.courseId}`;
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      saved[sectionId] = collapsed;
      localStorage.setItem(key, JSON.stringify(saved));
    } catch (_) {}
  },

  renderItem(it) {
    const h = BM.h;
    if (it.module === 'label') {
      if (!it.desc) return null;
      // Labels are free-form text blocks; clamp them so they don't bury the files. Click to expand.
      const body = h('div', { class: 'bm-label-body' }, BM.safeFragment(it.desc));
      const li = h('li', { class: 'bm-label', dataset: { id: it.id, cat: 'other', text: (it.name + ' ' + body.textContent).toLowerCase() } }, body);
      body.addEventListener('click', (e) => { if (!e.target.closest('a, iframe, video, audio')) li.classList.toggle('is-open'); });
      return li;
    }
    const mode = BM.courseData.viewMode(it);
    const meta = [it.badge || (it.module === 'resource' ? '' : this.modLabel(it.module)), it.size].filter(Boolean).join(' · ');
    const isNew = this.newSet?.has(it.id);
    const descText = it.desc ? BM.safeFragment(it.desc).textContent.replace(/\s+/g, ' ').trim() : '';
    const a = h('a', { class: 'bm-item-link', href: it.url || '#' },
      it.icon ? h('img', { class: 'bm-icon', src: it.icon, alt: '' }) : h('span', { class: 'bm-icon bm-icon-blank' }),
      h('span', { class: 'bm-item-main' },
        h('span', { class: 'bm-item-name' }, it.name, isNew ? h('span', { class: 'bm-tag bm-tag-new' }, 'New') : null),
        descText ? h('span', { class: 'bm-item-desc' }, descText) : null),
      meta ? h('span', { class: 'bm-item-meta' }, meta) : null);
    a.addEventListener('click', () => BM.opened.mark(it.id));
    if (mode) {
      a.addEventListener('click', (e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        this.openItem(it.id);
      });
    }
    const cat = BM.courseData.category(it);
    return h('li', { class: 'bm-item' + (BM.opened.cache[it.id] ? ' is-opened' : '') + (isNew ? ' is-new' : ''),
      dataset: { id: it.id, cat, slides: BM.courseData.isSlides(it) ? '1' : '0', text: (it.name + ' ' + descText + ' ' + meta).toLowerCase() } },
    a, cat === 'files' ? this.pinButton(it) : null);
  },

  modLabel(mod) {
    return ({ assign: 'Assignment', quiz: 'Quiz', forum: 'Forum', hsuforum: 'Forum', lti: 'Recording', panoptocourseembed: 'Panopto',
      turnitintooltwo: 'Turnitin', page: 'Page', book: 'Book', folder: 'Folder', url: 'Link', questionnaire: 'Survey', feedback: 'Survey',
      choice: 'Poll', workshop: 'Workshop', lesson: 'Lesson', h5pactivity: 'H5P', glossary: 'Glossary', wiki: 'Wiki' })[mod] || mod;
  },

  applyFilter() {
    const { q, chip } = this.filter;
    for (const b of this.chipsEl.querySelectorAll('.bm-chip')) b.setAttribute('aria-pressed', String(b.dataset.chip === chip));
    this.movePill();
    const filtering = !!q || chip !== 'weeks';
    const materials = chip === 'materials';
    this.root.classList.toggle('is-filtering', filtering);
    this.root.classList.toggle('is-materials', materials);
    for (const sec of this.listEl.querySelectorAll('.bm-section')) {
      let shown = 0;
      const groups = { slides: 0, files: 0, other: 0 };
      for (const li of sec.querySelectorAll('.bm-items > li:not(.bm-subhead)')) {
        const isLabel = li.classList.contains('bm-label');
        const chipOk = chip === 'weeks' || (!isLabel && (materials ? li.dataset.cat === 'files' : li.dataset.cat === chip));
        const ok = (!q || li.dataset.text.includes(q)) && chipOk;
        li.hidden = !ok;
        if (ok && !isLabel) shown++;
        if (ok && isLabel && q) shown++;
        if (ok && !isLabel) groups[li.dataset.slides === '1' ? 'slides' : li.dataset.cat === 'files' ? 'files' : 'other']++;
      }
      // Weeks and "Slides & files" split each week under Slides / Files / Activities headings
      // (CSS orders the items). A heading only shows when its group has something in it.
      const grouped = chip === 'weeks' || materials;
      for (const sub of sec.querySelectorAll('.bm-subhead')) sub.hidden = !grouped || !groups[sub.dataset.group];
      sec.hidden = filtering && !shown;
    }
  },

  movePill() {
    const on = this.chipsEl?.querySelector('.bm-chip[aria-pressed="true"]');
    if (!on || !on.offsetWidth) return;
    const p = this.pill;
    p.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
    p.style.width = `${on.offsetWidth}px`;
    p.style.height = `${on.offsetHeight}px`;
    if (!p.classList.contains('is-ready')) requestAnimationFrame(() => p.classList.add('is-ready')); // no slide on first placement
  },

  async loadDue(courseId) {
    const done = await BM.done.all();
    await BM.store.swr(`due-v2:${courseId}`, 5 * 60 * 1000, () => BM.api.courseDeadlines(courseId), (events) => {
      const h = BM.h;
      const upcoming = events.filter((e) => !done[e.id]).slice().sort((a, b) => a.ts - b.ts).slice(0, 4);
      this.dueEl.hidden = !upcoming.length;
      this.dueEl.replaceChildren(
        h('span', { class: 'bm-due-label' }, 'Due'),
        ...upcoming.map((e) => h('a', { class: 'bm-due-pill' + (e.ts < BM.now() ? ' is-overdue' : ''), href: e.url, title: BM.fmtTime(e.ts) },
          h('span', {}, e.name), h('span', { class: 'bm-due-when' }, BM.countdown(e.ts)))));
    });
  },
};
