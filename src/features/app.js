// Makes Moodle feel like an app:
//   - Instant pages: when you hover a link to the dashboard, a course or a forum for a moment, Chrome
//     loads that page in the background (Speculation Rules), so the click opens it straight away.
//     Only plain "view" pages qualify; anything that changes something (logout, posting, links with a
//     sesskey) and discussion pages (opening one marks posts read) are never loaded early.
//   - Smooth page changes: see @view-transition in base.css.
//   - Live alerts: while Moodle is open, new forum posts in your courses pop up as a toast.
var BM = globalThis.BM;

BM.app = {
  init() {
    this.instantPages();
    BM.whenShown(() => this.live.start());
  },

  instantPages() {
    if (!HTMLScriptElement.supports?.('speculationrules') || document.querySelector('script[data-bm-speculation]')) return;
    const allowed = ['a[href$="/my/"]', 'a[href*="/course/view.php?id="]', 'a[href*="/mod/forum/view.php?id="]', 'a[href*="/mod/forum/index.php?id="]'];
    const never = ['[href*="sesskey"]', '[href*="logout"]', '[href*="post.php"]', '[href*="discuss.php"]', '[target="_blank"]', '[download]'];
    const s = document.createElement('script');
    s.type = 'speculationrules';
    s.dataset.bmSpeculation = '';
    s.textContent = JSON.stringify({
      prerender: [{
        source: 'document',
        where: { and: [{ selector_matches: allowed.join(', ') }, ...never.map((sel) => ({ not: { selector_matches: `a${sel}` } }))] },
        eagerness: 'moderate', // after a short hover, or on pointer down
      }],
    });
    document.head.append(s);
  },

  // ---- Live alerts ----
  // Every 5 minutes while this tab is visible, check the newest posts in all your forums. Only one tab
  // checks at a time (they share a timestamp), and the first check just remembers what's there.
  live: {
    EVERY: 5 * 60 * 1000,
    start() {
      if (!BM.cfg().userId || window.top !== window) return;
      setTimeout(() => this.tick(), 20 * 1000); // let the page itself load first
      setInterval(() => this.tick(), 60 * 1000);
    },
    async tick() {
      if (document.visibilityState !== 'visible') return;
      let last = 0;
      try { last = Number(localStorage.getItem('bm:livePolledAt')) || 0; } catch (_) {}
      if (Date.now() - last < this.EVERY) return;
      try { localStorage.setItem('bm:livePolledAt', String(Date.now())); } catch (_) {}
      await this.check();
    },
    async check() {
      const courses = (await BM.store.get('courses-v2'))?.v || [];
      if (!courses.length) return [];
      const posts = await BM.forumData.recent(courses, 15);
      const seen = (await BM.store.get('live-seen'))?.v;
      const key = (p) => `${p.id}:${p.ts}`;
      await BM.store.set('live-seen', posts.map(key));
      if (!seen) return [];
      const known = new Set(seen);
      const fresh = posts.filter((p) => !known.has(key(p)));
      if (fresh.length) this.alert(fresh);
      return fresh;
    },
    alert(fresh) {
      const p = fresh[0];
      const code = (p.courseName || '').split(':')[0].trim();
      const msg = fresh.length === 1 ? `New in ${code || 'your forums'}: ${p.title}` : `${fresh.length} new forum posts, latest in ${code}: ${p.title}`;
      BM.toast(msg, 'Open', () => { location.href = BM.forumLink(p.courseId, p.id); }, 12000);
    },
  },
};

// Our forum feed for a course, opened at one post (forum.js reads #post=).
BM.forumLink = (courseId, postId) => `/mod/forum/index.php?id=${courseId}${postId ? `#post=${postId}` : ''}`;
