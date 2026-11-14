// Split-view file viewer: clicking slides/resources opens them in a resizable panel on the
// right instead of a new tab. j/k or ↑/↓ moves through files, Esc closes.
(() => {
  const BM = globalThis.BM;
  const { h } = BM;
  const html = document.documentElement;

  let root, body, titleEl, metaEl, newTabEl;
  let items = [];
  let idx = -1;

  const KIND_LABEL = {
    pdf: 'PDF', image: 'Image', text: 'Text', video: 'Video', audio: 'Audio',
    slides: 'PowerPoint', doc: 'Word', sheet: 'Spreadsheet', zip: 'Archive', file: 'File',
    page: 'Page', folder: 'Folder', book: 'Book',
  };
  BM.kindLabel = (k) => KIND_LABEL[k] || 'File';

  function iconBtn(icon, label, onclick) {
    return h('button', { class: 'bm-icon-btn', type: 'button', title: label, 'aria-label': label, onclick }, BM.icon(icon));
  }

  function build() {
    root = h('aside', { id: 'bm-viewer', 'aria-label': 'File viewer' },
      h('div', { class: 'bm-v-resize', title: 'Drag to resize', onpointerdown: startResize }),
      h('header', { class: 'bm-v-head' },
        h('div', { class: 'bm-v-heading' },
          (titleEl = h('div', { class: 'bm-v-title' })),
          (metaEl = h('div', { class: 'bm-v-meta' }))),
        iconBtn('up', 'Previous (k)', () => step(-1)),
        iconBtn('down', 'Next (j)', () => step(1)),
        (newTabEl = h('a', { class: 'bm-icon-btn', target: '_blank', rel: 'noopener', title: 'Open in new tab', 'aria-label': 'Open in new tab' }, BM.icon('external'))),
        iconBtn('x', 'Close (Esc)', close)),
      (body = h('div', { class: 'bm-v-body' })));
    document.body.append(root);
    chrome.storage.local.get({ viewerWidth: 50 }).then(({ viewerWidth }) => setWidth(viewerWidth)).catch(() => {});
  }

  function setWidth(vw) {
    html.style.setProperty('--bm-vw', `${Math.min(75, Math.max(30, vw))}vw`);
  }

  function startResize(e) {
    e.preventDefault();
    html.classList.add('bm-resizing');
    let last = 50;
    const move = (ev) => setWidth((last = ((window.innerWidth - ev.clientX) / window.innerWidth) * 100));
    const up = () => {
      html.classList.remove('bm-resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      chrome.storage.local.set({ viewerWidth: Math.round(last) }).catch(() => {});
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function render(item) {
    titleEl.textContent = item.name;
    metaEl.textContent = [BM.kindLabel(item.kind), item.section, `${idx + 1} of ${items.length}`].filter(Boolean).join(' · ');
    newTabEl.href = item.previewable ? item.previewUrl : item.url;
    body.replaceChildren(
      item.previewable
        ? h('iframe', { class: 'bm-v-frame', src: item.previewUrl, title: item.name })
        : h('div', { class: 'bm-v-empty' },
            BM.icon('file'),
            h('p', { text: `${BM.kindLabel(item.kind)} files can't be previewed in the browser.` }),
            h('a', { class: 'bm-btn', href: item.url, target: '_blank', rel: 'noopener', text: 'Open / download' })));
  }

  function open(list, i) {
    if (!list.length) return;
    if (!root) build();
    items = list;
    idx = Math.max(0, Math.min(i, list.length - 1));
    const item = items[idx];
    document.querySelectorAll('.bm-active').forEach((el) => el.classList.remove('bm-active'));
    item.el?.classList.add('bm-active');
    item.el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    html.classList.add('bm-viewer-open');
    render(item);
  }

  function step(d) {
    if (idx >= 0) open(items, Math.max(0, Math.min(items.length - 1, idx + d)));
  }

  function close() {
    html.classList.remove('bm-viewer-open');
    body?.replaceChildren(); // stops any playing media
    document.querySelectorAll('.bm-active').forEach((el) => el.classList.remove('bm-active'));
    idx = -1;
  }

  document.addEventListener('keydown', (e) => {
    if (idx < 0 || BM.isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.getElementById('bm-palette')?.open) return;
    const map = { Escape: close, j: () => step(1), ArrowDown: () => step(1), k: () => step(-1), ArrowUp: () => step(-1) };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  });

  BM.viewer = { open, close, isOpen: () => idx >= 0 };
})();
