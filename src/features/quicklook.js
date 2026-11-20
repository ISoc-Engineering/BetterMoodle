// Quick look: press Space on a file (hovered or focused) to see it full screen. Left/Right or Up/Down
// step through the files on the page, Space or Esc closes. Like Quick Look on a Mac.
// Files that can't be previewed in the browser show a card with Open / download instead.
var BM = globalThis.BM;

BM.quicklook = {
  el: null,
  items: [],
  index: -1,

  isOpen() { return !!this.el && !this.el.hidden; },

  build() {
    if (this.el) return;
    const h = BM.h;
    this.titleEl = h('div', { class: 'bm-ql-title', id: 'bm-ql-title' });
    this.countEl = h('span', { class: 'bm-ql-count' });
    this.openEl = h('a', { class: 'bm-btn', target: '_blank', rel: 'noopener' }, 'Open in new tab');
    this.bodyEl = h('div', { class: 'bm-ql-body' });
    this.el = h('div', { class: 'bm-ql bm-root', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'bm-ql-title', hidden: true },
      h('div', { class: 'bm-ql-box' },
        h('header', { class: 'bm-ql-head' },
          this.titleEl, h('div', { class: 'bm-spacer' }), this.countEl,
          h('button', { class: 'bm-btn', 'aria-label': 'Previous file', onclick: () => this.step(-1) }, '‹'),
          h('button', { class: 'bm-btn', 'aria-label': 'Next file', onclick: () => this.step(1) }, '›'),
          this.openEl,
          h('button', { class: 'bm-btn', 'aria-label': 'Close', onclick: () => this.close() }, '✕')),
        this.bodyEl));
    this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    document.body.append(this.el);
    document.addEventListener('keydown', (e) => {
      if (!this.isOpen()) return;
      if (e.key === 'Escape' || e.key === ' ') { e.preventDefault(); this.close(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); this.step(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); this.step(-1); }
    }, true);
  },

  open(items, id) {
    if (!items.length) return;
    this.build();
    this.items = items;
    this.index = Math.max(0, items.findIndex((i) => i.id === String(id)));
    this.returnFocus = document.activeElement;
    this.el.hidden = false;
    document.documentElement.classList.add('bm-ql-open');
    this.show();
  },

  close() {
    if (!this.el) return;
    this.el.hidden = true;
    this.bodyEl.replaceChildren();
    document.documentElement.classList.remove('bm-ql-open');
    this.returnFocus?.focus?.({ preventScroll: true });
  },

  step(d) {
    this.index = (this.index + d + this.items.length) % this.items.length;
    this.show();
  },

  show() {
    const it = this.items[this.index];
    const h = BM.h;
    this.titleEl.textContent = it.name;
    this.countEl.textContent = `${this.index + 1} / ${this.items.length}`;
    this.openEl.href = it.url || BM.courseData.frameUrl(it);
    if (BM.courseData.viewMode(it) === 'frame') {
      this.bodyEl.replaceChildren(h('iframe', { src: BM.courseData.frameUrl(it), title: it.name }));
    } else {
      this.bodyEl.replaceChildren(h('div', { class: 'bm-v-card' },
        h('p', { class: 'bm-v-card-name' }, it.name),
        h('p', { class: 'bm-muted' }, [it.badge ? `${it.badge} files can't be previewed here.` : "This file can't be previewed here.", it.size ? ` (${it.size})` : '']),
        h('a', { class: 'bm-btn bm-btn-primary', href: it.url, target: '_blank', rel: 'noopener' }, 'Open / download')));
    }
    BM.opened.mark(it.id);
    this.onChange?.(it);
  },
};
