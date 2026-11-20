// Shared helpers. Every content-script file hangs off the BM namespace (one isolated world).
var BM = (globalThis.BM = globalThis.BM || {});

// DOM builder. Data always goes in as text, never as HTML.
BM.h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
};

// Moodle's APIs return some strings with HTML entities (&amp;). Decode to plain text safely.
BM.text = (s) => {
  if (!s || !/[&<]/.test(s)) return s || '';
  return new DOMParser().parseFromString(String(s), 'text/html').body.textContent || '';
};

// Content scripts can't see window.M, so read M.cfg out of the inline script Moodle prints.
BM.cfg = (() => {
  let cache;
  return () => {
    if (cache) return cache;
    let src = '';
    for (const s of document.scripts) {
      if (!s.src && s.textContent.includes('M.cfg')) { src = s.textContent; break; }
    }
    const m = (re) => (src.match(re) || [])[1];
    let sesskey = m(/"sesskey":"([^"]+)"/);
    if (!sesskey) {
      const a = document.querySelector('a[href*="logout.php?sesskey="]');
      sesskey = a && new URL(a.href).searchParams.get('sesskey');
    }
    cache = {
      sesskey,
      userId: Number(m(/"userId":(\d+)/)) || 0,
      courseId: Number(m(/"courseId":(\d+)/)) || 0,
    };
    return cache;
  };
})();

// Where our views go: Moodle's main content box. UCL pages don't all have #page-content (the
// dashboard doesn't), so fall back through the other wrappers Moodle uses.
BM.pageAnchor = () => document.querySelector('#page-content') || document.querySelector('#region-main')
  || document.querySelector('[role="main"]') || document.querySelector('#topofscroll > .row') || document.querySelector('#topofscroll');

BM.courseIdFromBody = () => {
  const c = [...document.body.classList].find((x) => /^course-\d+$/.test(x));
  return c ? Number(c.slice(7)) : 0;
};

// ---- dates ----
BM.now = () => Math.floor(Date.now() / 1000);
BM.startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

BM.countdown = (ts) => {
  const diff = ts - BM.now();
  const a = Math.abs(diff);
  let s;
  if (a < 3600) s = Math.max(1, Math.round(a / 60)) + 'm';
  else if (a < 86400) s = Math.round(a / 3600) + 'h';
  else s = Math.round(a / 86400) + 'd';
  return diff < 0 ? s + ' overdue' : 'in ' + s;
};

