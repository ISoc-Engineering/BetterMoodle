(() => {
  'use strict';
  const clean = value => (value || '').replace(/\s+/g, ' ').trim();
  function label(node) {
    if (!node) return '';
    const copy = node.cloneNode(true);
    copy.querySelectorAll('.accesshide,.sr-only,.visually-hidden,.badge').forEach(el => el.remove());
    return clean(copy.textContent);
  }
  function safeURL(value, base) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, base);
      return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  }
  function supported(url, body) {
    const u = new URL(url);
    return (/^\/my\/(?:index\.php|courses\.php)?$/.test(u.pathname) || /^\/course\/(?:view|section)\.php$/.test(u.pathname)) &&
      !u.searchParams.has('sesskey') && !u.searchParams.has('edit') && !u.searchParams.has('action') && !body?.classList.contains('editing');
  }
  function extract(doc, base) {
    const origin = new URL(base).origin;
    const courses = [], resources = [], deadlines = [], sections = [];
    const logo = [...doc.querySelectorAll('img.logo-white, img.logo-yellow, img[alt*="Moodle"]')].find(img => safeURL(img.getAttribute('src'), base) && new URL(safeURL(img.getAttribute('src'), base)).origin === origin);
    function imageFromBackground(node) {
      const computed = node && (node.style?.backgroundImage || (node.ownerDocument === doc ? getComputedStyle(node).backgroundImage : ''));
      const match = computed && computed.match(/^url\(["']?(.*?)["']?\)$/);
      const url = match && safeURL(match[1], base);
      return url && new URL(url).origin === origin ? url : '';
    }
    function imageIn(node) {
      if (!node) return '';
      const image = safeURL(node.getAttribute?.('src'), base) || imageFromBackground(node) || [...node.querySelectorAll('*')].map(imageFromBackground).find(Boolean);
      return image && new URL(image).origin === origin ? image : '';
    }
    const seen = {courses: new Set(), resources: new Set(), deadlines: new Set(), sections: new Set()};
    function add(collection, item) {
      if (!item.url || !item.title) return;
      if (seen[collection].has(item.url)) {
        if (collection === 'courses') {
          const course = courses.find(existing => existing.url === item.url);
          if (course) { course.image ||= item.image; course.imageAlt ||= item.imageAlt; course.category ||= item.category; }
        }
        return;
      }
      seen[collection].add(item.url);
      ({courses, resources, deadlines, sections})[collection].push(item);
    }
    function urlFor(a) { return safeURL(a?.getAttribute('href'), base); }
    function resourceURL(a) {
      const url = urlFor(a);
      if (!url) return null;
      const stable = new URL(url);
      stable.searchParams.delete('forceview');
      return stable.href;
    }
    const title = label(doc.querySelector('#page-header h1, .page-header-headings h1, main h1, h1')) || 'Your Moodle';
    const isCourse = /^\/course\//.test(new URL(base).pathname);
    if (isCourse) add('courses', {title, url: `${origin}/course/view.php?id=${encodeURIComponent(new URL(base).searchParams.get('id') || '')}`, category: '', image: '', imageAlt: ''});
    doc.querySelectorAll('.pickup-card, [data-region="course-content"][data-course-id], .dashboard-card').forEach(card => {
      const a = card.querySelector('a[href*="/course/view.php"]');
      if (a) {
        const imageNode = card.querySelector('.dashboard-card-img, .dashboard-card-img-container, .bg-cover, img.courseimage, img');
        const cleanImage = imageIn(imageNode) || imageIn(card);
        add('courses', {title: label(a), url: urlFor(a), category: label(card.querySelector('.categoryname, .text-muted')), image: cleanImage, imageAlt: imageNode?.getAttribute('alt') || ''});
      }
    });
    doc.querySelectorAll('.courseindex-section[data-for="section"]').forEach(section => {
      const a = section.querySelector('a[data-for="section_title"]');
      if (a) {
        const imageNode = section.querySelector('img:not(.activityicon), .section-summary img, .summary img');
        add('sections', {title: label(a), url: urlFor(a), image: imageIn(imageNode) || imageIn(section), imageAlt: imageNode?.getAttribute('alt') || ''});
      }
    });
    function resource(a, container, section) {
      const url = resourceURL(a);
      if (!url || new URL(url).origin !== origin || !/\/(?:mod\/[a-z]+\/view\.php|pluginfile\.php)/.test(new URL(url).pathname)) return;
      const name = label(a);
      const module = new URL(url).pathname.match(/\/mod\/([^/]+)\//)?.[1] || 'file';
      const metadata = [container?.getAttribute('data-search'), container?.querySelector('img')?.getAttribute('src'), container?.querySelector('img')?.getAttribute('alt')].join(' ');
      const pdf = /\.pdf(?:$|[?#])|\/f\/pdf\b|\bpdf\b/i.test(url + ' ' + name + ' ' + metadata);
      const kind = /assign|quiz|forum|feedback|choice|lesson|workshop/.test(module) ? 'Activity' : pdf ? 'PDF' : module === 'folder' ? 'Folder' : module === 'url' ? 'Link' : module === 'page' || module === 'book' ? 'Reading' : 'File';
      const sourceImage = container?.querySelector('img.activityicon, img.activityiconcontainer, .activityiconcontainer img, img');
      const iconURL = safeURL(sourceImage?.getAttribute('src'), base);
      const icon = iconURL && new URL(iconURL).origin === origin ? iconURL : '';
      const known = resources.find(item => item.url === url);
      if (known) {
        known.iconURL ||= icon;
        known.iconAlt ||= sourceImage?.getAttribute('alt') || '';
        known.kind = kind === 'File' && known.kind !== 'File' ? known.kind : kind;
        known.slides ||= /lecture|slides?|presentation/i.test(name);
        known.preview ||= pdf && /^(resource|file)$/.test(module);
      } else add('resources', {title: name, url, section: clean(section) || 'Course resources', kind, module, iconURL: icon, iconAlt: sourceImage?.getAttribute('alt') || '', slides: /lecture|slides?|presentation/i.test(name), preview: pdf && /^(resource|file)$/.test(module)});
    }
    // UCL's course index includes sections not currently shown in the main course page.
    doc.querySelectorAll('.courseindex-section [data-for="cm"] a[data-for="cm_name"]').forEach(a => {
      const section = a.closest('.courseindex-section');
      resource(a, a.closest('[data-for="cm"]'), label(section?.querySelector('[data-for="section_title"]')));
    });
    doc.querySelectorAll('.ucl-incourse-search-mod').forEach(row => {
      const a = row.matches('a') ? row : row.querySelector('a[href]');
      if (!a) return;
      resource(a, row, label(row.querySelector('small')));
      const known = resources.find(r => r.url === resourceURL(a));
      if (known && /\/f\/pdf\b/.test(row.querySelector('img')?.getAttribute('src') || '')) { known.kind = 'PDF'; known.preview = known.module === 'resource'; }
    });
    doc.querySelectorAll('.activity a.aalink, .activityinstance a[href], [data-for="cmitem"] a[href*="/mod/"]').forEach(a => {
      const section = a.closest('[data-for="section"], .section');
      const container = a.closest('.activity, [data-for="cmitem"]');
      resource(a, container, section?.getAttribute('data-sectionname') || label(section?.querySelector('.sectionname, .section-title, h3')));
      const known = resources.find(r => r.url === resourceURL(a));
      if (known && /PDF/i.test(label(container?.querySelector('.activitybadge')))) { known.kind = 'PDF'; known.preview = known.module === 'resource'; }
    });
    doc.querySelectorAll('[data-block="timeline"] [data-region="event-list-item"]').forEach(event => {
      const a = event.querySelector('.event-name a');
      const group = event.closest('.list-group');
      const date = group?.previousElementSibling;
      const dateText = date?.matches('[data-region="event-list-content-date"]') ? label(date) : '';
      add('deadlines', {title: label(a), url: urlFor(a), detail: label(event.querySelector('.event-name-container > small')), date: dateText, time: label(event.querySelector('.timeline-name > small'))});
    });
    return {title, isCourse, courses, resources, sections, deadlines, logo: logo ? safeURL(logo.getAttribute('src'), base) : ''};
  }
  globalThis.BetterMoodleModel = {clean, safeURL, supported, extract};
})();
