// chrome.storage cache, namespaced per Moodle user so a shared computer never mixes students' data.
var BM = globalThis.BM;

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
