// Pop! theme cursor: a ring centred exactly on the pointer (no lag), replacing the system pointer.
// The ring grows and fills over anything
// clickable and shrinks while pressed. Over text fields, and inside the viewer (an iframe, where the
// page can't see the mouse), it steps aside and the normal pointer shows.
// Only for a fine pointer (mouse/trackpad) with motion allowed; otherwise the system pointer is untouched.
var BM = globalThis.BM;

BM.cursor = {
  el: null,
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
    if (this.el) return;
    this.el = BM.h('div', { class: 'bm-cursor', 'aria-hidden': 'true' });
    document.body.append(this.el);
    this.on = {
      move: (e) => {
        const t = e.target instanceof Element ? e.target : null;
        this.show(!t?.closest(this.TEXT) && t?.tagName !== 'IFRAME');
        this.el.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
        this.el.classList.toggle('is-hot', !!t?.closest(this.CLICKABLE));
      },
      down: () => this.el.classList.add('is-down'),
      up: () => this.el.classList.remove('is-down'),
      out: (e) => { if (!e.relatedTarget) this.show(false); }, // left the window
    };
    document.addEventListener('pointermove', this.on.move, { passive: true });
    document.addEventListener('pointerdown', this.on.down, { passive: true });
    window.addEventListener('pointerup', this.on.up, { passive: true });
    document.addEventListener('mouseout', this.on.out, { passive: true });
  },

  destroy() {
    document.documentElement.classList.remove('bm-cursor-on');
    if (!this.el) return;
    document.removeEventListener('pointermove', this.on.move);
    document.removeEventListener('pointerdown', this.on.down);
    window.removeEventListener('pointerup', this.on.up);
    document.removeEventListener('mouseout', this.on.out);
    this.el.remove();
    this.el = null;
  },

  // The system pointer is only hidden while ours is actually on screen.
  show(on) {
    this.el.classList.toggle('is-on', on);
    document.documentElement.classList.toggle('bm-cursor-on', on);
  },
};
