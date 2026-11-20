// Pop! theme cursor. Replaces the system pointer with:
//   - a small dot that sits exactly on the pointer (so aiming stays precise)
//   - a ring that follows with a short, smooth lag, and stretches a little when you move fast
//   - a magnetic snap: over a button, chip or link the ring wraps around it, matching its shape
//   - a ripple on click
// Over text fields it steps aside so you get the normal text cursor. Inside the viewer (an iframe)
// the page can't see the mouse, so it hides and the system pointer shows there.
// Only for a fine pointer (mouse/trackpad) with motion allowed; otherwise the system pointer is untouched.
var BM = globalThis.BM;

BM.cursor = {
  ring: null,
  dot: null,
  SIZE: 26, // ring diameter at rest (px)
  CLICKABLE: 'a, button, select, label, summary, [role="button"], [role="option"], [role="tab"]',
  TEXT: 'input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="range"]), textarea, [contenteditable=""], [contenteditable="true"]',

  allowed() {
    return document.documentElement.dataset.bmTheme === 'pop' &&
      matchMedia('(pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  },

  init() {
    this.sync();
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => this.sync());
  },

  // Create or remove the cursor to match the current theme.
  sync() {
    if (!this.allowed()) { this.destroy(); return; }
    if (this.ring) return;
    const h = BM.h;
    this.ring = h('div', { class: 'bm-cursor', 'aria-hidden': 'true' });
    this.dot = h('div', { class: 'bm-cursor-dot', 'aria-hidden': 'true' });
    document.body.append(this.ring, this.dot);
    this.p = { x: -100, y: -100 };                             // pointer
    this.r = { x: -100, y: -100, w: this.SIZE, h: this.SIZE }; // ring box (top-left corner, size)
    this.snap = null;                                          // element the ring is wrapped around

    this.on = {
      move: (e) => {
        this.p.x = e.clientX; this.p.y = e.clientY;
        const t = e.target instanceof Element ? e.target : null;
        const overText = !!t?.closest(this.TEXT);
        const overFrame = t?.tagName === 'IFRAME';
        this.show(!overText && !overFrame);
        this.setSnap(!overText && t ? this.snapTarget(t) : null, t);
        this.dot.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
        this.kick();
      },
      down: () => this.ring.classList.add('is-down'),
      up: () => this.ring.classList.remove('is-down'),
      click: (e) => this.ripple(e.clientX, e.clientY),
      out: (e) => { if (!e.relatedTarget) this.show(false); }, // left the window
      scroll: () => { if (this.snap) this.kick(); },
    };
    document.addEventListener('pointermove', this.on.move, { passive: true });
    document.addEventListener('pointerdown', this.on.down, { passive: true });
    window.addEventListener('pointerup', this.on.up, { passive: true });
    document.addEventListener('click', this.on.click, { passive: true, capture: true });
    document.addEventListener('mouseout', this.on.out, { passive: true });
    window.addEventListener('scroll', this.on.scroll, { passive: true, capture: true });
  },

  destroy() {
    document.documentElement.classList.remove('bm-cursor-on');
    if (!this.ring) return;
    document.removeEventListener('pointermove', this.on.move);
    document.removeEventListener('pointerdown', this.on.down);
    window.removeEventListener('pointerup', this.on.up);
    document.removeEventListener('click', this.on.click, { capture: true });
    document.removeEventListener('mouseout', this.on.out);
    window.removeEventListener('scroll', this.on.scroll, { capture: true });
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ring.remove(); this.dot.remove();
    this.ring = this.dot = this.snap = null;
  },

  // The system pointer is only hidden while ours is actually on screen.
  show(on) {
    this.ring.classList.toggle('is-on', on);
    this.dot.classList.toggle('is-on', on);
    document.documentElement.classList.toggle('bm-cursor-on', on);
  },

  // Snap to small clickable things only; wrapping a whole card or a big panel looks wrong.
  snapTarget(t) {
    const el = t.closest(this.CLICKABLE);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width <= 320 && r.height <= 90 ? el : null;
  },

  // Big clickable things (cards, rows) don't snap; the ring just fills in to say "clickable".
  setSnap(el, t) {
    this.ring.classList.toggle('is-hot', !el && !!t?.closest(this.CLICKABLE));
    if (el === this.snap) return;
    this.snap = el;
    this.ring.classList.toggle('is-snap', !!el);
  },

  // Runs only while the ring is still catching up, then stops (no idle animation loop).
  kick() { if (!this.raf) this.raf = requestAnimationFrame(() => this.frame()); },

  frame() {
    this.raf = 0;
    if (!this.ring) return;
    let tx, ty, tw, th, radius = '50%';
    if (this.snap && this.snap.isConnected) {
      const b = this.snap.getBoundingClientRect();
      const pad = 5;
      tx = b.left - pad; ty = b.top - pad; tw = b.width + pad * 2; th = b.height + pad * 2;
      const er = parseFloat(getComputedStyle(this.snap).borderTopLeftRadius) || 0;
      radius = `${Math.min(er + pad, th / 2)}px`;
    } else {
      tw = th = this.SIZE; tx = this.p.x - tw / 2; ty = this.p.y - th / 2;
    }
    const k = this.snap ? 0.28 : 0.22; // how much of the gap the ring closes each frame
    const r = this.r;
    const dx = tx - r.x, dy = ty - r.y;
    r.x += dx * k; r.y += dy * k; r.w += (tw - r.w) * k; r.h += (th - r.h) * k;

    // Squash and stretch along the direction of travel, only while free (not snapped).
    const stretch = this.snap ? 1 : 1 + Math.min(Math.hypot(dx, dy) / 140, 0.35);
    const angle = Math.atan2(dy, dx);
    this.ring.style.width = `${r.w}px`;
    this.ring.style.height = `${r.h}px`;
    this.ring.style.borderRadius = radius;
    this.ring.style.transform = stretch > 1.01
      ? `translate3d(${r.x}px, ${r.y}px, 0) rotate(${angle}rad) scale(${stretch}, ${1 / stretch}) rotate(${-angle}rad)`
      : `translate3d(${r.x}px, ${r.y}px, 0)`;

    const settled = Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3 && Math.abs(tw - r.w) < 0.3 && Math.abs(th - r.h) < 0.3;
    if (!settled) this.kick();
  },

  ripple(x, y) {
    if (!this.ring?.classList.contains('is-on')) return;
    const el = BM.h('div', { class: 'bm-cursor-ripple', 'aria-hidden': 'true', style: `left:${x}px;top:${y}px` });
    document.body.append(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  },
};
