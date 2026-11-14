// Split-view file viewer: a resizable panel on the right instead of a new tab per file.
// j/k or arrow keys step through files, Esc closes. Ctrl/⌘/Shift/middle-click still open a new tab.
var BM = globalThis.BM;

BM.viewer = {
  items: [],
  index: -1,
  el: null,
  onChange: null,

  build() {
    if (this.el) return;
    const h = BM.h;
    this.titleEl = h('div', { class: 'bm-v-title' });
    this.countEl = h('span', { class: 'bm-v-count' });
    this.newTabEl = h('a', { class: 'bm-btn', target: '_blank', rel: 'noopener', title: 'Open in new tab' }, 'Open ↗');
    this.bodyEl = h('div', { class: 'bm-v-body' });
    const handle = h('div', { class: 'bm-v-handle', title: 'Drag to resize' });
    this.el = h('aside', { class: 'bm-viewer', 'aria-label': 'File viewer' },
      handle,
      h('header', { class: 'bm-v-head' },
        this.titleEl,
        h('div', { class: 'bm-v-actions' },
          this.countEl,
          h('button', { class: 'bm-btn', title: 'Previous (k)', onclick: () => this.step(-1) }, '↑'),
          h('button', { class: 'bm-btn', title: 'Next (j)', onclick: () => this.step(1) }, '↓'),
          this.newTabEl,
          h('button', { class: 'bm-btn', title: 'Close (Esc)', onclick: () => this.close() }, '✕'))),
      this.bodyEl);
    document.body.append(this.el);

    // Width persists across pages (localStorage is fine for a per-browser preference).
    let w = 0;
    try { w = Number(localStorage.getItem('bm:viewerWidth')) || 0; } catch (_) {}
    this.setWidth(w || Math.round(window.innerWidth * 0.5));

    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      document.documentElement.classList.add('bm-resizing');
      const move = (ev) => this.setWidth(window.innerWidth - ev.clientX);
      const up = () => {
        handle.removeEventListener('pointermove', move);
        document.documentElement.classList.remove('bm-resizing');
        try { localStorage.setItem('bm:viewerWidth', String(this.width)); } catch (_) {}
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up, { once: true });
    });

    document.addEventListener('keydown', (e) => {
      if (!this.isOpen() || BM.isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') { this.close(); e.preventDefault(); }
      else if (e.key === 'j' || e.key === 'ArrowDown') { this.step(1); e.preventDefault(); }
      else if (e.key === 'k' || e.key === 'ArrowUp') { this.step(-1); e.preventDefault(); }
    });
  },

  setWidth(w) {
    this.width = Math.max(320, Math.min(window.innerWidth - 320, w));
    document.documentElement.style.setProperty('--bm-viewer-w', this.width + 'px');
  },

  isOpen() { return document.documentElement.classList.contains('bm-viewer-open'); },

  // items: viewable course items in display order; id: the one to show.
  open(items, id) {
    this.build();
    this.items = items;
    this.index = Math.max(0, items.findIndex((i) => i.id === String(id)));
    document.documentElement.classList.add('bm-viewer-open');
    this.show();
  },

  // Course data improved (e.g. file types arrived after a cached first paint). Swap in the new list
  // and only reload the panel if what we'd show for the current item changed.
  refresh(items) {
    const cur = this.items[this.index];
    if (!cur) return;
    const next = items.find((i) => i.id === cur.id);
    this.items = items;
    this.index = Math.max(0, items.indexOf(next));
    // Compare with what the panel is actually showing (items are mutated in place by merges).
    if (next && this.shownKey(next) !== this.shown) this.show();
    else { this.countEl.textContent = `${this.index + 1} / ${this.items.length}`; this.onChange?.(next); }
  },

  close() {
    document.documentElement.classList.remove('bm-viewer-open');
    if (this.bodyEl) this.bodyEl.replaceChildren();
    this.index = -1;
    this.onChange?.(null);
  },

  step(d) {
    if (!this.items.length) return;
    this.index = (this.index + d + this.items.length) % this.items.length;
    this.show();
  },

  shownKey(it) { return `${it.id}|${BM.courseData.viewMode(it)}|${it.type}`; },

  show() {
    const it = this.items[this.index];
    if (!it) return;
    const h = BM.h;
    this.shown = this.shownKey(it);
    this.titleEl.textContent = it.name;
    this.countEl.textContent = `${this.index + 1} / ${this.items.length}`;
    this.newTabEl.href = it.url || BM.courseData.frameUrl(it);
    const mode = BM.courseData.viewMode(it);
    if (mode === 'frame') {
      this.bodyEl.replaceChildren(h('iframe', { src: BM.courseData.frameUrl(it), title: it.name }));
    } else {
      // A resource with no type yet is still being looked up (refresh() swaps in the preview when it lands).
      const what = it.module === 'resource' && !it.type ? 'Checking the file type…'
        : it.badge ? `${it.badge} files can't be previewed here.` : "This file can't be previewed here.";
      this.bodyEl.replaceChildren(h('div', { class: 'bm-v-card' },
        h('p', { class: 'bm-v-card-name' }, it.name),
        h('p', { class: 'bm-muted' }, [what, it.size ? ` (${it.size})` : '']),
        h('a', { class: 'bm-btn bm-btn-primary', href: it.url, target: '_blank', rel: 'noopener' }, 'Open / download ↗')));
    }
    this.onChange?.(it);
  },
};
