// Shared helpers. Every content script file adds to the global `BM` namespace
// (content scripts share one isolated world, so this is not visible to Moodle's own JS).
(() => {
  const BM = (globalThis.BM = globalThis.BM || {});

  /** Tiny DOM builder. Never uses innerHTML for data, so course/file names can't inject markup. */
  BM.h = function h(tag, props, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.append(c instanceof Node ? c : String(c));
    }
    return el;
  };

  // Static, trusted icon markup (Lucide-style strokes).
  const ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  };
  BM.icon = (name) => {
    const span = document.createElement('span');
    span.className = 'bm-icon';
    span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
    return span;
  };

  /** Read a value from Moodle's inline `M.cfg = {...}` config script. */
  const cfgCache = {};
  BM.cfg = (key) => {
    if (key in cfgCache) return cfgCache[key];
    const re = new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`);
    for (const s of document.querySelectorAll('script:not([src])')) {
      const m = s.textContent.match(re);
      if (m) return (cfgCache[key] = JSON.parse(`"${m[1]}"`));
    }
    return (cfgCache[key] = null);
  };

  BM.sesskey = () => {
    const fromCfg = BM.cfg('sesskey');
    if (fromCfg) return fromCfg;
    const a = document.querySelector('a[href*="sesskey="]');
    const m = a && a.href.match(/sesskey=([^&]+)/);
    return m ? m[1] : null;
  };

  BM.wwwroot = () => (BM.cfg('wwwroot') || location.origin).replace(/\/$/, '');

  /** Logged-in user id. Moodle 4.x puts it on the notification/message popovers. */
  BM.uid = () => document.querySelector('[data-userid]')?.dataset.userid || null;

  BM.page = {
    id: () => document.body.id,
    has: (cls) => document.body.classList.contains(cls),
    courseId: () => (document.body.className.match(/\bcourse-(\d+)\b/) || [])[1] || null,
  };

  /** Decode HTML entities that Moodle leaves in formatted strings (DOMParser never runs scripts). */
  BM.decode = (s) => (s ? new DOMParser().parseFromString(s, 'text/html').body.textContent : '');

  BM.isTyping = (e) => {
    const t = e.target;
    return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  };

  BM.isMac = /Mac|iPhone|iPad/.test(navigator.platform);

  // ---- Dates ----
  const DAY = 86400e3;
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  BM.fmtDay = (ts) =>
    new Date(ts * 1000).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  BM.fmtTime = (ts) => new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  BM.relTime = (ts) => {
    const diff = ts * 1000 - Date.now();
    const abs = Math.abs(diff);
    const unit = abs < 3600e3 ? [60e3, 'm'] : abs < DAY ? [3600e3, 'h'] : [DAY, 'd'];
    const n = Math.max(1, Math.round(abs / unit[0])) + unit[1];
    return diff < 0 ? `${n} overdue` : `in ${n}`;
  };

  /** Bucket a timestamp into Overdue / Today / Tomorrow / This week / Later. */
  BM.dayBucket = (ts) => {
    const t = ts * 1000;
    if (t < Date.now()) return 'Overdue';
    const today = startOfDay(new Date());
    if (t < today + DAY) return 'Today';
    if (t < today + 2 * DAY) return 'Tomorrow';
    if (t < today + 7 * DAY) return 'This week';
    return 'Later';
  };

  BM.urgency = (ts) => {
    const diff = ts * 1000 - Date.now();
    if (diff < 0) return 'overdue';
    if (diff < 2 * DAY) return 'soon';
    return '';
  };

  BM.log = (...args) => console.debug('[BetterMoodle]', ...args);
})();