BM.ago = (ts) => {
  const a = Math.max(0, BM.now() - ts);
  if (a < 3600) return Math.max(1, Math.round(a / 60)) + 'm ago';
  if (a < 86400) return Math.round(a / 3600) + 'h ago';
  if (a < 30 * 86400) return Math.round(a / 86400) + 'd ago';
  return new Date(ts * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

// A ticking countdown: "2d 04:13:09", or "04:13:09" under a day. Seconds in, never negative.
BM.clock = (secs) => {
  const t = Math.max(0, Math.floor(secs));
  const d = Math.floor(t / 86400);
  const hms = [Math.floor(t / 3600) % 24, Math.floor(t / 60) % 60, t % 60].map((n) => String(n).padStart(2, '0')).join(':');
  return d ? `${d}d ${hms}` : hms;
};

BM.fmtTime = (ts) =>
  new Date(ts * 1000).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

BM.bucket = (ts) => {
  const now = BM.now();
  if (ts < now) return 'Overdue';
  const day0 = BM.startOfDay().getTime() / 1000;
  const days = Math.floor((ts - day0) / 86400);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return 'This week';
  return 'Later';
};
BM.BUCKETS = ['Overdue', 'Today', 'Tomorrow', 'This week', 'Later'];

// Run async jobs with limited concurrency (be gentle with UCL's servers).
BM.pool = async (items, limit, fn) => {
  const out = new Array(items.length);
  let i = 0;
  const worker = async () => { while (i < items.length) { const j = i++; try { out[j] = await fn(items[j], j); } catch (e) { out[j] = undefined; console.warn('[BetterMoodle]', e); } } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
};

// ---- themes ----
// Theme names match src/styles/themes/<name>.css ('minimal' has no file: it's the plain tokens.css). 'pop' is the default.
BM.THEMES = ['minimal', 'soft', 'pop'];
BM.applyTheme = (name) => {
  const t = BM.THEMES.includes(name) ? name : 'pop';
  document.documentElement.dataset.bmTheme = t;
  try { localStorage.setItem('bm:theme', t); } catch (_) {} // read by early.js on the next page, before paint
  return t;
};

// Per-item colours (Schedule Tracker palette). Themes that colour rows read the inline --c; others ignore it.
BM.PALETTE = ['#FF5C8A', '#FFD23F', '#3EC1D3', '#7CFF6B', '#FF9F1C', '#B28DFF'];
BM.colorFor = (i) => BM.PALETTE[Math.abs(Number(i) || 0) % BM.PALETTE.length];

// Staggered entrance on first render. CSS decides whether .bm-enter animates (only the Pop! theme does).
BM.enter = (els) => {
  [...els].forEach((el, i) => {
    el.classList.add('bm-enter');
    el.style.animationDelay = `${Math.min(i, 12) * 70}ms`;
    el.addEventListener('animationend', () => { el.classList.remove('bm-enter'); el.style.animationDelay = ''; }, { once: true });
  });
};

// Reveal on scroll: each element fades up as it comes into view (with a short stagger for ones that
// arrive together), then the helper classes are removed so hover transitions aren't delayed.
// CSS decides whether .bm-reveal animates (only Pop! does); in other themes it's a no-op.
BM.reveal = (els) => {
  if (typeof IntersectionObserver !== 'function') return;
  const io = new IntersectionObserver((entries) => {
    let i = 0;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      io.unobserve(el);
      el.style.setProperty('--d', `${Math.min(i++, 6) * 80}ms`);
      el.classList.add('is-in');
      setTimeout(() => { el.classList.remove('bm-reveal', 'is-in'); el.style.removeProperty('--d'); }, 1400);
    }
  }, { rootMargin: '0px 0px -6% 0px' });
  for (const el of els) { el.classList.add('bm-reveal'); io.observe(el); }
};

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Smoothly open or close a block by animating its height. done() runs at the end (or straight away
// with reduced motion), so callers can add/remove their "collapsed" class there or before.
BM.slide = (el, open, done) => {
  if (!el || reduceMotion() || !el.animate) { done?.(); return; }
  el.getAnimations?.().forEach((a) => a.cancel());
  const full = `${el.scrollHeight}px`;
  const frames = open ? [{ height: '0px', opacity: 0 }, { height: full, opacity: 1 }] : [{ height: full, opacity: 1 }, { height: '0px', opacity: 0 }];
  el.style.overflow = 'hidden';
  const a = el.animate(frames, { duration: open ? 320 : 240, easing: 'cubic-bezier(.2, .8, .2, 1)' });
  a.onfinish = a.oncancel = () => { el.style.overflow = ''; done?.(); };
};

// A small burst of confetti squares from an element's centre (CSS shows it only in Pop!).
BM.burst = (from) => {
  if (reduceMotion()) return;
  const b = from.getBoundingClientRect();
  const wrap = BM.h('div', { class: 'bm-burst', 'aria-hidden': 'true', style: `left:${b.left + b.width / 2}px;top:${b.top + b.height / 2}px` });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.random() * 0.5;
    const d = 26 + Math.random() * 22;
    wrap.append(BM.h('i', { style: `--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px;--r:${Math.round(Math.random() * 240 - 120)}deg;background:${BM.colorFor(i)}` }));
  }
  document.body.append(wrap);
  setTimeout(() => wrap.remove(), 800);
};

// One toast at a time, bottom centre, with an optional action button (e.g. Undo). Gone after 5s.
BM.toast = (message, actionLabel, onAction) => {
  document.querySelector('.bm-toast')?.remove();
  const h = BM.h;
  const t = h('div', { class: 'bm-toast bm-root', role: 'status' }, h('span', {}, message),
    actionLabel ? h('button', { class: 'bm-toast-btn', onclick: () => { t.remove(); onAction(); } }, actionLabel) : null);
  document.body.append(t);
  setTimeout(() => t.remove(), 5000);
};

BM.isTyping = (e) => {
  const t = e.target;
  return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
};
