// Things that are yours: course colours, pins, which files you've opened, and what's new since you
// last opened a course. All kept in chrome.storage (per Moodle user, see store.js); nothing goes to Moodle.
var BM = globalThis.BM;

// Pages Chrome loads ahead of time (see app.js) run our scripts before you look at them.
// Anything that means "you were here" waits until the page is actually shown.
BM.whenShown = (fn) => {
  if (document.prerendering) document.addEventListener('prerenderingchange', () => fn(), { once: true });
  else fn();
};

// A small map in storage with queued writes (so quick changes can't save out of order).
const storedMap = (key) => ({
  queue: Promise.resolve(),
  async all() { return (await BM.store.get(key))?.v || {}; },
  update(fn) {
    this.queue = this.queue.then(async () => { const v = await this.all(); fn(v); await BM.store.set(key, v); });
    return this.queue;
  },
});

// ---- Course colours: your pick, or a steady default from the course id (not its position) ----
BM.colors = Object.assign(storedMap('colors'), {
  cache: {},
  async load() { this.cache = await this.all(); return this.cache; },
  set(courseId, color) { this.cache[courseId] = color; return this.update((v) => { if (color) v[courseId] = color; else delete v[courseId]; }); },
});
BM.courseColor = (courseId) => BM.colors.cache[courseId] || BM.PALETTE[Math.abs(Number(courseId) || 0) % BM.PALETTE.length];

// ---- Pins: the dashboard's Pinboard (files, weeks, forum posts, deadlines, courses, links, notes) ----
// Order: anything pinned since you last rearranged comes first (newest first), then your dragged order.
BM.pins = Object.assign(storedMap('pins'), {
  key: (p) => `${p.kind}:${p.id}`,
  async list() {
    const rank = (p) => (p.pos == null ? -1e15 - p.at : p.pos);
    return Object.values(await this.all()).sort((a, b) => rank(a) - rank(b));
  },
  async has(p) { return !!(await this.all())[this.key(p)]; },
  toggle(p, on) { return this.update((v) => { if (on) { const { pos, ...rest } = p; v[this.key(p)] = { ...rest, at: Date.now() }; } else delete v[this.key(p)]; }); },
  // Change a pin in place (a note's text or colour), keeping its spot.
  save(p) { return this.update((v) => { const k = this.key(p); const { pos, at, ...rest } = p; if (v[k]) v[k] = { ...v[k], ...rest }; }); },
  reorder(keys) { return this.update((v) => { keys.forEach((k, i) => { if (v[k]) v[k].pos = i; }); }); },
});

// ---- Files you've opened (for the week progress rings) ----
BM.opened = Object.assign(storedMap('opened'), {
  cache: {},
  async load() { this.cache = await this.all(); return this.cache; },
  mark(cmid) {
    if (this.cache[cmid]) return;
    this.cache[cmid] = Date.now();
    this.update((v) => { v[cmid] = Date.now(); });
    document.dispatchEvent(new CustomEvent('bm:opened', { detail: String(cmid) }));
  },
});

// ---- What's in a course right now, and what's new since you last opened it ----
BM.courseInfo = {
  states: new Map(),
  // One course-state request per course per page, shared by the forums, the dashboard and the course page.
  state(courseId) {
    if (!this.states.has(courseId)) {
      const p = BM.api.courseState(courseId);
      p.catch(() => this.states.delete(courseId));
      this.states.set(courseId, p);
    }
    return this.states.get(courseId);
  },

  // The current week (Moodle's highlighted section, else the latest one with files) and every file id.
  summarize(st) {
    const cms = new Map((st.cm || []).map((c) => [String(c.id), c]));
    const sections = (st.section || []).filter((s) => s.visible !== false);
    const fileIds = (s) => (s.cmlist || []).filter((id) => BM.courseData.FILE_MODS.includes(cms.get(String(id))?.module));
    let cur = sections.find((s) => s.current && s.number > 0);
    if (!cur) cur = [...sections].reverse().find((s) => s.number > 0 && fileIds(s).length);
    return {
      weekId: cur ? String(cur.id) : '',
      weekTitle: cur ? BM.text(cur.title) : '',
      files: sections.flatMap((s) => fileIds(s)).map(String),
    };
  },

  async get(courseId) {
    return BM.store.swr(`cinfo:${courseId}`, 30 * 60 * 1000, async () => this.summarize(await this.state(courseId)), () => {});
  },

  // Files added since you last opened the course page. Nothing counts as new the first time.
  async newFiles(courseId, files) {
    const base = (await BM.store.get(`seenfiles:${courseId}`))?.v;
    if (!base) return [];
    const seen = new Set(base);
    return files.filter((id) => !seen.has(String(id)));
  },
  markSeen(courseId, files) { return BM.store.set(`seenfiles:${courseId}`, files.map(String)); },
};
