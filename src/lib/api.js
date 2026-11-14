// Calls Moodle's own AJAX endpoint (the same one the stock dashboard uses), authenticated by
// the student's existing session cookie + sesskey. No tokens, no extra permissions.
(() => {
  const BM = globalThis.BM;

  async function call(methodname, args = {}) {
    const sesskey = BM.sesskey();
    if (!sesskey) throw new Error('No sesskey on page (not logged in?)');
    const url = `${BM.wwwroot()}/lib/ajax/service.php?sesskey=${encodeURIComponent(sesskey)}&info=${methodname}`;
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ index: 0, methodname, args }]),
    });
    const json = await res.json();
    const r = Array.isArray(json) ? json[0] : json;
    if (!r || r.error) {
      const msg = r?.exception?.message || (typeof r?.error === 'string' ? r.error : 'Moodle API error');
      throw new Error(`${methodname}: ${msg}`);
    }
    return r.data;
  }

  BM.api = {
    call,

    async courses() {
      const data = await call('core_course_get_enrolled_courses_by_timeline_classification', {
        offset: 0,
        limit: 0,
        classification: 'inprogress',
        sort: 'fullname',
      });
      return (data.courses || []).map((c) => ({
        id: String(c.id),
        name: BM.decode(c.fullnamedisplay || c.fullname),
        short: BM.decode(c.shortname),
        url: c.viewurl,
        fav: !!c.isfavourite,
      }));
    },

    /** Incomplete action events (assignments, quizzes, ...) from 14 days ago to 60 days ahead. */
    async deadlines() {
      const now = Math.floor(Date.now() / 1000);
      const data = await call('core_calendar_get_action_events_by_timesort', {
        timesortfrom: now - 14 * 86400,
        timesortto: now + 60 * 86400,
        limitnum: 50,
        limittononsuspendedevents: true,
      });
      return (data.events || []).map((e) => ({
        id: e.id,
        name: BM.decode(e.activityname || e.name),
        time: e.timesort,
        url: e.action?.url || e.url,
        mod: e.modulename,
        course: e.course
          ? { id: String(e.course.id), name: BM.decode(e.course.fullname), short: BM.decode(e.course.shortname) }
          : null,
      }));
    },
  };
})();
