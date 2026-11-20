// Course forums as a feed (/mod/forum/index.php?id=<course> and /mod/forum/view.php?id=<cmid>).
// Data comes from Moodle's forum pages (src/lib/forum-data.js): UCL blocks the forum web services.
//
//   Left:  your courses (most recently used first), each with its unread count. Pick one to see its feed.
//   Main:  the course name, one tab per forum ("All forums" merges them), then a feed of posts:
//          author and photo, forum, time, title, the opening post with working links, and a
//          "replies" button that opens the whole thread right under the post. Reply opens Moodle's
//          reply form for that exact post; "Open in Moodle" shows the original page.
// Search, a Show filter (unread, pinned, started by me) and sorting sit above the feed.
// Nothing is posted from here. If anything fails, the stock Moodle page is left alone.
var BM = globalThis.BM;

BM.forum = {
  SHOW: [['all', 'Everything'], ['unread', 'Unread'], ['pinned', 'Pinned'], ['mine', 'Started by me']],
  SORTS: [['activity', 'Latest activity'], ['newest', 'Newest first'], ['replies', 'Most replies']],
  PER_PAGE: 30,
  state: { q: '', show: 'all', sort: 'activity', forum: 'all' },

  // Any problem leaves Moodle's own page in place and says why, in the console and in a small note at
  // the top of the page (with Try again), so it's never a silent no-op.
  async init() {
    try {
      const reason = await this.start();
      if (reason) this.skip(reason);
    } catch (e) {
      this.skip(`couldn't reach Moodle's forum data (${e.message || e})`);
    }
  },

  skip(reason) {
    console.info('[BetterMoodle] forum view not shown:', reason);
    if (this.root) this.setClassic(true, false);
    const where = BM.pageAnchor();
    if (!where || document.querySelector('.bm-forum-note')) return;
    const h = BM.h;
    where.before(h('p', { class: 'bm-forum-note bm-root bm-muted bm-small' },
      `BetterMoodle couldn't show its forum view: ${reason}. `,
      h('button', { class: 'bm-link-btn', onclick: () => location.reload() }, 'Try again')));
  },

  // Returns a reason string if the feed can't be shown, or nothing once it's on screen.
  async start() {
    const anchor = BM.pageAnchor();
    const params = new URLSearchParams(location.search);
    const onIndex = /\/mod\/forum\/index\.php$/.test(location.pathname) || document.body.id === 'page-mod-forum-index';
    const id = Number(params.get('id')) || (onIndex ? BM.courseIdFromBody() : 0);
    const fid = Number(params.get('f')) || 0;
    if (!anchor) return 'this page has no main content area to replace';
    if (!id && !fid) return 'the address has no forum or course id';

    const courses = (await BM.store.swr('courses-v2', 60 * 60 * 1000, () => BM.api.courses(), () => {})) || [];
    const visits = await BM.recent.all();
    const order = new Map(courses.map((c, i) => [c.id, i]));
    this.courses = courses.slice().sort((a, b) => ((visits[b.id] || 0) - (visits[a.id] || 0)) || (order.get(a.id) - order.get(b.id)));
    // Which course this page is about: the address on the index page, Moodle's page data otherwise.
    const courseId = onIndex ? id : (BM.courseIdFromBody() || BM.cfg().courseId);
    if (!courseId) return "couldn't tell which course this forum belongs to";
    this.courseId = courseId;
    this.forums = (await BM.forumData.forums(courseId))
      .sort((a, b) => (b.type === 'news') - (a.type === 'news') || a.name.localeCompare(b.name));
    if (!this.forums.length) return "Moodle didn't list any forums for this course";
    if (!onIndex && id) {
      const f = this.forums.find((x) => x.cmid === id);
      if (f) this.state.forum = f.id;
    }
    BM.recent.visit(courseId);

    this.build(anchor);
    await this.loadAll(); // errors go to init(), which falls back to the classic page for this visit only
    return '';
  },

  build(anchor) {
    const h = BM.h;
    const course = this.courses.find((c) => c.id === this.courseId);
    const [code, ...rest] = (course?.name || '').split(':');
    const title = rest.length ? rest.join(':').trim() : (course?.name || 'Course forums');

    this.feedEl = h('div', { class: 'bm-feed', 'aria-live': 'polite' }, h('p', { class: 'bm-muted' }, 'Loading posts…'));
    this.moreEl = h('button', { class: 'bm-btn', hidden: true, onclick: () => this.loadMore() }, 'Load older posts');
    this.summaryEl = h('span', {});
    this.newPostEl = h('a', { class: 'bm-btn bm-btn-primary', hidden: true });
    this.input = h('input', { type: 'search', class: 'bm-input', placeholder: 'Search posts…  ( / )', 'aria-label': 'Search posts' });
    this.input.addEventListener('input', () => { this.state.q = this.input.value.trim().toLowerCase(); this.render(); });
    const select = (label, opts, key) => {
      const s = h('select', { class: 'bm-select', 'aria-label': label }, opts.map(([k, t]) => h('option', { value: k, selected: k === this.state[key] }, t)));
      s.addEventListener('change', () => { this.state[key] = s.value; this.render(); });
      return h('label', { class: 'bm-select-wrap' }, h('span', { class: 'bm-muted bm-small' }, label), s);
    };
    this.tabsEl = h('div', { class: 'bm-chips bm-forum-tabs', role: 'tablist', 'aria-label': 'Forums in this course' });

    this.toggle = h('button', { class: 'bm-link-btn', onclick: () => this.setClassic(!this.classic) });
    this.layout = h('div', { class: 'bm-forum-layout' },
      this.rail(),
      h('section', { class: 'bm-forum-main', 'aria-labelledby': 'bm-forum-title' },
        h('header', { class: 'bm-forum-head' },
          h('div', { class: 'bm-forum-titles' },
            rest.length ? h('span', { class: 'bm-forum-code' }, code.trim()) : null,
            h('h1', { class: 'bm-forum-title', id: 'bm-forum-title' }, title, h('span', { class: 'bm-hero-dot' }, '.')),
            h('p', { class: 'bm-muted' }, this.summaryEl)),
          h('div', { class: 'bm-spacer' }),
          this.newPostEl),
        this.tabsEl,
        h('div', { class: 'bm-filterbar bm-feed-tools' }, this.input, h('div', { class: 'bm-spacer' }),
          select('Show', this.SHOW, 'show'), select('Sort', this.SORTS, 'sort')),
        this.feedEl,
        h('div', { class: 'bm-forum-more' }, this.moreEl)));
    this.root = h('div', { id: 'bm-forum', class: 'bm-root' },
      h('div', { class: 'bm-forum-top' }, h('div', { class: 'bm-spacer' }), this.toggle), this.layout);
    this.anchor = anchor;
    anchor.before(this.root);

    try { this.classic = localStorage.getItem('bm:classicForum') === '1'; } catch (_) { this.classic = false; }
    this.setClassic(this.classic);
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && !BM.isTyping(e) && !e.metaKey && !e.ctrlKey && !this.classic) { e.preventDefault(); this.input.focus(); }
    });
    this.renderTabs();
  },

  // remember=false is for automatic fallbacks: only your own clicks on the toggle are remembered.
  setClassic(v, remember = true) {
    this.classic = v;
    if (remember) { try { localStorage.setItem('bm:classicForum', v ? '1' : '0'); } catch (_) {} }
    this.anchor.classList.toggle('bm-replaced', !v);
    this.layout.hidden = v;
    this.toggle.textContent = v ? 'Use BetterMoodle view' : 'Classic view';
  },

  // Left: courses with forums, newest used first. The current one is highlighted.
  rail() {
    const h = BM.h;
    const withForums = this.courses.slice();
    if (!withForums.some((c) => c.id === this.courseId)) withForums.unshift({ id: this.courseId, name: 'This course' });
    return h('nav', { class: 'bm-forum-rail bm-panel', 'aria-label': 'Courses' },
      h('h2', { class: 'bm-h2' }, 'Forums'),
      h('ul', {}, withForums.map((c, i) => {
        const [code, ...rest] = c.name.split(':');
        const unread = c.id === this.courseId ? this.forums.reduce((n, f) => n + f.unread, 0) : 0;
        return h('li', {},
          h('a', { class: 'bm-rail-course', href: `/mod/forum/index.php?id=${c.id}`, style: `--c:${BM.colorFor(i)}`,
            'aria-current': c.id === this.courseId ? 'page' : null },
            h('span', { class: 'bm-rail-text' },
              rest.length ? h('span', { class: 'bm-rail-code' }, code.trim()) : null,
              h('span', { class: 'bm-rail-name' }, rest.length ? rest.join(':').trim() : c.name)),
            unread ? h('span', { class: 'bm-badge', title: 'Unread posts' }, String(unread)) : null));
      })));
  },

  renderTabs() {
    const h = BM.h;
    const tab = (key, label, unread) => h('button', {
      class: 'bm-chip', role: 'tab', 'aria-selected': String(this.state.forum === key), dataset: { forum: String(key) },
      onclick: () => {
        this.state.forum = key;
        const f = this.forums.find((x) => x.id === key);
        history.replaceState(null, '', f ? `/mod/forum/view.php?id=${f.cmid}` : `/mod/forum/index.php?id=${this.courseId}`);
        this.renderTabs();
        this.render();
      },
    }, label, unread ? h('span', { class: 'bm-badge' }, String(unread)) : null);
    this.tabsEl.replaceChildren(
      tab('all', 'All forums', this.forums.reduce((n, f) => n + f.unread, 0)),
      ...this.forums.map((f) => tab(f.id, f.name, f.unread)));
    // "New post" goes to Moodle's form for the chosen forum (or the first one students can post in).
    // Only forums whose page offers "Add discussion topic" (so not Announcements, for students).
    const chosen = this.forums.find((f) => f.id === this.state.forum);
    const target = chosen ? (chosen.postForumId ? chosen : null) : this.forums.find((f) => f.postForumId && f.type !== 'news');
    this.newPostEl.hidden = !target;
    if (target) {
      this.newPostEl.href = `/mod/forum/post.php?forum=${target.postForumId}`;
      this.newPostEl.textContent = this.state.forum === 'all' ? `New post in ${target.name}` : 'New post';
    }
  },

  // First page of every forum in the course, merged into one list.
  async loadAll() {
    this.posts = [];
    this.next = new Map(this.forums.map((f) => [f.id, 0])); // forum id -> next page, or -1 when done
    await this.loadMore();
  },

  async loadMore() {
    this.moreEl.disabled = true;
    const todo = this.forums.filter((f) => this.next.get(f.id) >= 0);
    const pages = await BM.pool(todo, 3, async (f) => {
      const page = this.next.get(f.id);
      const got = await BM.forumData.discussions(f, page);
      this.next.set(f.id, got.more ? page + 1 : -1);
      f.unread += got.items.reduce((n, d) => n + d.unread, 0);
      return got.items.map((d) => ({ ...d, forumId: f.id, forumName: f.name, forumCmid: f.cmid }));
    });
    // Every forum page failing (rather than one) means something is wrong: let init() show the note.
    if (todo.length && pages.every((p) => p === undefined)) throw new Error("the forum pages didn't load");
    this.posts.push(...pages.flat().filter(Boolean));
    this.renderTabs();
    this.moreEl.hidden = ![...this.next.values()].some((n) => n >= 0);
    this.moreEl.disabled = false;
    this.render();
  },

  visible() {
    const { q, show, sort, forum } = this.state;
    const me = BM.cfg().userId;
    const key = (d) => (sort === 'newest' ? d.created || d.lastTs : d.lastTs || d.created) || 0;
    return this.posts
      .filter((d) => forum === 'all' || d.forumId === forum)
      .filter((d) => show === 'all' || (show === 'unread' ? d.unread > 0 : show === 'pinned' ? d.pinned : d.authorId === me))
      .filter((d) => !q || d.search.includes(q))
      .sort((a, b) => (sort === 'replies' ? (b.replies - a.replies) || (a.order - b.order) : (b.pinned - a.pinned) || (key(b) - key(a)) || (a.order - b.order)));
  },

  render() {
    const h = BM.h;
    const inForum = this.posts.filter((d) => this.state.forum === 'all' || d.forumId === this.state.forum);
    const unread = inForum.filter((d) => d.unread > 0).length;
    this.summaryEl.textContent = `${inForum.length}${this.moreEl.hidden ? '' : '+'} post${inForum.length === 1 ? '' : 's'}${unread ? `, ${unread} with new replies` : ''}`;
    const list = this.visible();
    if (!inForum.length) {
      this.feedEl.replaceChildren(h('div', { class: 'bm-forum-empty' }, h('p', {}, 'No posts here yet.'),
        this.newPostEl.hidden ? null : h('a', { class: 'bm-btn bm-btn-primary', href: this.newPostEl.href }, 'Write the first one')));
      return;
    }
    if (!list.length) { this.feedEl.replaceChildren(h('p', { class: 'bm-muted bm-forum-empty' }, 'Nothing matches. Set Show to Everything, or clear the search.')); return; }
    const first = !this.feedEl.querySelector('.bm-post');
    const pinned = this.state.sort !== 'replies' ? list.filter((d) => d.pinned) : [];
    const rest = list.filter((d) => !pinned.includes(d));
    this.feedEl.replaceChildren(
      pinned.length ? h('h3', { class: 'bm-h3' }, 'Pinned') : null, ...pinned.map((d) => this.post(d)),
      pinned.length && rest.length ? h('h3', { class: 'bm-h3' }, 'Latest') : null, ...rest.map((d) => this.post(d)));
    if (first) BM.enter(this.feedEl.querySelectorAll('.bm-post'));
    this.watch();
  },

  // Each card's full post (and author photo, date, replies) comes from its discussion page, fetched
  // when the card scrolls near the screen. The card is then redrawn with everything filled in.
  watch() {
    this.io?.disconnect();
    if (typeof IntersectionObserver !== 'function') return;
    this.io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        this.io.unobserve(e.target);
        const d = this.posts.find((x) => String(x.id) === e.target.dataset.id);
        if (d && !d.loaded) this.fill(d);
      }
    }, { rootMargin: '400px 0px' });
    for (const el of this.feedEl.querySelectorAll('.bm-post:not(.is-loaded)')) this.io.observe(el);
  },

  async fill(d) {
    try {
      const { root, replies } = await BM.forumData.thread(d.id);
      if (root) {
        d.postId = root.id;
        d.message = root.message;
        d.author = d.author || root.author;
        d.avatar = d.avatar || root.avatar;
        d.created = d.created || root.created;
      }
      d.thread = replies;
      d.replies = d.replies || replies.length;
      const latest = replies.reduce((m, p) => (p.created > (m?.created || 0) ? p : m), null);
      if (latest) { d.lastTs = d.lastTs || latest.created; d.lastBy = d.lastBy || latest.author; }
      d.search = `${d.title} ${d.author} ${BM.text(d.message.replace(/<[^>]+>/g, ' '))}`.toLowerCase();
    } catch (e) {
      d.failed = true;
    }
    d.loaded = true;
    const old = this.feedEl.querySelector(`.bm-post[data-id="${d.id}"]`);
    if (!old) return;
    // If its replies are already open, leave the card alone (redrawing would close them).
    if (old.querySelector('.bm-post-foot [aria-expanded="true"]')) {
      old.classList.add('is-loaded');
      if (!d.failed) old.querySelector('.bm-post-body').replaceChildren(this.body(d.message));
      if (d.postId && !d.locked) old.querySelector('.bm-post-foot a.bm-post-action')?.setAttribute('href', `/mod/forum/post.php?reply=${d.postId}`);
      return;
    }
    old.replaceWith(this.post(d));
  },

  avatar(name, url, small) {
    const h = BM.h;
    const cls = 'bm-avatar' + (small ? ' is-small' : '');
    // Moodle's grey default picture says nothing; use initials on a colour instead.
    if (url && /^(\/|https:\/\/moodle\.ucl\.ac\.uk\/)/.test(url) && !/\/u\/f\d/.test(url)) return h('img', { class: cls, src: url, alt: '', loading: 'lazy' });
    const initials = (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    let n = 0;
    for (const ch of name || '') n = (n * 31 + ch.charCodeAt(0)) >>> 0;
    return h('span', { class: cls, 'aria-hidden': 'true', style: `--c:${BM.colorFor(n)}` }, initials);
  },

  // A post's HTML from Moodle, made safe; links open in a new tab.
  body(html) {
    const frag = BM.safeFragment(html || '');
    for (const a of frag.querySelectorAll('a[href]')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    return frag;
  },

  post(d) {
    const h = BM.h;
    const body = h('div', { class: 'bm-post-body' }, d.loaded
      ? (d.failed ? h('p', { class: 'bm-muted' }, "Couldn't load this post here. ", h('a', { href: d.url }, 'Open it in Moodle')) : this.body(d.message))
      : h('p', { class: 'bm-post-loading', 'aria-label': 'Loading post' }, h('span', {}), h('span', {}), h('span', {})));
    const more = h('button', { class: 'bm-link-btn bm-post-more', hidden: true, onclick: () => {
      const open = body.classList.toggle('is-open');
      more.textContent = open ? 'Show less' : 'Show more';
    } }, 'Show more');
    const thread = h('div', { class: 'bm-thread', hidden: true });
    const repliesBtn = h('button', { class: 'bm-post-action', 'aria-expanded': 'false', disabled: !d.replies },
      d.replies ? (d.replies === 1 ? 'View 1 reply' : `View ${d.replies} replies`) : 'No replies yet');
    const art = h('article', { class: 'bm-post' + (d.unread ? ' is-unread' : '') + (d.pinned ? ' is-pinned' : '') + (d.loaded ? ' is-loaded' : ''), dataset: { id: d.id } },
      h('header', { class: 'bm-post-head' },
        this.avatar(d.author, d.avatar),
        h('div', { class: 'bm-post-who' },
          h('span', { class: 'bm-post-author' }, d.author),
          h('span', { class: 'bm-muted bm-small' },
            this.state.forum === 'all' ? h('button', { class: 'bm-post-forum', onclick: () => this.tabsEl.querySelector(`[data-forum="${d.forumId}"]`)?.click() }, d.forumName) : null,
            this.state.forum === 'all' ? ' · ' : null,
            d.created ? h('time', { datetime: new Date(d.created * 1000).toISOString(), title: BM.fmtTime(d.created) }, BM.ago(d.created)) : null)),
        h('div', { class: 'bm-spacer' }),
        d.pinned ? h('span', { class: 'bm-tag' }, 'Pinned') : null,
        d.locked ? h('span', { class: 'bm-tag' }, 'Locked') : null,
        d.unread ? h('span', { class: 'bm-badge' }, `${d.unread} new`) : null),
      h('h4', { class: 'bm-post-title' }, h('a', { href: d.url }, d.title)),
      body, more,
      h('footer', { class: 'bm-post-foot' },
        repliesBtn,
        d.replies && d.lastBy && d.lastTs ? h('span', { class: 'bm-muted bm-small' }, `Latest from ${d.lastBy}, ${BM.ago(d.lastTs)}`) : null,
        h('div', { class: 'bm-spacer' }),
        d.locked ? null : h('a', { class: 'bm-post-action', href: d.postId ? `/mod/forum/post.php?reply=${d.postId}` : d.url }, 'Reply'),
        h('a', { class: 'bm-post-action', href: d.url }, 'Open in Moodle')),
      thread);
    repliesBtn.addEventListener('click', () => this.toggleThread(d, thread, repliesBtn, art));
    // Only offer "Show more" when the post is actually cut off.
    requestAnimationFrame(() => { more.hidden = body.scrollHeight <= body.clientHeight + 2; body.classList.toggle('is-clamped', !more.hidden); });
    return art;
  },

  async toggleThread(d, thread, btn, art) {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    btn.textContent = open ? 'Hide replies' : (d.replies === 1 ? 'View 1 reply' : `View ${d.replies} replies`);
    if (!open) { BM.slide(thread, false, () => { thread.hidden = btn.getAttribute('aria-expanded') !== 'true'; }); return; }
    thread.hidden = false;
    if (!thread.dataset.loaded) {
      thread.replaceChildren(BM.h('p', { class: 'bm-muted bm-small' }, 'Loading replies…'));
      try {
        const { root, replies } = await BM.forumData.thread(d.id);
        if (root && !d.postId) d.postId = root.id;
        thread.replaceChildren(this.threadTree(replies, d));
        thread.dataset.loaded = '1';
      } catch (e) {
        thread.replaceChildren(BM.h('p', { class: 'bm-muted bm-small' }, "Couldn't load replies. ", BM.h('a', { href: d.url }, 'Open in Moodle')));
      }
    }
    BM.slide(thread, true);
    // Reading the replies here counts as seen.
    if (d.unread) { d.unread = 0; art.classList.remove('is-unread'); art.querySelector('.bm-post-head .bm-badge')?.remove(); }
  },

  // Replies nested under what they answer, three levels deep at most (deeper ones stay at level three).
  threadTree(posts, d) {
    const h = BM.h;
    const kids = new Map();
    for (const p of posts) (kids.get(p.parentId) || kids.set(p.parentId, []).get(p.parentId)).push(p);
    const ids = new Set(posts.map((p) => p.id));
    const roots = posts.filter((p) => p.parentId === d.postId || !ids.has(p.parentId));
    const branch = (list, depth) => h('ol', { class: 'bm-replies' + (depth >= 2 ? ' is-flat' : '') }, list.map((p) => {
      const children = kids.get(p.id) || [];
      return h('li', { class: 'bm-reply' },
        h('div', { class: 'bm-reply-head' },
          this.avatar(p.author, p.avatar, true),
          h('span', { class: 'bm-post-author' }, p.author),
          h('time', { class: 'bm-muted bm-small', datetime: new Date(p.created * 1000).toISOString(), title: BM.fmtTime(p.created) }, BM.ago(p.created))),
        h('div', { class: 'bm-reply-body' }, p.deleted ? h('p', { class: 'bm-muted' }, 'This post was deleted.') : this.body(p.message)),
        d.locked ? null : h('a', { class: 'bm-post-action bm-small', href: `/mod/forum/post.php?reply=${p.id}` }, 'Reply'),
        children.length ? branch(children, depth + 1) : null);
    }));
    return roots.length ? branch(roots, 0) : h('p', { class: 'bm-muted bm-small' }, 'No replies yet.');
  },
};
