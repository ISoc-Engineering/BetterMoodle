// chrome.storage cache, namespaced per Moodle user so a shared computer never mixes students' data.
var BM = globalThis.BM;

// Courses you opened, newest first. Kept here (not just Moodle's "last accessed") so the dashboard
// order updates the moment you visit a course.
BM.recent = {
  async visit(courseId) {
    const v = (await BM.store.get('visits'))?.v || {};
    v[courseId] = Date.now();
    await BM.store.set('visits', v);
  },
  async all() { return (await BM.store.get('visits'))?.v || {}; },
};

// Deadlines you ticked off. Only hides them in BetterMoodle; nothing is sent to Moodle.
// Entries older than 60 days are dropped so the list doesn't grow forever.
BM.done = {
  async all() {
    const v = (await BM.store.get('done'))?.v || {};
    const cutoff = Date.now() - 60 * 86400 * 1000;
    for (const k of Object.keys(v)) if (v[k] < cutoff) delete v[k];
    return v;
  },
  // Writes are queued so a quick tick-then-Undo can't save in the wrong order.
  queue: Promise.resolve(),
  set(id, isDone) {
    this.queue = this.queue.then(async () => {
      const v = await this.all();
      if (isDone) v[id] = Date.now(); else delete v[id];
      await BM.store.set('done', v);
    });
    return this.queue;
  },
};

BM.store = {
  key(k) { return `u${BM.cfg().userId}:${k}`; },

  async get(k) {
    const key = this.key(k);
    try { return (await chrome.storage.local.get(key))[key] || null; } catch (_) { return null; }
  },

  async set(k, v, extra = {}) {
    try { await chrome.storage.local.set({ [this.key(k)]: { t: Date.now(), v, ...extra } }); } catch (_) {}
  },

  // Stale-while-revalidate: render cached data immediately, refetch if older than maxAgeMs,
  // then render again with fresh data. onError only fires if there's nothing cached to show.
  async swr(k, maxAgeMs, fetcher, render, onError) {
    const hit = await this.get(k);
    if (hit) render(hit.v, { cached: true });
    if (hit && Date.now() - hit.t < maxAgeMs) return hit.v;
    try {
      const v = await fetcher();
      await this.set(k, v);
      render(v, { cached: false });
      return v;
    } catch (e) {
      console.warn('[BetterMoodle]', k, e);
      if (!hit && onError) onError(e);
      return hit ? hit.v : null;
    }
  },
};
