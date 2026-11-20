// Moodle AJAX web services, called exactly the way Moodle's own JS does: session cookie + sesskey.
var BM = globalThis.BM;

BM.api = {
  async call(methodname, args) {
    const { sesskey } = BM.cfg();
    if (!sesskey) throw new Error('Not logged in');
    const res = await fetch(`/lib/ajax/service.php?sesskey=${encodeURIComponent(sesskey)}&info=${methodname}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ index: 0, methodname, args }]),
    });
    if (!res.ok) throw new Error(`${methodname}: HTTP ${res.status}`);
    const [r] = await res.json();
    if (r.error) throw new Error(`${methodname}: ${r.exception?.message || 'error'}`);
    return r.data;
  },

  async courses() {
    const d = await this.call('core_course_get_enrolled_courses_by_timeline_classification', {
      offset: 0, limit: 0, classification: 'inprogress', sort: 'fullname',
    });
    return d.courses.map((c) => ({
      id: c.id,
      name: BM.text(c.fullname),
      short: BM.text(c.shortname),
      category: BM.text(c.coursecategory),
      fav: !!c.isfavourite,
      url: c.viewurl,
      image: BM.api.safeImage(c.courseimage),
    }));
  },

  // Course images are either Moodle's generated SVG pattern (a data: URI) or a pluginfile.php URL on
  // the same site. Anything else is dropped so a course can't point us at an external tracker.
  safeImage(src) {
    if (typeof src !== 'string' || !src) return '';
    if (/^data:image\/(svg\+xml|png|jpe?g|gif|webp)[;,]/i.test(src)) return src;
    try {
      const u = new URL(src, location.origin);
      return u.origin === location.origin && u.pathname.startsWith('/pluginfile.php/') ? u.href : '';
    } catch (_) { return ''; }
  },

  // Latest posts in each current course's Announcements forum (forum type 'news').
  async announcements(courses, perForum = 3) {
    if (!courses.length) return [];
    const forums = await this.call('mod_forum_get_forums_by_courses', { courseids: courses.map((c) => c.id) });
    const names = new Map(courses.map((c) => [Number(c.id), c.name]));
    const news = forums.filter((f) => f.type === 'news');
    const lists = await BM.pool(news, 3, async (f) => {
      const d = await this.call('mod_forum_get_forum_discussions', { forumid: f.id, page: 0, perpage: perForum });
      return (d.discussions || []).map((x) => ({
        id: x.discussion,
        title: BM.text(x.name || x.subject),
        author: BM.text(x.userfullname || ''),
        ts: x.timemodified || x.created,
        courseId: Number(f.course),
        courseName: names.get(Number(f.course)) || '',
        url: `/mod/forum/discuss.php?d=${encodeURIComponent(x.discussion)}`,
      }));
    });
    return lists.flat().filter(Boolean).sort((a, b) => b.ts - a.ts);
  },

  mapEvent(e) {
    return {
      id: e.id,
      name: BM.text(e.activityname || e.name),
      kind: BM.text(e.activitystr || ''),
      module: e.modulename,
      ts: e.timesort,
      overdue: !!e.overdue,
      url: e.action?.url || e.url,
      actionName: e.action?.name || 'View',
      courseId: e.course?.id,
      courseName: BM.text(e.course?.fullname || ''),
    };
  },

  // Completed items drop out of action events automatically.
  async deadlines() {
    const d = await this.call('core_calendar_get_action_events_by_timesort', {
      timesortfrom: BM.now() - 30 * 86400, limitnum: 50, limittononsuspendedevents: true, // Moodle caps limitnum at 50
    });
    return d.events.map((e) => this.mapEvent(e));
  },

  async courseDeadlines(courseid) {
    const d = await this.call('core_calendar_get_action_events_by_course', {
      courseid, timesortfrom: BM.now() - 30 * 86400, limitnum: 50,
    });
    return d.events.map((e) => this.mapEvent(e));
  },

  // The course index's own data source: every section and activity in one request.
  async courseState(courseid) {
    return JSON.parse(await this.call('core_courseformat_get_state', { courseid }));
  },
};
