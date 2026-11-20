// Pop! theme cursor ring (docs/SCHEDULE-TRACKER-STYLE.md section 9.5): follows the mouse exactly,
// grows over anything clickable and shrinks while pressed. Only for a fine pointer with motion allowed.
var BM = globalThis.BM;

BM.cursor = {
  el: null,
  CLICKABLE: 'a, button, input, select, textarea, label, summary, [role="button"], [role="option"]',

  allowed() {
    return document.documentElement.dataset.bmTheme === 'pop' &&
      matchMedia('(pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  },

  init() {
    this.sync();
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => this.sync());
  },

  // Create or remove the ring to match the current theme.
  sync() {
    if (!this.allowed()) { this.destroy(); return; }
    if (this.el) return;
    this.el = BM.h('div', { class: 'bm-cursor', 'aria-hidden': 'true' });
    document.body.append(this.el);
    this.onMove = (e) => {
      this.el.classList.add('is-on');
      this.el.style.transform = `translate(${e.clientX - 20}px, ${e.clientY - 20}px)`;
      this.el.classList.toggle('is-hot', !!e.target.closest?.(this.CLICKABLE));
    };
    this.onDown = () => this.el.classList.add('is-down');
    this.onUp = () => this.el.classList.remove('is-down');
    this.onLeave = () => this.el.classList.remove('is-on');
    document.addEventListener('pointermove', this.onMove, { passive: true });
    document.addEventListener('pointerdown', this.onDown, { passive: true });
    window.addEventListener('pointerup', this.onUp, { passive: true });
    document.documentElement.addEventListener('pointerleave', this.onLeave);
  },

  destroy() {
    if (!this.el) return;
    document.removeEventListener('pointermove', this.onMove);
    document.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    document.documentElement.removeEventListener('pointerleave', this.onLeave);
    this.el.remove();
    this.el = null;
  },
};
