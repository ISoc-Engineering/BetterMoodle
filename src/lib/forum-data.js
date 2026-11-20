// Forum data read from Moodle's own forum pages.
//
// UCL switches off Moodle's forum web services (mod_forum_get_forums_by_courses etc. return
// "Web service is not available"), so instead of the API we fetch the same pages a student can open
// and read them:
//   - which forums a course has: the course's state (core_courseformat_get_state, which UCL allows)
//   - a forum's discussions:      /mod/forum/view.php?id=<cmid>&p=<page>
//   - a discussion's posts:       /mod/forum/discuss.php?d=<id>
// Selectors follow Moodle 4's templates, each with fallbacks, and every reader degrades: if a detail
// can't be found it's left empty rather than failing the whole page.
var BM = globalThis.BM;

BM.forumData = {
  threads: new Map(), // discussion id -> Promise of { root, replies }

  async page(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    if (doc.querySelector('#login, form#login, body#page-login-index')) throw new Error('logged out');
    return doc;
  },

  // Forums in a course, from the course state. Announcements forums are spotted by name.
  async forums(courseId) {
    const st = await BM.api.courseState(courseId);
    const sections = new Map((st.section || []).map((s) => [String(s.id), s]));
    return (st.cm || [])
      .filter((c) => c.module === 'forum' && c.uservisible !== false && sections.get(String(c.sectionid))?.visible !== false)
      .map((c) => {
        const name = BM.text(c.name);
        return { id: Number(c.id), cmid: Number(c.id), course: Number(courseId), name, unread: 0, postForumId: 0,
          type: /announce|news/i.test(name) ? 'news' : 'general' };
      });
  },

  // The first element matching any selector, trying them in order (querySelector would return
  // whichever comes first in the page, e.g. a whole author cell instead of just the name in it).
  first(scope, sels) {
    for (const sel of sels) { const el = scope.querySelector(sel); if (el) return el; }
    return null;
  },

  num(s) { const m = String(s || '').replace(/,/g, '').match(/\d+/); return m ? Number(m[0]) : 0; },

  // A timestamp (seconds) from a <time datetime>, a data-timestamp, or readable text; 0 if none.
  when(el) {
    if (!el) return 0;
    const t = el.matches?.('time[datetime], [data-timestamp]') ? el : el.querySelector?.('time[datetime], [data-timestamp]');
    if (t?.dataset?.timestamp) return Number(t.dataset.timestamp) || 0;
    const v = t ? t.getAttribute('datetime') : el.textContent;
    const ms = Date.parse(String(v || '').replace(/\s+/g, ' ').replace(/^[A-Za-z]+,\s*/, '').trim());
    return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
  },

  // One page of a forum's discussion list.
  async discussions(forum, page = 0) {
    const doc = await this.page(`/mod/forum/view.php?id=${forum.cmid}&p=${page}`);
    const addLink = doc.querySelector('a[href*="/mod/forum/post.php?forum="], a[href*="post.php?forum="]');
    if (addLink) forum.postForumId = Number(new URL(addLink.getAttribute('href'), location.origin).searchParams.get('forum')) || 0;
    else forum.postForumId = Number(doc.querySelector('input[name="forum"]')?.value) || 0;

    let rows = [...doc.querySelectorAll('[data-region="discussion-list-item"], tr.discussion, tr[data-discussionid]')];
    const seen = new Set();
    const items = [];
    const push = (d) => { if (d.id && !seen.has(d.id)) { seen.add(d.id); items.push(d); } };
    for (const row of rows) {
      const link = row.querySelector('a[href*="discuss.php?d="]');
      if (!link) continue;
      const id = Number(row.dataset.discussionid) || Number(new URL(link.getAttribute('href'), location.origin).searchParams.get('d'));
      const author = this.first(row, ['[data-region="author-name"]', '.author-info .text-truncate', '.author .text-truncate', 'td.author a[href*="/user/view.php"]', 'td.author']);
      const replyCell = row.querySelector('[data-region="replies"], td.replies, .replies') ||
        [...row.querySelectorAll('td')].find((td) => /repl/i.test(td.textContent) || /^\s*\d+\s*$/.test(td.textContent));
      const unreadEl = this.first(row, ['[data-region="unread-count"]', 'a[href*="#unread"]', 'td.unread a']);
      const last = this.first(row, ['[data-region="last-post"]', 'td.lastpost', '.lastpost']) || [...row.querySelectorAll('td')].pop();
      push({
        id,
        title: (link.getAttribute('title') || link.textContent).replace(/\s+/g, ' ').trim(),
        author: (author?.textContent || '').replace(/\s+/g, ' ').trim(),
        authorId: Number(row.querySelector('a[href*="/user/view.php?id="]')?.getAttribute('href')?.match(/id=(\d+)/)?.[1]) || 0,
        avatar: row.querySelector('img.userpicture')?.getAttribute('src') || '',
        created: this.when(row.querySelector('.author-date, [data-region="created"]')),
        lastTs: this.when(last),
        lastBy: (last?.querySelector('.text-truncate, a[href*="/user/view.php"]')?.textContent || '').replace(/\s+/g, ' ').trim(),
        // The replies cell can also hold the unread badge; don't let "4" + "2 unread" read as 42.
        replies: this.num(replyCell?.querySelector('[data-region="replies-count"]')?.textContent ||
          (unreadEl && replyCell?.contains(unreadEl) ? replyCell.textContent.replace(unreadEl.textContent, ' ') : replyCell?.textContent)),
        unread: this.num(unreadEl?.textContent),
        pinned: row.classList.contains('pinned') || !!row.querySelector('[data-region="pinned"], [title*="inned"], .fa-thumb-tack, .fa-thumbtack'),
        locked: row.classList.contains('locked') || !!row.querySelector('[data-region="locked"], [title*="ocked"], .fa-lock'),
      });
    }
    // Unknown layout: fall back to every discussion link on the page, titles only.
    if (!items.length) {
      for (const a of doc.querySelectorAll('#region-main a[href*="discuss.php?d="], [role="main"] a[href*="discuss.php?d="]')) {
        const id = Number(new URL(a.getAttribute('href'), location.origin).searchParams.get('d'));
        const title = a.textContent.replace(/\s+/g, ' ').trim();
        if (title && !/^\d+$/.test(title)) push({ id, title, author: '', authorId: 0, avatar: '', created: 0, lastTs: 0, lastBy: '', replies: 0, unread: 0, pinned: false, locked: false });
      }
    }
    const more = !!doc.querySelector(`a[href*="p=${page + 1}"][href*="view.php"], .pagination [data-page-number="${page + 2}"]`);
    return {
      more,
      items: items.map((d, i) => ({
        ...d,
        order: page * 1000 + i, // Moodle lists newest activity first; keeps that order when times are unknown
        message: '',
        postId: 0,
        url: `/mod/forum/discuss.php?d=${d.id}`,
        search: `${d.title} ${d.author}`.toLowerCase(),
      })),
    };
  },

  // Every post in a discussion: the opening post and the replies, each with its parent.
  // At most three discussion pages load at once, so scrolling a long feed doesn't flood Moodle.
  running: 0,
  waiting: [],
  async slot(fn) {
    if (this.running >= 3) await new Promise((r) => this.waiting.push(r));
    this.running++;
    try { return await fn(); } finally { this.running--; this.waiting.shift()?.(); }
  },

  thread(discussionId) {
    if (!this.threads.has(discussionId)) {
      const p = this.slot(() => this.page(`/mod/forum/discuss.php?d=${discussionId}`)).then((doc) => this.parseThread(doc));
      p.catch(() => this.threads.delete(discussionId)); // let a later attempt retry
      this.threads.set(discussionId, p);
    }
    return this.threads.get(discussionId);
  },

  parseThread(doc) {
    const nodes = [...doc.querySelectorAll('[data-region="post"][data-post-id], .forum-post-container[data-post-id], div.forumpost[id^="p"], article.forum-post-container')];
    const posts = nodes.map((n) => {
      const id = Number(n.dataset.postId) || Number((n.id || '').replace(/\D/g, ''));
      // The post's own content, not a nested reply's.
      const own = (sel) => [...n.querySelectorAll(sel)].find((el) => el.closest('[data-region="post"], .forum-post-container, div.forumpost') === n);
      const core = own('[data-region="post-core"], .forum-post-core, .forumpost-core') || n;
      const pick = (sel) => [...core.querySelectorAll(sel)].find((el) => el.closest('[data-region="post"], .forum-post-container, div.forumpost') === n);
      const parentNode = n.parentElement?.closest('[data-region="post"][data-post-id], .forum-post-container[data-post-id], div.forumpost[id^="p"]');
      const body = pick('.post-content-container, [data-region-content="forum-post-core"], .posting, .post-content');
      return {
        id,
        parentId: parentNode ? (Number(parentNode.dataset.postId) || Number((parentNode.id || '').replace(/\D/g, ''))) : 0,
        subject: (pick('[data-region-content="forum-post-core-subject"], h3, .subject')?.textContent || '').replace(/\s+/g, ' ').trim(),
        author: (pick('a[href*="/user/view.php"], .author a, [data-region="author-name"]')?.textContent || '').replace(/\s+/g, ' ').trim(),
        avatar: pick('img.userpicture')?.getAttribute('src') || '',
        created: this.when(pick('time[datetime], [data-timestamp]') || pick('.author, header')),
        message: body ? body.innerHTML : '',
        deleted: false,
      };
    }).filter((p) => p.id);
    const root = posts.find((p) => !p.parentId) || posts[0] || null;
    return { root, replies: posts.filter((p) => p !== root) };
  },
};
