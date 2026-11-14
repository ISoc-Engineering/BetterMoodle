// Course page: filter bar (text + type chips), "due in this course" strip, side-viewer
// click handling, and indexing of the course's activities for Ctrl+K search.
(() => {
  const BM = globalThis.BM;
  const { h, SEL, MODS } = BM;

  const PREVIEWABLE = new Set(['pdf', 'image', 'text', 'video', 'audio']);

  /** Moodle file icons look like .../f/pdf, .../f/pdf-24 or .../f/powerpoint?filtericon=1 */
  function fileKind(iconSrc) {
    const m = iconSrc.match(/\/f\/([a-z]+)/);
    const f = m ? m[1] : '';
    if (f === 'pdf') return 'pdf';
    if (/^(image|jpeg|png|gif|bmp|svg)$/.test(f)) return 'image';
    if (/^(text|markdown|sourcecode)$/.test(f)) return 'text';
    if (/^(video|mpeg|quicktime|avi|wmv|flash)$/.test(f)) return 'video';
    if (/^(audio|mp3|wav)$/.test(f)) return 'audio';
    if (/^(powerpoint|impress)$/.test(f)) return 'slides';
    if (/^(document|writer|oth)$/.test(f)) return 'doc';
    if (/^(spreadsheet|calc|csv)$/.test(f)) return 'sheet';
    if (/^(archive|zip)$/.test(f)) return 'zip';
    return f ? 'file' : 'pdf'; // unknown icon: most course files are PDFs, try previewing
  }

  function cleanText(el) {
    if (!el) return '';
    const c = el.cloneNode(true);
    c.querySelectorAll(SEL.hiddenText).forEach((n) => n.remove());
    return c.textContent.replace(/\s+/g, ' ').trim();
  }

  function withParam(url, k, v) {
    const u = new URL(url, location.href);
    u.searchParams.set(k, v);
    return u.href;
  }

  function collect(content) {
    const out = [];
    for (const el of content.querySelectorAll(SEL.activity)) {
      const mod = (el.className.match(/\bmodtype_(\w+)/) || [])[1];
      const a = el.querySelector(SEL.activityLink);
      if (!mod || !a || mod === 'label' || mod === 'subsection') continue;
      const kind = mod === 'resource' ? fileKind(el.querySelector(SEL.activityIcon)?.src || '') : mod;
      const sectionEl = el.closest(SEL.section);
      out.push({
        cmid: el.dataset.id || el.id.replace('module-', ''),
        name: cleanText(el.querySelector(SEL.activityName) || a),
        mod,
        kind,
        url: a.href,
        previewUrl: mod === 'resource' ? withParam(a.href, 'redirect', '1') : a.href,
        previewable: mod === 'resource' ? PREVIEWABLE.has(kind) : MODS.viewer.includes(mod),
        section: sectionEl ? cleanText(sectionEl.querySelector(SEL.sectionName)) : '',
        el,
      });
    }
    return out;
  }

  async function saveIndex(courseId, items) {
    const name = cleanText(document.querySelector(SEL.pageTitle)) || document.title;
    const prev = (await BM.store.get(`idx:${courseId}`))?.items || [];
    const byId = new Map(prev.map((i) => [i.cmid, i]));
    for (const { el, ...rest } of items) byId.set(rest.cmid, rest);
    await BM.store.set(`idx:${courseId}`, {
      id: courseId,
      name,
      url: `${BM.wwwroot()}/course/view.php?id=${courseId}`,
      items: [...byId.values()],
    });
  }

  function filterBar(content, items) {
    const byEl = new Map(items.map((i) => [i.el, i]));
    let cat = 'all';
    const chips = [['all', 'All'], ['files', 'Files'], ['assessments', 'Assessments'], ['forums', 'Forums']];

    const input = h('input', {
      type: 'search',
      class: 'bm-input',
      placeholder: 'Filter this course',
      'aria-label': 'Filter this course',
      oninput: apply,
      onkeydown: (e) => {
        if (e.key === 'Escape') { input.value = ''; apply(); input.blur(); }
        if (e.key === 'Enter') {
          const first = items.find((i) => !i.el.classList.contains('bm-hidden'));
          if (first) openItem(first, items, e);
        }
      },
    });
    const chipEls = chips.map(([key, label]) =>
      h('button', {
        type: 'button',
        class: 'bm-chip',
        'aria-pressed': key === cat ? 'true' : 'false',
        text: label,
        onclick: () => {
          cat = key;
          chipEls.forEach((c, i) => c.setAttribute('aria-pressed', chips[i][0] === cat ? 'true' : 'false'));
          apply();
        },
      }));

    function apply() {
      const q = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const filtering = q.length > 0 || cat !== 'all';
      document.documentElement.classList.toggle('bm-filtering', filtering);
      for (const el of content.querySelectorAll(SEL.activity)) {
        const it = byEl.get(el);
        const hay = it ? `${it.name} ${it.section} ${BM.kindLabel(it.kind)}`.toLowerCase() : '';
        const show = !filtering || (it && (cat === 'all' || MODS[cat].includes(it.mod)) && q.every((t) => hay.includes(t)));
        el.classList.toggle('bm-hidden', !show);
      }
      // Hide sections (innermost first) that have no visible activities left.
      const sections = [...content.querySelectorAll(SEL.section)].reverse();
      for (const s of sections) {
        s.classList.toggle('bm-hidden', filtering && !s.querySelector(`${SEL.activity}:not(.bm-hidden)`));
      }
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !BM.isTyping(e) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        input.focus();
      }
    });

    return h('div', { id: 'bm-course-bar' },
      h('label', { class: 'bm-search' }, BM.icon('search'), input, h('kbd', { class: 'bm-kbd', text: '/' })),
      h('div', { class: 'bm-chips', role: 'group', 'aria-label': 'Filter by type' }, chipEls));
  }

  function dueStrip(courseId) {
    const strip = h('div', { id: 'bm-course-due', hidden: true });
    BM.swr('deadlines', 10 * 60e3, BM.api.deadlines, (data) => {
      const mine = (data || []).filter((d) => d.course?.id === courseId).slice(0, 4);
      strip.hidden = mine.length === 0;
      strip.replaceChildren(
        h('span', { class: 'bm-label', text: 'Due' }),
        ...mine.map((d) =>
          h('a', { class: `bm-due-pill ${BM.urgency(d.time)}`, href: d.url },
            h('span', { class: 'bm-due-name', text: d.name }),
            h('span', { class: 'bm-due-when', text: `${BM.fmtDay(d.time)} · ${BM.relTime(d.time)}` }))));
    });
    return strip;
  }

  function openItem(item, items, e) {
    const viewable = items.filter((i) => MODS.viewer.includes(i.mod) && !i.el.classList.contains('bm-hidden'));
    const i = viewable.indexOf(item);
    if (i >= 0) {
      e?.preventDefault();
      BM.viewer.open(viewable, i);
    } else {
      location.href = item.url;
    }
  }

  BM.course = {
    init() {
      const courseId = BM.page.courseId();
      const content = document.querySelector(SEL.courseContent);
      if (!courseId || !content) return BM.log('course content not found; leaving page as-is');

      const items = collect(content);
      BM.log(`indexed ${items.length} activities`);
      saveIndex(courseId, items);

      content.before(h('div', { id: 'bm-course-tools' }, filterBar(content, items), dueStrip(courseId)));

      // Side viewer: plain left-click on a file/page/folder opens it in the panel.
      // Ctrl/Cmd/middle-click still opens a normal new tab.
      const byLink = new Map(items.map((i) => [i.el.querySelector(SEL.activityLink), i]));
      content.addEventListener('click', (e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const a = e.target.closest('a');
        const item = a && byLink.get(a);
        if (item && MODS.viewer.includes(item.mod)) openItem(item, items, e);
      });

      // Deep link from Ctrl+K search on another page: #bm-open=<cmid>
      const m = location.hash.match(/bm-open=(\d+)/);
      if (m) {
        const item = items.find((i) => i.cmid === m[1]);
        if (item) openItem(item, items);
        history.replaceState(null, '', location.pathname + location.search);
      }

      BM.course.openCmid = (cmid) => {
        const item = items.find((i) => i.cmid === String(cmid));
        if (item) openItem(item, items);
        return !!item;
      };
    },
    openCmid: () => false,
  };
})();
