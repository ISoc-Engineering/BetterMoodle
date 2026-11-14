// Ctrl/Cmd+K search across courses, deadlines and every file/activity on course pages
// you've visited (indexed locally as you browse).
(() => {
  const BM = globalThis.BM;
  const { h, SEL, MODS } = BM;

  const NAV = [
    ['Dashboard', '/my/'],
    ['Calendar', '/calendar/view.php?view=upcoming'],
    ['Grades', '/grade/report/overview/index.php'],
    ['My courses', '/my/courses.php'],
  ];

  let dlg, input, listEl, items = [], results = [], sel = 0;

  async function load() {
    const [courses, deadlines, idx] = await Promise.all([
      BM.store.get('courses'), BM.store.get('deadlines'), BM.store.all('idx:'),
    ]);
    if (!courses) BM.swr('courses', 6 * 3600e3, BM.api.courses, () => load().then(search));
    items = [
      ...NAV.map(([name, path]) => ({ type: 'Go to', name, sub: '', url: BM.wwwroot() + path })),
      ...(courses?.data || []).map((c) => ({ type: 'Course', name: c.name, sub: c.short, url: c.url, boost: 2 })),
      ...(deadlines?.data || []).map((d) => ({
        type: 'Due', name: d.name, sub: `${d.course?.short || ''} · ${BM.fmtDay(d.time)}`, url: d.url, boost: 1,
      })),
      ...idx.flatMap((c) => c.items.map((it) => ({
        type: BM.kindLabel(it.kind) === 'File' ? it.mod[0].toUpperCase() + it.mod.slice(1) : BM.kindLabel(it.kind),
        name: it.name,
        sub: [c.name, it.section].filter(Boolean).join(' · '),
        url: it.url,
        cmid: it.cmid,
        courseId: c.id,
        courseUrl: c.url,
        viewer: MODS.viewer.includes(it.mod),
      }))),
    ];
  }

  function score(item, toks) {
    const name = item.name.toLowerCase();
    const hay = `${name} ${item.sub.toLowerCase()} ${item.type.toLowerCase()}`;
    let s = item.boost || 0;
    for (const t of toks) {
      const i = hay.indexOf(t);
      if (i < 0) return -1;
      s += i === 0 ? 4 : /[\s\-_·(]/.test(hay[i - 1]) ? 3 : 1;
      if (name.includes(t)) s += 2;
    }
    return s;
  }

  function search() {
    if (!dlg?.open) return;
    const toks = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    results = toks.length
      ? items.map((it) => [score(it, toks), it]).filter(([s]) => s >= 0).sort((a, b) => b[0] - a[0]).slice(0, 40).map(([, it]) => it)
      : items.filter((it) => it.type === 'Go to' || it.type === 'Course' || it.type === 'Due').slice(0, 40);
    sel = 0;
    draw();
  }

  function draw() {
    listEl.replaceChildren(
      ...(results.length
        ? results.map((it, i) =>
            h('li', {
              class: 'bm-p-item',
              role: 'option',
              'aria-selected': i === sel ? 'true' : 'false',
              onmousemove: () => { if (sel !== i) { sel = i; draw(); } },
              onclick: (e) => choose(it, e.ctrlKey || e.metaKey),
            },
              h('span', { class: 'bm-p-main' },
                h('span', { class: 'bm-p-name', text: it.name }),
                it.sub ? h('span', { class: 'bm-p-sub', text: it.sub }) : null),
              h('span', { class: 'bm-p-type', text: it.type })))
        : [h('li', { class: 'bm-p-empty', text: input.value ? 'No matches. Visit a course once to make its files searchable.' : 'Type to search' })]));
    listEl.children[sel]?.scrollIntoView({ block: 'nearest' });
  }

  function choose(it, newTab) {
    if (!it) return;
    if (newTab) return void window.open(it.url, '_blank', 'noopener');
    close();
    if (it.viewer && it.courseId === BM.page.courseId() && BM.course.openCmid(it.cmid)) return;
    location.href = it.viewer ? `${it.courseUrl}#bm-open=${it.cmid}` : it.url;
  }

  function build() {
    input = h('input', {
      class: 'bm-p-input',
      type: 'text',
      placeholder: 'Search courses, slides, deadlines…',
      'aria-label': 'Search',
      autocomplete: 'off',
      spellcheck: 'false',
      oninput: search,
      onkeydown: (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(results.length - 1, sel + 1); draw(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
        else if (e.key === 'Enter') { e.preventDefault(); choose(results[sel], e.ctrlKey || e.metaKey); }
      },
    });
    listEl = h('ul', { class: 'bm-p-list', role: 'listbox' });
    dlg = h('dialog', { id: 'bm-palette', 'aria-label': 'Search Moodle' },
      h('div', { class: 'bm-p-box' },
        h('div', { class: 'bm-p-head' }, BM.icon('search'), input, h('kbd', { class: 'bm-kbd', text: 'Esc' })),
        listEl));
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    document.body.append(dlg);
  }

  async function open() {
    if (!dlg) build();
    if (dlg.open) return input.select();
    input.value = '';
    dlg.showModal();
    input.focus();
    await load();
    search();
  }

  function close() {
    dlg?.close();
  }

  BM.palette = {
    init() {
      document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          open();
        }
      }, true);
      const nav = document.querySelector(SEL.userNav);
      if (nav) {
        nav.prepend(h('button', { type: 'button', class: 'bm-nav-search', onclick: open, title: 'Search' },
          BM.icon('search'), h('span', { text: 'Search' }), h('kbd', { class: 'bm-kbd', text: BM.isMac ? '⌘K' : 'Ctrl K' })));
      }
    },
    open,
  };
})();
