// chrome.storage.local wrapper. Keys are namespaced by Moodle user id so that on a shared
// computer one student's cached deadlines/courses are never shown to another.
(() => {
  const BM = globalThis.BM;
  const ns = (key) => `u${BM.uid()}:${key}`;

  BM.store = {
    async get(key) {
      try {
        return (await chrome.storage.local.get(ns(key)))[ns(key)];
      } catch {
        return undefined; // extension reloaded underneath the page
      }
    },
    async set(key, value) {
      try {
        await chrome.storage.local.set({ [ns(key)]: value });
      } catch {}
    },
    /** All values whose (un-namespaced) key starts with `prefix`. */
    async all(prefix) {
      try {
        const full = ns(prefix);
        const everything = await chrome.storage.local.get(null);
        return Object.entries(everything)
          .filter(([k]) => k.startsWith(full))
          .map(([, v]) => v);
      } catch {
        return [];
      }
    },
  };

  /**
   * Stale-while-revalidate: render cached data immediately (instant UI), then refresh
   * from Moodle if the cache is older than `ttl` ms and render again.
   * render(data, { stale, error }) may be called up to twice.
   */
  BM.swr = async (key, ttl, fetcher, render) => {
    const cached = await BM.store.get(key);
    if (cached) render(cached.data, { stale: true });
    if (cached && Date.now() - cached.t < ttl) return cached.data;
    try {
      const data = await fetcher();
      await BM.store.set(key, { t: Date.now(), data });
      render(data, { stale: false });
      return data;
    } catch (error) {
      BM.log(`refresh of "${key}" failed`, error);
      if (!cached) render(null, { stale: false, error });
      return cached?.data;
    }
  };
})();
