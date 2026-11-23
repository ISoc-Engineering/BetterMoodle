// Dashboard blocks you arrange by dragging, like Notion blocks or Jupyter cells. No layout menus:
//   - Drag a block by its ⋮⋮ handle or its title bar. While you drag:
//       above / below another block  -> a line: it stacks there
//       the left / right edge of one  -> a bar: it gets its own new column there (up to three)
//       the strip at the very top     -> it goes full width, above the columns
//     A column left empty closes up on its own.
//   - Drag the gap between two columns to make one wider (double-click the gap to even them out).
//   - Click the handle for the same moves as a menu (and Fold, Hide); Alt+arrows move it too.
//   - Click a block's name to fold it away (like Jupyter's collapser).
//   - Edit layout outlines every block and shows the drop areas; Customise has theme, course view and
//     which blocks show; Reset puts everything back (with Undo).
// The arrangement is saved per Moodle user (store.js). Nothing goes to Moodle.
var BM = globalThis.BM;

BM.layout = {
  MAX_COLS: 3,
  MIN_COL_PX: 220,
  GUTTER_PX: 28,
  DEFAULT: {
    top: [],
    cols: [['courses'], ['todo', 'forums', 'pinboard', 'feedback']],
    widths: [2.6, 1],
    hidden: [],
    folded: {},
    courses: 'grid',
  },
  // Layouts saved by the earlier version (picked from a list) become column widths.
  OLD_PRESETS: { 'main-side': [2.6, 1], 'side-main': [1, 2.6], halves: [1, 1], thirds: [1, 1, 1], stack: [1] },

  // blocks: [{ id, title, body, extra?, bare? }]. A bare block (a single link) has no name or fold.
  async init(host, blocks) {
    const h = BM.h;
    this.blocks = new Map(blocks.map((b) => [b.id, b]));
    this.sections = new Map(blocks.map((b) => [b.id, this.section(b)]));
    this.listeners = [];
    this.state = this.normalize((await BM.store.get('home-layout'))?.v || this.DEFAULT);
    this.topEl = h('div', { class: 'bm-top-row', dataset: { lane: 'top' } });
    this.grid = h('div', { class: 'bm-home-layout' });
    this.wrap = h('div', { class: 'bm-layout' }, this.topEl, this.grid);
    this.line = h('div', { class: 'bm-drop-line', 'aria-hidden': 'true' });
    this.dragEvents();
    host.append(this.wrap);
    this.render();
    for (const [id, sec] of this.sections) this.applyFold(id, sec, false);
  },

  onChange(fn) { this.listeners.push(fn); },
  save() {
    BM.store.set('home-layout', this.state);
    for (const fn of this.listeners) fn(this.state);
  },

  // Whatever is saved, end up with every block exactly once (full width, in a column, or hidden),
  // one to three columns with a width each, and no empty columns. Blocks added in a later version go
  // where the default puts them.
  normalize(raw) {
    const ids = [...this.blocks.keys()];
    const seen = new Set();
    const keep = (id) => ids.includes(id) && !seen.has(id) && seen.add(id);
    const list = (a) => (Array.isArray(a) ? a : []);
    const top = list(raw?.top).filter(keep);
    let cols = list(raw?.cols).map((c) => list(c).filter(keep));
    let widths = list(raw?.widths).map(Number);
    if (!widths.length && this.OLD_PRESETS[raw?.preset]) widths = this.OLD_PRESETS[raw.preset].slice();
    const hidden = list(raw?.hidden).filter(keep);
    if (cols.length > this.MAX_COLS) cols[this.MAX_COLS - 1].push(...cols.splice(this.MAX_COLS).flat());
    if (!cols.length) cols = [[]];
    for (const id of ids) {
      if (seen.has(id)) continue;
      const home = this.DEFAULT.cols.findIndex((c) => c.includes(id));
      cols[Math.min(Math.max(home, 0), cols.length - 1)].push(id);
    }
    widths = cols.map((_, i) => (widths[i] > 0 && Number.isFinite(widths[i]) ? widths[i] : 1));
    const state = { top, cols, widths, hidden, folded: { ...(raw?.folded || {}) }, courses: raw?.courses === 'slider' ? 'slider' : 'grid' };
    this.prune(state);
    return state;
  },

  // Close up empty columns (keeping at least one).
  prune(s = this.state) {
    for (let i = s.cols.length - 1; i >= 0 && s.cols.length > 1; i--) {
      if (!s.cols[i].length) { s.cols.splice(i, 1); s.widths.splice(i, 1); }
    }
  },

  // ---------------------------------------------------------------- drawing

  render() {
    const h = BM.h;
    const { top, cols, widths } = this.state;
    this.topEl.replaceChildren(...top.map((id) => this.sections.get(id)), h('div', { class: 'bm-top-drop' }, 'Drop here to go full width'));
    this.topEl.classList.toggle('has-blocks', top.length > 0);
    // Columns with a draggable gap between each pair.
    this.grid.style.gridTemplateColumns = widths.map((w) => `minmax(0, ${w}fr)`).join(` ${this.GUTTER_PX}px `);
    const kids = [];
    cols.forEach((ids, i) => {
      if (i) kids.push(this.gutter(i - 1));
      kids.push(h('div', { class: 'bm-col', dataset: { col: i } },
        ids.map((id) => this.sections.get(id)),
        h('div', { class: 'bm-col-empty', hidden: ids.length > 0 }, 'Drop a block here')));
    });
    this.grid.replaceChildren(...kids);
    this.grid.dataset.cols = String(cols.length);
    for (const id of this.state.hidden) this.sections.get(id).remove();
  },

  section(b) {
    const h = BM.h;
    const grip = h('button', {
      class: 'bm-grip', type: 'button', title: 'Drag to move. Click for options',
      'aria-label': `Move or hide ${b.title}`, 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    });
    grip.innerHTML = '<svg viewBox="0 0 10 16" aria-hidden="true"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></svg>';
    const body = h('div', { class: 'bm-block-body', id: `bm-body-${b.id}` }, b.body);
    let sec;
    if (b.bare) {
      sec = h('section', { class: 'bm-block is-bare', dataset: { block: b.id }, 'aria-label': b.title }, grip, body);
    } else {
      const fold = h('button', { class: 'bm-fold-head', type: 'button', 'aria-expanded': 'true', 'aria-controls': `bm-body-${b.id}` },
        h('h2', { class: 'bm-sec-label', id: `bm-h-${b.id}` }, b.title));
      fold.addEventListener('click', () => this.toggleFold(b.id));
      sec = h('section', { class: 'bm-block', dataset: { block: b.id }, 'aria-labelledby': `bm-h-${b.id}` },
        h('div', { class: 'bm-block-head' }, grip, fold, h('div', { class: 'bm-spacer' }), b.extra || null), body);
    }

    // The block is picked up by its handle or its title bar (not the buttons in it), so dragging a
    // course card or selecting text inside a block never moves the whole block.
    const head = sec.querySelector('.bm-block-head') || sec;
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.bm-block-tools, a, input, .bm-block-body')) return;
      sec.draggable = true;
    });
    addEventListener('pointerup', () => { if (!this.dragging) sec.draggable = false; });
    grip.addEventListener('click', (e) => { e.stopPropagation(); this.menu(b.id); });
    grip.addEventListener('keydown', (e) => {
      if (!e.altKey) return;
      const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
      if (!dir) return;
      e.preventDefault();
      this.step(b.id, dir);
      grip.focus();
    });
    sec.addEventListener('dragstart', (e) => {
      if (e.target !== sec) return;
      this.dragging = sec;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', `bm-block:${b.id}`);
      try { e.dataTransfer.setDragImage(sec, 24, 18); } catch (_) {}
      this.closeMenus();
      // Wait a frame so the drag picture is taken before the block fades.
      requestAnimationFrame(() => { if (this.dragging === sec) { sec.classList.add('is-dragging'); this.wrap.classList.add('is-arranging'); } });
    });
    sec.addEventListener('dragend', (e) => {
      if (e.target !== sec) return;
      sec.draggable = false;
      sec.classList.remove('is-dragging');
      this.wrap.classList.remove('is-arranging');
      this.clearMarks();
      this.dragging = null;
      this.dropAt = null;
    });
    return sec;
  },

  // ---------------------------------------------------------------- dragging

  clearMarks() {
    this.line.remove();
    for (const s of this.wrap.querySelectorAll('.is-drop-left, .is-drop-right')) s.classList.remove('is-drop-left', 'is-drop-right');
    this.topEl.classList.remove('is-target');
  },

  // Where would the block land if dropped here? Shows a line (stack) or a side bar (new column).
  dragEvents() {
    this.wrap.addEventListener('dragover', (e) => {
      if (!this.dragging) return;
      const t = e.target.closest ? e.target : e.target.parentElement;
      const lane = t?.closest('.bm-top-row, .bm-col');
      if (!lane) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const id = this.dragging.dataset.block;
      const blk = t.closest('.bm-block');
      this.clearMarks();

      // Beside a block in a column: a new column on that side.
      if (blk && blk !== this.dragging && lane.matches('.bm-col')) {
        const r = blk.getBoundingClientRect();
        const edge = Math.min(90, r.width * 0.22);
        const side = e.clientX < r.left + edge ? 'left' : e.clientX > r.right - edge ? 'right' : '';
        if (side) {
          blk.classList.add(side === 'left' ? 'is-drop-left' : 'is-drop-right');
          this.dropAt = { side, ref: blk.dataset.block };
          return;
        }
      }
      // Otherwise: stack above whichever block's middle the pointer is above.
      const before = [...lane.querySelectorAll(':scope > .bm-block')]
        .filter((s) => s !== this.dragging)
        .find((s) => { const r = s.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
      const end = lane.querySelector(':scope > .bm-col-empty, :scope > .bm-top-drop');
      (before || end).before(this.line);
      if (lane === this.topEl) this.topEl.classList.add('is-target');
      this.dropAt = { lane: lane === this.topEl ? 'top' : Number(lane.dataset.col), before: before ? before.dataset.block : null };
      if (this.dropAt.before === id) this.dropAt.before = null;
    });
    this.wrap.addEventListener('drop', (e) => {
      if (!this.dragging || !this.dropAt) return;
      e.preventDefault();
      const id = this.dragging.dataset.block;
      const at = this.dropAt;
      this.clearMarks();
      if (at.side) this.toNewColumn(id, at.ref, at.side);
      else this.move(id, at);
    });
  },

  // ---------------------------------------------------------------- moving

  // { lane: 'top' | column index, idx } or null if hidden.
  where(id) {
    const t = this.state.top.indexOf(id);
    if (t >= 0) return { lane: 'top', idx: t };
    for (let col = 0; col < this.state.cols.length; col++) {
      const idx = this.state.cols[col].indexOf(id);
      if (idx >= 0) return { lane: col, idx };
    }
    return null;
  },

  laneList(lane) { return lane === 'top' ? this.state.top : this.state.cols[lane]; },

  take(id) {
    const s = this.state;
    for (const list of [s.top, ...s.cols]) { const i = list.indexOf(id); if (i >= 0) list.splice(i, 1); }
  },

  // Change the layout with a smooth slide, then save and say what happened.
  change(fn, msg) {
    this.flip(() => { fn(); this.prune(); this.render(); });
    this.save();
    if (msg) BM.live?.(msg);
  },

  // Stack: into a lane (top or a column), before another block or at the end.
  move(id, { lane, before }) {
    this.change(() => {
      // Remember the target column by one of its blocks: taking this one out may close its column.
      const anchor = lane === 'top' ? null : this.state.cols[lane]?.find((x) => x !== id);
      this.take(id);
      let list = lane === 'top' ? this.state.top : (anchor ? this.state.cols.find((c) => c.includes(anchor)) : this.state.cols[lane]);
      if (!list) { list = []; this.state.cols.push(list); this.state.widths.push(1); }
      const i = before ? list.indexOf(before) : -1;
      list.splice(i < 0 ? list.length : i, 0, id);
    }, `${this.blocks.get(id).title} moved`);
  },

  // A new column beside `ref`'s column (or, at three columns, into the neighbouring one).
  toNewColumn(id, ref, side) {
    if (id === ref) return;
    this.change(() => {
      this.take(id);
      const s = this.state;
      const c = s.cols.findIndex((list) => list.includes(ref));
      if (c < 0) return;
      const at = side === 'left' ? c : c + 1;
      if (s.cols.length < this.MAX_COLS) {
        // The new column takes an even share; the others keep their proportions.
        const share = s.widths.reduce((a, b) => a + b, 0) / s.cols.length;
        s.cols.splice(at, 0, [id]);
        s.widths.splice(at, 0, share);
        return;
      }
      const next = side === 'left' ? c - 1 : c + 1;
      if (s.cols[next]) {
        const row = s.cols[c].indexOf(ref);
        s.cols[next].splice(Math.min(row, s.cols[next].length), 0, id);
      } else {
        const row = s.cols[c].indexOf(ref);
        s.cols[c].splice(side === 'left' ? row : row + 1, 0, id);
      }
    }, `${this.blocks.get(id).title} moved to ${side === 'left' ? 'the left' : 'the right'}`);
  },

  // One step from the menu or Alt+arrows. Right from the last column opens a new one; up from the top
  // of a column goes full width; down from full width goes back into the first column.
  step(id, dir) {
    const at = this.where(id);
    if (!at) return;
    const s = this.state;
    const list = this.laneList(at.lane);
    if (dir === 'up') {
      if (at.idx > 0) this.move(id, { lane: at.lane, before: list[at.idx - 1] });
      else if (at.lane !== 'top') this.move(id, { lane: 'top', before: null });
      return;
    }
    if (dir === 'down') {
      if (at.idx < list.length - 1) this.move(id, { lane: at.lane, before: list[at.idx + 2] || null });
      else if (at.lane === 'top') this.move(id, { lane: 0, before: s.cols[0][0] || null });
      return;
    }
    if (at.lane === 'top') return;
    if (dir === 'left' && at.lane > 0) this.move(id, { lane: at.lane - 1, before: s.cols[at.lane - 1][at.idx] || null });
    else if (dir === 'left' && list.length > 1 && s.cols.length < this.MAX_COLS) this.toNewColumn(id, list.find((x) => x !== id), 'left');
    else if (dir === 'right' && at.lane < s.cols.length - 1) this.move(id, { lane: at.lane + 1, before: s.cols[at.lane + 1][at.idx] || null });
    else if (dir === 'right' && list.length > 1 && s.cols.length < this.MAX_COLS) this.toNewColumn(id, list.find((x) => x !== id), 'right');
  },

  hide(id) {
    const before = structuredClone(this.state);
    this.change(() => {
      this.take(id);
      if (!this.state.hidden.includes(id)) this.state.hidden.push(id);
    });
    BM.toast(`Hid ${this.blocks.get(id).title}`, 'Undo', () => this.restore(before));
  },

  show(id) {
    if (!this.state.hidden.includes(id)) return;
    this.change(() => {
      this.state.hidden = this.state.hidden.filter((x) => x !== id);
      const home = this.DEFAULT.cols.findIndex((c) => c.includes(id));
      this.state.cols[Math.min(Math.max(home, 0), this.state.cols.length - 1)].push(id);
    });
  },

  setCourses(view) {
    this.state.courses = view === 'slider' ? 'slider' : 'grid';
    this.save();
  },

  restore(state) {
    this.flip(() => { this.state = this.normalize(state); this.render(); });
    for (const [id, sec] of this.sections) this.applyFold(id, sec, false);
    this.save();
  },

  reset() {
    const before = structuredClone(this.state);
    this.restore(this.DEFAULT);
    BM.toast('Dashboard layout reset', 'Undo', () => this.restore(before));
  },

  // ---------------------------------------------------------------- column widths

  // The gap between two columns: drag it sideways, or focus it and use the arrow keys.
  gutter(i) {
    const g = BM.h('div', {
      class: 'bm-gutter', role: 'separator', tabindex: '0', 'aria-orientation': 'vertical',
      'aria-label': 'Drag to resize the columns. Double-click to make them even', title: 'Drag to resize. Double-click to even out',
      dataset: { i },
    });
    let startX = 0, a = 0, b = 0, wa = 0, wb = 0;
    const measure = () => {
      const cols = this.grid.querySelectorAll(':scope > .bm-col');
      a = cols[i].getBoundingClientRect().width;
      b = cols[i + 1].getBoundingClientRect().width;
      [wa, wb] = [this.state.widths[i], this.state.widths[i + 1]];
    };
    const apply = (dx) => {
      const na = Math.min(Math.max(a + dx, this.MIN_COL_PX), a + b - this.MIN_COL_PX);
      this.state.widths[i] = +((wa + wb) * na / (a + b)).toFixed(3);
      this.state.widths[i + 1] = +((wa + wb) - this.state.widths[i]).toFixed(3);
      this.grid.style.gridTemplateColumns = this.state.widths.map((w) => `minmax(0, ${w}fr)`).join(` ${this.GUTTER_PX}px `);
    };
    g.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      measure();
      startX = e.clientX;
      try { g.setPointerCapture(e.pointerId); } catch (_) { /* no live pointer (e.g. a pen lifted): moves still reach the gap */ }
      g.classList.add('is-active');
      document.documentElement.classList.add('bm-resizing');
      const moveFn = (ev) => apply(ev.clientX - startX);
      const up = () => {
        g.removeEventListener('pointermove', moveFn);
        g.classList.remove('is-active');
        document.documentElement.classList.remove('bm-resizing');
        this.save();
      };
      g.addEventListener('pointermove', moveFn);
      g.addEventListener('pointerup', up, { once: true });
      g.addEventListener('pointercancel', up, { once: true });
    });
    g.addEventListener('dblclick', () => {
      const even = (this.state.widths[i] + this.state.widths[i + 1]) / 2;
      this.state.widths[i] = this.state.widths[i + 1] = even;
      this.render();
      this.save();
    });
    g.addEventListener('keydown', (e) => {
      const dx = { ArrowLeft: -32, ArrowRight: 32 }[e.key];
      if (!dx) return;
      e.preventDefault();
      measure();
      apply(dx);
      this.save();
    });
    return g;
  },

  // ---------------------------------------------------------------- folding

  toggleFold(id) {
    this.state.folded[id] = !this.state.folded[id];
    if (!this.state.folded[id]) delete this.state.folded[id];
    this.applyFold(id, this.sections.get(id), true);
    this.save();
  },

  applyFold(id, sec, animate) {
    const head = sec.querySelector('.bm-fold-head');
    if (!head) return;
    const open = !this.state.folded[id];
    const body = sec.querySelector('.bm-block-body');
    head.setAttribute('aria-expanded', String(open));
    sec.classList.toggle('is-folded', !open);
    if (!animate) { body.hidden = !open; return; }
    if (open) { body.hidden = false; BM.slide(body, true); } else BM.slide(body, false, () => { body.hidden = !!this.state.folded[id]; });
  },

  // Smooth moves: remember where every block was, change the layout, then slide each from its old
  // place to its new one.
  flip(change) {
    const els = [...this.sections.values()].filter((s) => s.isConnected);
    const first = new Map(els.map((s) => [s, s.getBoundingClientRect()]));
    change();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const [s, a] of first) {
      if (!s.isConnected || !s.animate) continue;
      const b = s.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      s.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    }
  },

  // ---------------------------------------------------------------- the handle's menu

  closeMenus() {
    document.querySelectorAll('.bm-menu').forEach((m) => m.remove());
    document.querySelectorAll('.bm-grip[aria-expanded="true"], .bm-custom-btn[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    document.removeEventListener('pointerdown', this.outside, true);
    document.removeEventListener('keydown', this.escape, true);
  },

  // A small popup menu next to `anchor`. Escape or a click elsewhere closes it; arrow keys move.
  popup(anchor, menu, focusFirst = true) {
    this.closeMenus();
    anchor.setAttribute('aria-expanded', 'true');
    anchor.after(menu);
    this.outside = (e) => { if (!menu.contains(e.target) && !anchor.contains(e.target)) this.closeMenus(); };
    this.escape = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); this.closeMenus(); anchor.focus(); return; }
      if (!menu.contains(document.activeElement) || !/^Arrow(Up|Down)$/.test(e.key)) return;
      const items = [...menu.querySelectorAll('[role="menuitem"]')];
      if (!items.length) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    };
    document.addEventListener('pointerdown', this.outside, true);
    document.addEventListener('keydown', this.escape, true);
    if (focusFirst) menu.querySelector('button')?.focus();
  },

  menu(id) {
    const h = BM.h;
    const sec = this.sections.get(id);
    const grip = sec.querySelector('.bm-grip');
    if (grip.getAttribute('aria-expanded') === 'true') { this.closeMenus(); return; }
    const at = this.where(id);
    const s = this.state;
    const list = this.laneList(at.lane);
    const inTop = at.lane === 'top';
    const roomForColumn = s.cols.length < this.MAX_COLS && list.length > 1;
    const item = (label, fn, key) => h('button', { class: 'bm-menu-item', type: 'button', role: 'menuitem', onclick: () => { this.closeMenus(); fn(); grip.focus(); } },
      h('span', {}, label), key ? h('kbd', {}, key) : null);
    const folded = !!s.folded[id];
    const items = [
      at.idx > 0 && item('Move up', () => this.step(id, 'up'), 'Alt ↑'),
      at.idx < list.length - 1 && item('Move down', () => this.step(id, 'down'), 'Alt ↓'),
      !inTop && (at.lane > 0 || roomForColumn) && item(at.lane > 0 ? 'Move left' : 'New column on the left', () => this.step(id, 'left'), 'Alt ←'),
      !inTop && (at.lane < s.cols.length - 1 || roomForColumn) && item(at.lane < s.cols.length - 1 ? 'Move right' : 'New column on the right', () => this.step(id, 'right'), 'Alt →'),
      inTop ? item('Back into the columns', () => this.move(id, { lane: 0, before: s.cols[0][0] || null }))
        : item('Full width', () => this.move(id, { lane: 'top', before: null })),
      !this.blocks.get(id).bare && item(folded ? 'Unfold' : 'Fold', () => this.toggleFold(id)),
      h('hr', { class: 'bm-menu-sep' }),
      item('Hide block', () => this.hide(id)),
    ];
    this.popup(grip, h('div', { class: 'bm-menu', role: 'menu', 'aria-label': this.blocks.get(id).title }, items));
  },

  // ---------------------------------------------------------------- Edit layout and Customise

  // Edit layout: every block gets an outline, the drop areas show (including full width), and the
  // gaps between columns show their resize grips. Done (or Escape) leaves it.
  editButton() {
    const btn = BM.h('button', { class: 'bm-custom-btn bm-edit-btn', type: 'button', 'aria-pressed': 'false' }, 'Edit layout');
    const set = (on) => {
      this.wrap.classList.toggle('is-editing', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? 'Done' : 'Edit layout';
    };
    btn.addEventListener('click', () => set(!this.wrap.classList.contains('is-editing')));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.wrap?.classList.contains('is-editing') && !document.querySelector('.bm-menu')) set(false); });
    return btn;
  },

  THEMES: {
    minimal: { label: 'Minimal', sw: ['#ffffff', '#1b1b1a', '#2a5bd7'] },
    soft: { label: 'Soft', sw: ['#f4f7fb', '#203244', '#315f85'] },
    sage: { label: 'Sage', sw: ['#f1f3ee', '#1f2a22', '#2f6b4a'] },
    pop: { label: 'Pop!', sw: ['#fff6e0', '#111111', '#ff5c8a'] },
    night: { label: 'Night', sw: ['#16191e', '#e4e7eb', '#8ab4ff'] },
  },

  customiseButton() {
    const btn = BM.h('button', { class: 'bm-custom-btn bm-customise', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, 'Customise');
    btn.addEventListener('click', () => {
      if (btn.getAttribute('aria-expanded') === 'true') { this.closeMenus(); return; }
      this.popup(btn, this.customisePanel(), false);
      document.querySelector('.bm-custom [aria-pressed="true"]')?.focus();
    });
    return btn;
  },

  customisePanel() {
    const panel = BM.h('div', { class: 'bm-menu bm-custom', role: 'dialog', 'aria-label': 'Customise dashboard' });
    const redraw = () => panel.replaceChildren(...this.customiseParts(redraw));
    redraw();
    return panel;
  },

  customiseParts(redraw) {
    const h = BM.h;
    const s = this.state;
    const opt = (pressed, label, onclick, ...pic) => h('button', { class: 'bm-opt', type: 'button', 'aria-pressed': String(pressed), onclick: () => { onclick(); redraw(); } }, ...pic, h('span', {}, label));
    const theme = document.documentElement.dataset.bmTheme;
    return [
      h('h3', { class: 'bm-custom-h' }, 'Theme'),
      h('div', { class: 'bm-opts bm-opts-theme' }, Object.entries(this.THEMES).map(([key, t]) =>
        opt(theme === key, t.label, () => BM.setTheme(key),
          h('span', { class: 'bm-theme-sw', 'aria-hidden': 'true' }, t.sw.map((c) => h('i', { style: `background:${c}` })))))),
      h('h3', { class: 'bm-custom-h' }, 'Courses'),
      h('div', { class: 'bm-opts bm-opts-2' },
        opt(s.courses === 'grid', 'Grid', () => this.setCourses('grid')),
        opt(s.courses === 'slider', 'Slider', () => this.setCourses('slider'))),
      h('h3', { class: 'bm-custom-h' }, 'Blocks'),
      h('div', { class: 'bm-custom-blocks' }, [...this.blocks.values()].map((b) => {
        const box = h('input', { type: 'checkbox', checked: !s.hidden.includes(b.id) });
        box.addEventListener('change', () => { if (box.checked) this.show(b.id); else this.hide(b.id); redraw(); });
        return h('label', { class: 'bm-custom-check' }, box, h('span', {}, b.title));
      })),
      h('div', { class: 'bm-custom-foot' }, h('button', { class: 'bm-link-btn', type: 'button', onclick: () => { this.reset(); redraw(); } }, 'Reset layout')),
    ];
  },
};

// Pick a theme from the page. The popup's setting and every open Moodle tab follow (main.js).
BM.setTheme = async (name) => {
  BM.applyTheme(name);
  try { await chrome.storage.local.set({ theme: name }); } catch (_) {}
};

// Tell screen readers what just changed (block moved, etc.).
BM.live = (msg) => {
  let el = document.getElementById('bm-live');
  if (!el) { el = BM.h('div', { id: 'bm-live', class: 'bm-sr', 'aria-live': 'polite' }); document.body.append(el); }
  el.textContent = msg;
};
