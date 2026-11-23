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
//
// UCL courses also use "Advanced Forum" (mod/hsuforum) for Q&A, with its own pages and markup
// (/mod/hsuforum/view.php, /mod/hsuforum/discuss.php). Its discussions get ids starting with "h" so
// they never clash with mod/forum ones; `d` is always the plain number Moodle uses.
var BM = globalThis.BM;

BM.forumData = {
  threads: new Map(), // "<mod>:<discussion id>" -> Promise of { root, replies }
  MODS: ['forum', 'hsuforum'],

  // Our id for a discussion, and back.
  key: (mod, d) => (mod === 'hsuforum' ? `h${d}` : Number(d)),
  parseKey: (id) => (/^h\d+$/.test(String(id)) ? { mod: 'hsuforum', d: Number(String(id).slice(1)) } : { mod: 'forum', d: Number(id) }),

  async page(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    if (doc.querySelector('#login, form#login, body#page-login-index')) throw new Error('logged out');
    return doc;
  },

  // Forums in a course, from the course state. Announcements forums are spotted by name.
  async forums(courseId) {
    const st = await BM.courseInfo.state(courseId);
    const sections = new Map((st.section || []).map((s) => [String(s.id), s]));
    return (st.cm || [])
      .filter((c) => this.MODS.includes(c.module) && c.uservisible !== false && sections.get(String(c.sectionid))?.visible !== false)
      .map((c) => {
        const name = BM.text(c.name);
        return { id: Number(c.id), cmid: Number(c.id), mod: c.module, course: Number(courseId), name, unread: 0, postForumId: 0,
          type: /announce|news/i.test(name) ? 'news' : 'general' };
      });
  },

  // "4 replies", "1 reply", "2 unread"... anywhere in an element's text.
  countIn(el, re) { const m = (el?.textContent || '').replace(/\s+/g, ' ').match(re); return m ? Number(m[1].replace(/,/g, '')) : 0; },

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
    const mod = forum.mod || 'forum';
    const doc = await this.page(`/mod/${mod}/view.php?id=${forum.cmid}&p=${page}`);
    const addLink = doc.querySelector(`a[href*="/mod/${mod}/post.php?forum="], a[href*="post.php?forum="]`);
    if (addLink) forum.postForumId = Number(new URL(addLink.getAttribute('href'), location.origin).searchParams.get('forum')) || 0;
    else forum.postForumId = Number(doc.querySelector('input[name="forum"]')?.value) || 0;

    // Moodle's own forum: table rows. Advanced Forum: an <article> per discussion.
    let rows = [...doc.querySelectorAll('[data-region="discussion-list-item"], tr.discussion, tr[data-discussionid], article.hsuforum-thread, .hsuforum-thread[data-discussionid], [data-isdiscussion="true"]')];
    rows = rows.filter((r) => !rows.some((o) => o !== r && o.contains(r))); // outermost only
    const seen = new Set();
    const items = [];
    const push = (d) => { if (d.id && !seen.has(d.id)) { seen.add(d.id); items.push(d); } };
    for (const row of rows) {
      const link = row.querySelector('a[href*="discuss.php?d="]');
      if (!link) continue;
      const d = Number(row.dataset.discussionid) || Number(new URL(link.getAttribute('href'), location.origin).searchParams.get('d'));
      const isTable = row.matches('tr');
      const author = this.first(row, ['[data-region="author-name"]', '.author-info .text-truncate', '.author .text-truncate', 'td.author a[href*="/user/view.php"]', 'td.author',
        '.hsuforum-thread-byline a[href*="/user/view.php"]', '.hsuforum-thread-author a[href*="/user/view.php"]', '.hsuforum-thread-byline']);
      const unreadEl = this.first(row, ['[data-region="unread-count"]', 'a[href*="#unread"]', 'td.unread a', '.hsuforum-unreadcount', '.unread-count']);
      // The replies cell: marked up as such, or the one holding the unread badge, or a cell that's just a number.
      const replyCell = this.first(row, ['[data-region="replies"]', 'td.replies', '.replies', '.hsuforum-thread-replies', '.hsuforum-replycount']) || unreadEl?.closest('td') ||
        [...row.querySelectorAll('td')].find((td) => /repl/i.test(td.textContent) || /^\s*\d+\s*$/.test(td.textContent));
      const last = this.first(row, ['[data-region="last-post"]', 'td.lastpost', '.lastpost', '.hsuforum-thread-lastpost']) || (isTable ? [...row.querySelectorAll('td')].pop() : null);
      // The replies cell can also hold the unread badge; don't let "4" + "2 unread" read as 42.
      let replies = this.num(replyCell?.querySelector('[data-region="replies-count"]')?.textContent ||
        (unreadEl && replyCell?.contains(unreadEl) ? replyCell.textContent.replace(unreadEl.textContent, ' ') : replyCell?.textContent));
      if (!isTable) replies = this.countIn(row, /([\d,]+)\s+repl/i) || replies;
      push({
        id: this.key(mod, d),
        d,
        mod,
        title: (link.getAttribute('title') || link.textContent).replace(/\s+/g, ' ').trim(),
        author: (author?.textContent || '').replace(/\s+/g, ' ').trim(),
        authorId: Number(row.querySelector('a[href*="/user/view.php?id="]')?.getAttribute('href')?.match(/id=(\d+)/)?.[1]) || 0,
        avatar: row.querySelector('img.userpicture')?.getAttribute('src') || '',
        created: this.when(row.querySelector('.author-date, [data-region="created"]') || (isTable ? null : row.querySelector('time[datetime], [data-timestamp]'))),
        lastTs: this.when(last),
        lastBy: (last?.querySelector('.text-truncate, a[href*="/user/view.php"]')?.textContent || '').replace(/\s+/g, ' ').trim(),
        replies,
        unread: this.num(unreadEl?.textContent) || (isTable ? 0 : this.countIn(row, /([\d,]+)\s+(?:new|unread)/i)),
        pinned: row.classList.contains('pinned') || !!row.querySelector('[data-region="pinned"], [title*="inned"], .fa-thumb-tack, .fa-thumbtack'),
        locked: row.classList.contains('locked') || !!row.querySelector('[data-region="locked"], [title*="ocked"], .fa-lock'),
      });
    }
    // Unknown layout: fall back to every discussion link on the page, titles only.
    if (!items.length) {
      for (const a of doc.querySelectorAll('#region-main a[href*="discuss.php?d="], [role="main"] a[href*="discuss.php?d="]')) {
        const d = Number(new URL(a.getAttribute('href'), location.origin).searchParams.get('d'));
        const title = a.textContent.replace(/\s+/g, ' ').trim();
        if (title && !/^\d+$/.test(title)) push({ id: this.key(mod, d), d, mod, title, author: '', authorId: 0, avatar: '', created: 0, lastTs: 0, lastBy: '', replies: 0, unread: 0, pinned: false, locked: false });
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
        url: `/mod/${mod}/discuss.php?d=${d.d}`,
        search: `${d.title} ${d.author}`.toLowerCase(),
      })),
    };
  },

  // The newest discussions across every forum in these courses (announcements, Q&A, everything),
  // latest activity first. Reads each forum's first page, three at a time.
  async recent(courses, limit = 8) {
    const perCourse = await BM.pool(courses, 3, async (c) => (await this.forums(c.id)).map((f) => ({ ...f, courseName: c.name })));
    const forums = perCourse.flat().filter(Boolean);
    const lists = await BM.pool(forums, 3, async (f) => (await this.discussions(f, 0)).items.map((d) => ({
      id: d.id, title: d.title, author: d.lastBy || d.author, ts: d.lastTs || d.created, unread: d.unread,
      forumName: f.name, courseId: f.course, courseName: f.courseName, url: d.url,
    })));
    if (forums.length && lists.every((l) => l === undefined)) throw new Error("the forum pages didn't load");
    return lists.flat().filter(Boolean).sort((a, b) => b.ts - a.ts).slice(0, limit);
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

  // Accepts our id (a number for mod/forum, "h123" for Advanced Forum).
  thread(id) {
    const { mod, d } = this.parseKey(id);
    const k = `${mod}:${d}`;
    if (!this.threads.has(k)) {
      const p = this.slot(() => this.page(`/mod/${mod}/discuss.php?d=${d}`)).then((doc) => this.parseThread(doc));
      p.catch(() => this.threads.delete(k)); // let a later attempt retry
      this.threads.set(k, p);
    }
    return this.threads.get(k);
  },

  // Every element that is one post. Moodle's forum marks posts with data-post-id; Advanced Forum with
  // data-postid on .hsuforum-post-target; older themes with id="p<number>".
  POST_SEL: '[data-region="post"][data-post-id], .forum-post-container[data-post-id], div.forumpost[id^="p"], article.forum-post-container, ' +
    '.hsuforum-post-target[data-postid], [data-postid][data-ispost], article.hsuforum-thread[data-postid], .hsuforum-post-wrapper[id^="p"]',

  postId(n) { return Number(n.dataset.postId || n.dataset.postid) || Number((/^p(\d+)$/.exec(n.id || '') || [])[1]) || 0; },

  parseThread(doc) {
    const scope = doc.querySelector('#region-main, [role="main"]') || doc;
    let nodes = [...scope.querySelectorAll(this.POST_SEL)].filter((n) => this.postId(n));
    // The same post can match twice (a wrapper and its inner box): keep the outer one per id.
    const byId = new Map();
    for (const n of nodes) { const id = this.postId(n); if (!byId.has(id) || n.contains(byId.get(id))) byId.set(id, n); }
    nodes = [...byId.values()].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const isPost = (el) => nodes.includes(el);
    // How deep a post sits in the nested reply lists. Used when replies are siblings of what they answer.
    const depth = (n) => { let k = 0; for (let e = n.parentElement; e && e !== scope; e = e.parentElement) if (e.matches('ol, ul, [data-region="replies-container"], .indent, .hsuforum-thread-replies')) k++; return k; };
    const posts = nodes.map((n, i) => {
      const id = this.postId(n);
      // The post's own content, not a nested reply's.
      const mine = (el) => { for (let e = el; e; e = e.parentElement) { if (e === n) return true; if (isPost(e)) return false; } return false; };
      const pick = (sel) => [...n.querySelectorAll(sel)].find(mine);
      // Parent: the post this one sits inside (Moodle nests replies in their post), unless an earlier
      // post one level up sits closer, inside that same post (Advanced Forum puts a reply's replies
      // next to it in a nested list, so they're only "inside" the opening post).
      let parent = null;
      for (let e = n.parentElement; e && !parent; e = e.parentElement) if (isPost(e)) parent = e;
      const dn = depth(n);
      let prev = null;
      for (let j = i - 1; j >= 0; j--) if (depth(nodes[j]) < dn) { prev = nodes[j]; break; }
      if (prev && prev !== parent && (!parent || parent.contains(prev))) parent = prev;
      // Tried in order, most precise first (a bare .hsuforum-post-body also holds the name and date).
      const body = ['.post-content-container', '[data-region-content="forum-post-core"]', '.posting', '.post-content', '.hsuforum-post-body'].map(pick).find(Boolean);
      return {
        id,
        parentId: parent ? this.postId(parent) : 0,
        subject: (pick('[data-region-content="forum-post-core-subject"], .hsuforum-post-title, .hsuforum-thread-title, h3, h4, .subject')?.textContent || '').replace(/\s+/g, ' ').trim(),
        author: (n.dataset.author || pick('[data-region="author-name"], .hsuforum-post-byline a[href*="/user/view.php"], a[href*="/user/view.php"]:not(:has(img)), .author a')?.textContent || '').replace(/\s+/g, ' ').trim(),
        avatar: pick('img.userpicture')?.getAttribute('src') || '',
        created: this.when(pick('time[datetime], [data-timestamp]') || pick('.author, header, .hsuforum-post-byline')),
        message: body ? body.innerHTML : '',
        deleted: false,
      };
    });
    // A flat page (every post at the same level, none inside another): replies answer the first post.
    const root = posts.find((p) => !p.parentId) || posts[0] || null;
    for (const p of posts) if (p !== root && !p.parentId && root) p.parentId = root.id;
    return { root, replies: posts.filter((p) => p !== root) };
  },
};
