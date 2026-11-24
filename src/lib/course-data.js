// Builds one model of a whole course: every section and activity on a single page.
//
// UCL's course format shows one section per page, so we combine two sources:
//   1. core_courseformat_get_state: all sections and activities in one fast request
//   2. each section page's HTML: file type, size and description, which the state doesn't carry.
// (2) is cached and only refetched when the course changes, or after 6 hours.
var BM = globalThis.BM;

BM.courseData = {
  ENRICH_MAX_AGE: 6 * 3600 * 1000,

  FILE_MODS: ['resource', 'folder', 'page', 'book', 'url'],
  ASSESS_MODS: ['assign', 'quiz', 'turnitintooltwo', 'workshop', 'coursework', 'lesson'],
  FORUM_MODS: ['forum', 'hsuforum'],
  RECORDING_MODS: ['lti', 'panoptocourseembed'],
  PREVIEWABLE: ['pdf', 'image', 'video', 'audio', 'text', 'html', 'sourcecode', 'markup'],

  category(item) {
    const m = item.module;
    if (this.FILE_MODS.includes(m)) return 'files';
    if (this.ASSESS_MODS.includes(m)) return 'assess';
    if (this.FORUM_MODS.includes(m)) return 'forums';
    if (this.RECORDING_MODS.includes(m)) return 'recordings';
    return 'other';
  },

  // Lecture slides: a file or folder whose name says so. Used by the "Slides" filter chip.
  SLIDES_RE: /\b(lecture|lec\s?\d|slides?|presentation|ppt)\b/i,
  isSlides(item) {
    return ['resource', 'folder'].includes(item.module) && this.SLIDES_RE.test(`${item.name} ${item.badge || ''}`);
  },

  // How the side viewer should treat an item:
  //   'frame' shows it inside the panel, 'card' shows a download/open card, null means a normal link.
  // External links (mod_url) stay normal links so j/k only steps through actual course material.
  viewMode(item) {
    switch (item.module) {
      case 'page': case 'book': case 'folder': case 'discussion': return 'frame';
      case 'resource':
        if (!item.type) return 'card';
        return this.PREVIEWABLE.includes(item.type) ? 'frame' : 'card';
      default: return null;
    }
  },

  frameUrl(item) {
    if (item.module === 'resource') return `/mod/resource/view.php?id=${item.id}&redirect=1`;
    return item.url;
  },

  fromState(st) {
    const cms = new Map(st.cm.map((c) => [String(c.id), c]));
    const sections = st.section
      .filter((s) => s.visible !== false)
      .map((s) => ({
        id: String(s.id),
        number: s.number,
        title: BM.text(s.title),
        url: s.sectionurl,
        current: !!s.current,
        items: s.cmlist
          .map((id) => cms.get(String(id)))
          .filter((c) => c && c.uservisible !== false)
          .map((c) => ({
            id: String(c.id),
            name: BM.text(c.name),
            module: c.module,
            url: c.url || null,
            sectionId: String(s.id),
          })),
      }));
    return {
      id: Number(st.course.id),
      rev: String(st.course.statekey || '').split('_')[0],
      sections,
    };
  },

  parseSectionPage(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = {};
    for (const li of doc.querySelectorAll('li.activity[data-id], li.activity[id^="module-"]')) {
      const id = li.dataset.id || li.id.replace('module-', '');
      const icon = li.querySelector('img.activityicon, .activityiconcontainer img')?.getAttribute('src') || '';
      const type = (icon.match(/\/f\/([a-z0-9_-]+)/i) || [])[1] || null;
      const desc = li.querySelector('.activity-altcontent, .activity-description, .contentafterlink, .description-inner');
      out[id] = {
        icon,
        type: type && type.replace(/-\d+$/, ''),
        badge: li.querySelector('.activitybadge')?.textContent.trim() || '',
        size: li.querySelector('.resourcelinkdetails')?.textContent.replace(/\s+/g, ' ').trim() || '',
        desc: desc ? desc.innerHTML.trim() : '',
      };
    }
    return out;
  },

  merge(model, enrich) {
    for (const s of model.sections) for (const it of s.items) Object.assign(it, enrich[it.id] || {});
    return model;
  },

  items(model) { return model.sections.flatMap((s) => s.items); },

  // Aggressive mode: UCL's template sections that every course has but students rarely need.
  // Matched loosely because titles vary between modules (COMP0023 has "Module Comunication").
  NOISE_SECTIONS: [/^general$/i, /^module\s+comm?unications?$/i, /^module\s+surveys?$/i],

  isNoise(section) {
    const t = (section.title || '').trim();
    return section.number === 0 || this.NOISE_SECTIONS.some((re) => re.test(t));
  },

  // Sections the course view shows, honouring aggressive mode.
  visibleSections(model) {
    const aggressive = BM.settings?.aggressive;
    return model.sections.filter((s) => s.items.length && !(aggressive && this.isNoise(s)));
  },

  // Calls onUpdate(model) whenever there's something better to show: cache, then state, then enriched.
  async load(courseId, onUpdate) {
    const key = `course:${courseId}`;
    const hit = await BM.store.get(key);
    if (hit?.v?.model) onUpdate(this.merge(hit.v.model, hit.v.enrich || {}), { cached: true });

    let model;
    try {
      model = this.fromState(await BM.api.courseState(courseId));
    } catch (e) {
      if (!hit) throw e;
      return;
    }

    const prev = hit?.v || {};
    const ids = this.items(model).map((i) => i.id);
    const fresh = prev.enrich && prev.rev === model.rev && hit && Date.now() - hit.t < this.ENRICH_MAX_AGE &&
      ids.every((id) => id in prev.enrich);
    let enrich = { ...(prev.enrich || {}) };
    onUpdate(this.merge(model, enrich), { cached: false, enriching: !fresh });
    if (fresh) { await BM.store.set(key, { model, enrich, rev: model.rev }); return; }

    const sections = model.sections.filter((s) => s.items.length && s.url);
    await BM.pool(sections, 3, async (s) => {
      const res = await fetch(s.url, { credentials: 'same-origin' });
      if (!res.ok) return;
      Object.assign(enrich, this.parseSectionPage(await res.text()));
    });
    await BM.store.set(key, { model, enrich, rev: model.rev });
    onUpdate(this.merge(model, enrich), { cached: false, enriching: false });
  },
};

// Moodle-authored HTML (labels, descriptions) cached from UCL's own pages. Parsed inertly,
// stripped of scripts and inline handlers, then adopted. Same content Moodle itself would show.
BM.safeFragment = (html) => {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  doc.querySelectorAll('script, style, link, meta, object, embed, form, base').forEach((n) => n.remove());
  for (const el of doc.body.querySelectorAll('*')) {
    for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name)) el.removeAttribute(a.name);
      else if (/^(href|src|action|formaction|xlink:href)$/i.test(a.name) && /^\s*javascript:/i.test(a.value)) el.removeAttribute(a.name);
    }
    if (el.tagName === 'IFRAME' || el.tagName === 'IMG') el.setAttribute('loading', 'lazy');
    if (el.tagName === 'A' && el.getAttribute('href') === '#') el.remove();
  }
  const frag = document.createDocumentFragment();
  for (const n of [...doc.body.firstChild.childNodes]) frag.append(document.adoptNode(n));
  return frag;
};
