// Dashboard (/my/): replaces the block clutter with two things: what's due, and your courses.
(() => {
  const BM = globalThis.BM;
  const { h, SEL } = BM;

  const BUCKETS = ['Overdue', 'Today', 'Tomorrow', 'This week', 'Later'];

  function state(text) {
    return h('div', { class: 'bm-state', text });
  }

  function renderDue(el, data, { error } = {}) {
    if (error) return el.replaceChildren(state("Couldn't load deadlines. Moodle may be slow, so try refreshing."));
    if (!data.length) return el.replaceChildren(state('Nothing due. Enjoy it.'));
    const groups = new Map(BUCKETS.map((b) => [b, []]));
    for (const d of data) groups.get(BM.dayBucket(d.time)).push(d);
    el.replaceChildren(
      ...[...groups].filter(([, list]) => list.length).map(([bucket, list]) =>
        h('div', { class: 'bm-group' },
          h('div', { class: `bm-group-label ${bucket === 'Overdue' ? 'overdue' : ''}`, text: bucket }),
          ...list.map((d) =>
            h('a', { class: `bm-row bm-due ${BM.urgency(d.time)}`, href: d.url },
              h('span', { class: 'bm-row-main' },
                h('span', { class: 'bm-row-title', text: d.name }),
                h('span', { class: 'bm-row-sub', text: d.course?.short || d.course?.name || '' })),
              h('span', { class: 'bm-row-side' },
                h('span', { class: 'bm-when', text: ['Today', 'Tomorrow'].includes(bucket) ? BM.fmtTime(d.time) : BM.fmtDay(d.time) }),
                h('span', { class: 'bm-rel', text: BM.relTime(d.time) })))))));
  }

  function renderCourses(el, data, { error } = {}) {
    if (error) return el.replaceChildren(state("Couldn't load courses."));
    if (!data.length) return el.replaceChildren(state('No current courses.'));
    const sorted = [...data].sort((a, b) => (b.fav - a.fav) || a.name.localeCompare(b.name));
    el.replaceChildren(
      ...sorted.map((c) =>
        h('a', { class: 'bm-row', href: c.url },
          h('span', { class: 'bm-row-main' },
            h('span', { class: 'bm-row-title', text: c.name }),
            h('span', { class: 'bm-row-sub', text: c.short })),
          c.fav ? h('span', { class: 'bm-star', title: 'Starred', text: '★' }) : null)));
  }

  BM.home = {
    async init() {
      const main = document.querySelector(SEL.main);
      if (!main) return;

      const dueEl = h('div', { class: 'bm-list' }, state('Loading…'));
      const coursesEl = h('div', { class: 'bm-list' }, state('Loading…'));
      const toggle = h('button', { type: 'button', class: 'bm-link-btn' });

      const { showClassic } = await chrome.storage.sync.get({ showClassic: false }).catch(() => ({}));
      const setClassic = (show) => {
        document.documentElement.classList.toggle('bm-hide-classic', !show);
        toggle.textContent = show ? 'Hide classic dashboard' : 'Show classic dashboard';
        chrome.storage.sync.set({ showClassic: show }).catch(() => {});
      };
      toggle.addEventListener('click', () =>
        setClassic(document.documentElement.classList.contains('bm-hide-classic')));
      setClassic(!!showClassic);

      main.prepend(
        h('section', { id: 'bm-home' },
          h('div', { class: 'bm-home-col' },
            h('div', { class: 'bm-h' },
              h('h2', { text: 'Due soon' }),
              h('a', { class: 'bm-h-link', href: `${BM.wwwroot()}/calendar/view.php?view=upcoming`, text: 'Calendar' })),
            dueEl),
          h('div', { class: 'bm-home-col' },
            h('div', { class: 'bm-h' },
              h('h2', { text: 'Courses' }),
              h('a', { class: 'bm-h-link', href: `${BM.wwwroot()}/my/courses.php`, text: 'All' })),
            coursesEl),
          h('div', { class: 'bm-home-foot' }, toggle)));

      BM.swr('deadlines', 10 * 60e3, BM.api.deadlines, (d, s) => renderDue(dueEl, d, s));
      BM.swr('courses', 6 * 3600e3, BM.api.courses, (d, s) => renderCourses(coursesEl, d, s));
    },
  };
})();
