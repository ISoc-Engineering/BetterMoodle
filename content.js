(async () => {
  'use strict';
  const model = globalThis.BetterMoodleModel;
  const demo = document.documentElement.dataset.bettermoodleDemo === 'true';
  const base = demo ? 'https://moodle.ucl.ac.uk/course/view.php?id=101' : location.href;
  if (!model || (!demo && !model.supported(base, document.body)) || document.getElementById('bettermoodle-root')) return;
  let layout = 'list', query = '', filter = 'all', selected = '', preview = false, popup = false, mode = 'hub', theme = 'classic';
  try {
    const saved = demo ? localStorage.getItem('bettermoodle-demo-layout') : (await chrome.storage.local.get('layout')).layout;
    if (saved === 'list' || saved === 'grid') layout = saved;
  } catch { /* Storage is optional. */ }
  try {
    const saved = demo ? localStorage.getItem('bettermoodle-demo-theme') : (await chrome.storage.local.get('theme')).theme;
    if (saved === 'tracker') theme = saved;
  } catch { /* Storage is optional. */ }
  let data = model.extract(document, base);
  function readData() {
    const next = model.extract(document, base);
    for (const course of next.courses) {
      const previous = data.courses.find(item => item.url === course.url);
      course.image ||= previous?.image || '';
      course.imageAlt ||= previous?.imageAlt || '';
    }
    return next;
  }
  function stableCover(url) {
    try {
      const u = new URL(url);
      return u.origin === location.origin && /^\/pluginfile\.php\//.test(u.pathname) && ![...u.searchParams.keys()].some(k => /token|signature|expires|x-amz-/i.test(k)) ? u.href : '';
    } catch { return ''; }
  }
  async function rememberDashboardImages(courses = data.courses) {
    if (demo || data.isCourse || !courses.length) return;
    const covers = Object.fromEntries(courses.map(c => [new URL(c.url).searchParams.get('id'), stableCover(c.image)]).filter(([id, image]) => id && image));
    if (!Object.keys(covers).length) return;
    try {
      const current = (await chrome.storage.local.get('courseCovers')).courseCovers || {};
      const next = {...current, ...covers};
      if (JSON.stringify(current) !== JSON.stringify(next)) await chrome.storage.local.set({courseCovers:next});
    } catch { /* Real Moodle images still work in the current page when storage is unavailable. */ }
  }
  async function loadDashboardImages() {
    if (demo || !data.isCourse) return;
    try {
      const id = courseId();
      const course = data.courses.find(c => new URL(c.url).searchParams.get('id') === id);
      if (!course || stableCover(course.image)) return;
      const cached = (await chrome.storage.local.get('courseCovers')).courseCovers?.[id];
      if (course && stableCover(cached)) { course.image = cached; render(); return; }
      const response = await fetch('/my/', {credentials:'same-origin', redirect:'follow'});
      if (!response.ok || new URL(response.url).origin !== location.origin) return;
      const dashboard = new DOMParser().parseFromString(await response.text(), 'text/html');
      const cards = model.extract(dashboard, response.url).courses;
      const match = cards.find(c => new URL(c.url).searchParams.get('id') === id && c.image);
      if (match && stableCover(match.image)) { course.image = match.image; course.imageAlt = match.imageAlt; render(); }
    } catch { /* Course content remains usable when dashboard imagery is unavailable. */ }
  }
  const host = document.createElement('div'); host.id = 'bettermoodle-root';
  const shadow = host.attachShadow({mode:'open'});
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = demo ? '../extension/ui.css' : chrome.runtime.getURL('ui.css'); shadow.append(css);
  const themeCSS = document.createElement('link'); themeCSS.rel = 'stylesheet'; themeCSS.href = demo ? '../extension/tracker.css' : chrome.runtime.getURL('tracker.css'); shadow.append(themeCSS);
  const app = document.createElement('div'); shadow.append(app); document.body.append(host);
  const moodleLogo = () => demo ? '<span class="icon icon-book" aria-hidden="true"></span>' : `<img class="moodle-logo" src="${esc(data.logo || '/theme/ucl/pix/headerlogo.svg')}" alt="UCL Moodle">`;
  const originals = new Map(), openSections = new Map(); let savedOverflow, hubScrollTop = 0;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<span class="icon icon-${name}" aria-hidden="true"></span>`;
  const link = (url, label, cls='') => `<a class="${cls}" href="${esc(url)}">${esc(label)} ${icon('arrow')}</a>`;
  const courseId = () => data.courseId;
  function protectOriginal() {
    if (mode === 'original') {
      for (const [node, old] of originals) { node.inert = old.inert; if (old.aria === null) node.removeAttribute('aria-hidden'); else node.setAttribute('aria-hidden', old.aria); }
      originals.clear(); if (savedOverflow !== undefined) document.body.style.overflow = savedOverflow; savedOverflow = undefined;
      return;
    }
    if (savedOverflow === undefined) savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    for (const node of document.body.children) if (node !== host && !originals.has(node)) { originals.set(node,{inert:node.inert,aria:node.getAttribute('aria-hidden')}); node.inert = true; node.setAttribute('aria-hidden','true'); }
  }
  const palette = ['#FF5C8A','#FFD23F','#3EC1D3','#7CFF6B','#FF9F1C','#B28DFF'];
  function resourceRows(rows) {
    return rows.map(r => `<button style="--c:${palette[data.resources.indexOf(r)%6]}" class="resource ${selected===r.url?'selected':''}" data-action="resource" data-url="${esc(r.url)}" aria-pressed="${selected===r.url}">${resourceIcon(r)}<span class="resource-name"><strong>${esc(r.title)}</strong><small>${esc(r.kind)}</small></span>${icon('arrow')}</button>`).join('');
  }
  function resourceIcon(r) {
    const glyph = r.kind === 'PDF' ? 'file' : r.kind === 'Activity' ? 'section' : r.kind === 'Reading' ? 'book' : 'file';
    return `<span class="resource-icon">${r.iconURL?`<img src="${esc(r.iconURL)}" alt="">`:icon(glyph)}</span>`;
  }
  function reader() {
    const r = data.resources.find(x => x.url === selected);
    if (!r) return `<aside class="reader empty-reader"><span class="reader-symbol">${icon('book')}</span><h2>Choose a resource</h2><p>Its section and Moodle link will stay here while you browse.</p></aside>`;
    return `<aside class="reader"><div class="reader-head"><span>${esc(r.kind)}</span><button data-action="close" aria-label="Close details">${icon('close')}</button></div><h2>${esc(r.title)}</h2><p>${esc(r.section)} · ${esc(data.title)}</p><div class="reader-actions">${link(r.url,'Open in Moodle','primary')}${r.preview?`<button data-action="preview">${preview?'Reload':'Preview'} PDF</button>`:''}</div>${preview&&r.preview?`<iframe title="Preview ${esc(r.title)}" src="${esc(r.url)}" referrerpolicy="same-origin"></iframe>`:`<div class="reader-placeholder">${icon('file')}<p>${r.preview?'Preview the PDF here or open it in Moodle.':'Activities continue on their Moodle page.'}</p></div>`}</aside>`;
  }
  function timeline() {
    if (!data.deadlines.length) return '';
    const days = new Map();
    data.deadlines.forEach(item => { const day=item.date || 'Date not listed by Moodle'; if (!days.has(day)) days.set(day,[]); days.get(day).push(item); });
    return `<section class="timeline"><h2>Timeline</h2><ol>${[...days].map(([day,items])=>`<li class="timeline-day"><span class="timeline-marker" aria-hidden="true"></span><h3>${esc(day)}</h3><ol>${items.map(item=>`<li class="timeline-event">${item.time?`<span class="timeline-time">${esc(item.time)}</span>`:''}<div><a href="${esc(item.url)}">${esc(item.title)}</a>${item.detail?`<p>${esc(item.detail)}</p>`:''}</div></li>`).join('')}</ol></li>`).join('')}</ol></section>`;
  }
  function forumUpdates() {
    return `<section class="forum-updates" aria-labelledby="forum-heading"><h2 id="forum-heading">Forum updates</h2>${data.forumUpdates.length?`<ul>${data.forumUpdates.map(post=>`<li><a href="${esc(post.url)}">${esc(post.title)} ${icon('arrow')}</a>${post.detail?`<p>${esc(post.detail)}</p>`:''}${post.date?`<small>${esc(post.date)}</small>`:''}</li>`).join('')}</ul>`:'<p class="empty">No forum updates are listed on this Moodle page.</p>'}</section>`;
  }
  let themeEntered = false;
  function render() {
    app.dataset.theme = theme;
    const oldShell = app.querySelector('.shell');
    if (oldShell && !oldShell.classList.contains('original-shell')) {
      hubScrollTop = oldShell.scrollTop;
      for (const node of app.querySelectorAll('details[data-section]')) openSections.set(node.dataset.section, node.open);
    }
    const scrollTop = mode === 'hub' ? hubScrollTop : 0;
    const focus = shadow.activeElement;
    const focusKey = focus?.id ? `#${focus.id}` : focus?.dataset.action ? `[data-action="${focus.dataset.action}"]${focus.dataset.url ? `[data-url="${CSS.escape(focus.dataset.url)}"]` : ''}` : null;
    const selection = focus?.id === 'search' ? [focus.selectionStart, focus.selectionEnd] : null;
    const resources = data.resources.filter(r => (!query || `${r.title} ${r.section} ${r.kind}`.toLowerCase().includes(query.toLowerCase())) && (filter==='all'||(filter==='slides'?r.slides:r.kind===filter)));
    const sections = [...new Set([...data.sections.map(s=>s.title),...data.resources.map(r=>r.section)])];
    const image = stableCover(data.courses.find(c=>new URL(c.url).searchParams.get('id')===courseId())?.image);
    const cover = image ? `<img class="course-image" src="${esc(image)}" alt="${esc(data.title)} course image">` : `<div class="course-placeholder">${icon('book')}<span>${esc(data.title)}</span></div>`;
    const tools = `<div class="tools"><label>${icon('search')}<input id="search" type="search" value="${esc(query)}" placeholder="Search this course" aria-label="Search this course"></label><select id="kind" aria-label="Filter resources">${[['all','All materials'],['slides','Lecture slides'],['PDF','PDFs'],['Activity','Activities'],['Folder','Folders'],['Reading','Readings'],['Link','Links']].map(([v,l])=>`<option value="${v}" ${filter===v?'selected':''}>${l}</option>`).join('')}</select></div>`;
    const groups = sections.map((name,i)=>{ const rows=resources.filter(r=>r.section===name); if ((query||filter!=='all')&&!rows.length) return ''; const sectionImage=data.sections.find(s=>s.title===name)?.image; return `<details class="section" style="--c:${palette[i%6]};--i:${i}" data-section="${esc(name)}" ${query||filter!=='all'||(openSections.get(name) ?? i===0)?'open':''}><summary><span class="section-icon">${sectionImage?`<img src="${esc(sectionImage)}" alt="">`:icon('section')}</span><span><strong>${esc(name)}</strong><small>${rows.length} ${rows.length===1?'item':'items'}</small></span>${icon('arrow')}</summary><div class="section-items ${layout}">${rows.length?resourceRows(rows):'<p class="empty">No materials are listed in this section.</p>'}</div></details>`;}).join('');
    const coursePicker = `<div class="home-layout"><section class="course-picker"><div class="content-head"><div><span class="eyebrow">YOUR COURSES</span><h1>${esc(data.title)}</h1></div></div><div class="course-links">${data.courses.length?data.courses.map((c,i)=>`<a class="course-link" style="--c:${palette[i%6]};--i:${i}" href="${esc(c.url)}">${c.image?`<img src="${esc(c.image)}" alt="">`:`<span class="course-link-mark">${icon('book')}</span>`}<span><strong>${esc(c.title)}</strong>${c.category?`<small>${esc(c.category)}</small>`:''}</span>${icon('arrow')}</a>`).join(''):'<p class="empty">No course cards are currently available on this Moodle page.</p>'}</div><footer>Course titles and images are supplied by Moodle. <button class="text-button" data-action="refresh">Refresh</button></footer></section><aside class="home-updates" aria-label="Study updates">${timeline() || '<section class="timeline"><h2>Timeline</h2><p class="empty">No deadlines are listed on this Moodle page.</p></section>'}${forumUpdates()}</aside></div>`;
    const courseView = `<div class="course-head">${cover}<div><span class="eyebrow">YOUR COURSE</span><h1>${esc(data.title)}</h1><p>Pick a section and continue with its materials.</p>${data.resources.length?`<button class="start" data-action="resource" data-url="${esc(data.resources[0].url)}">Continue with ${esc(data.resources[0].title)} ${icon('arrow')}</button>`:''}</div></div><div class="learning-layout"><section class="course-content"><div class="content-head"><div><span class="eyebrow">COURSE CONTENT</span><h2>Sections and materials</h2></div><button class="layout-toggle" data-action="layout" aria-label="Switch to ${layout==='list'?'grid':'list'} view">${icon(layout==='list'?'grid':'list')} ${layout==='list'?'Grid':'List'}</button></div>${tools}<div class="sections">${groups||`<p class="empty">${data.resources.length?'No materials match your search.':'No course materials are available in this Moodle page.'}</p>`}</div></section>${reader()}</div>${timeline()}<footer><span>Course links and materials come from Moodle.</span><button class="text-button" data-action="refresh">Refresh</button></footer>`;
    const body = mode==='original' ? '' : `<header class="topbar"><a class="brand" href="https://moodle.ucl.ac.uk/my/">${icon('book')}<span>BetterMoodle</span></a><span class="top-course">${esc(data.title)}</span><button class="original" data-action="original">${moodleLogo()}<span>Original Moodle</span></button></header><main>${data.isCourse?courseView:coursePicker}</main>`;
    const markup = `<div class="shell ${mode==='original'?'original-shell':''}">${body}<div class="corner">${popup?`<div class="popup"><button data-action="theme" aria-pressed="${theme==='tracker'}">${icon('grid')}<span>${theme==='tracker'?'Use Minimal theme':'Use Pop! theme'}</span></button><button data-action="original">${mode==='original'?icon('book'):moodleLogo()}<span>${mode==='original'?'Return to learning hub':'Show original Moodle'}</span>${icon('arrow')}</button></div>`:''}<button class="corner-button" data-action="popup" aria-expanded="${popup}">${icon('grid')}<span>${mode==='original'?'BetterMoodle':'View options'}</span></button></div></div>`;
    if (oldShell && mode === 'hub' && !oldShell.classList.contains('original-shell') && data.isCourse) {
      // Keep the scroll container and unchanged reader (including its live PDF frame).
      const template = document.createElement('template'); template.innerHTML = markup;
      for (const selector of ['.topbar', '.course-head', '.course-content', '.reader', 'footer', '.corner']) {
        const current = oldShell.querySelector(selector), next = template.content.querySelector(selector);
        if (current && next && current.outerHTML !== next.outerHTML) current.replaceWith(next);
      }
      const current = oldShell.querySelector('.timeline'), next = template.content.querySelector('.timeline');
      if (current && !next) current.remove();
      else if (!current && next) oldShell.querySelector('footer').before(next);
      else if (current && next && current.outerHTML !== next.outerHTML) current.replaceWith(next);
    } else app.innerHTML = markup;
    if (theme==='tracker' && !themeEntered) {
      themeEntered=true;
      app.querySelectorAll('.section,.course-link').forEach((row,i)=>{
        row.classList.add('tracker-enter');row.style.animationDelay=`${i*70}ms`;
        row.addEventListener('animationend',()=>row.classList.remove('tracker-enter'),{once:true});
      });
    }
    protectOriginal();
    if (focusKey) {
      const nextFocus = app.querySelector(focusKey);
      nextFocus?.focus({preventScroll:true});
      if (selection && nextFocus) nextFocus.setSelectionRange(...selection);
    }
    app.querySelector('.shell').scrollTop = scrollTop;
  }
  app.addEventListener('click', async e=>{const a=e.target.closest('a.course-link'); if(!a||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||a.target==='_blank')return; e.preventDefault(); await rememberDashboardImages().catch(()=>{}); location.assign(a.href);});
  app.addEventListener('click', async e=>{const b=e.target.closest('button[data-action]'); if(!b)return; const a=b.dataset.action;
    if(a==='popup') popup=!popup;
    if(a==='theme') {
      theme=theme==='classic'?'tracker':'classic';
      try { if(demo)localStorage.setItem('bettermoodle-demo-theme',theme);else await chrome.storage.local.set({theme}); } catch { /* Keep the theme usable without storage. */ }
    }
    if(a==='original') {mode=mode==='original'?'hub':'original';popup=false;if(mode==='hub')data=readData();}
    if(a==='layout') {layout=layout==='list'?'grid':'list';popup=false;try{if(demo)localStorage.setItem('bettermoodle-demo-layout',layout);else await chrome.storage.local.set({layout});}catch{}}
    if(a==='resource'){selected=b.dataset.url;preview=false;}
    const closedURL = a==='close' ? selected : '';
    if(a==='close'){selected='';preview=false;}
    if(a==='preview') {if(preview)app.querySelector('.reader iframe')?.remove();preview=true;}
    if(a==='refresh'){data=readData();loadDashboardImages();}
    render();
    if(a==='original') app.querySelector(mode==='original' ? '.corner-button' : '.original')?.focus({preventScroll:true});
    if(a==='resource' && matchMedia('(max-width:760px)').matches) app.querySelector('.reader')?.scrollIntoView({block:'start'});
    if(a==='close') app.querySelector(`.resource[data-url="${CSS.escape(closedURL)}"]`)?.focus({preventScroll:true});
  });
  app.addEventListener('input',e=>{if(e.target.id==='search'){query=e.target.value;render();}});
  app.addEventListener('change',e=>{if(e.target.id==='kind'){filter=e.target.value;render();}});
  shadow.addEventListener('keydown',e=>{if(e.key==='Escape'&&popup){popup=false;render();app.querySelector('.corner-button')?.focus({preventScroll:true});}});
  let timer; new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>{if(mode==='original')return;const next=readData();if(JSON.stringify(data)!==JSON.stringify(next)){data=next;render();rememberDashboardImages(next.courses);}},400);}).observe(document.body,{childList:true,subtree:true,characterData:true});
  const ring = document.createElement('div'); ring.className='tracker-cursor'; ring.setAttribute('aria-hidden','true'); shadow.append(ring);
  const finePointer = matchMedia('(pointer: fine)'), reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  shadow.addEventListener('pointermove', e=>{
    const enabled=theme==='tracker' && mode==='hub' && finePointer.matches && !reducedMotion.matches;
    ring.classList.toggle('on',enabled);
    ring.style.transform=`translate(${e.clientX-20}px,${e.clientY-20}px)`;
    ring.classList.toggle('hot',!!e.target.closest('button,input,select,label,a,summary'));
  });
  shadow.addEventListener('pointerdown',()=>ring.classList.add('down'));
  window.addEventListener('pointerup',()=>ring.classList.remove('down'));
  host.addEventListener('pointerleave',()=>ring.classList.remove('on'));
  reducedMotion.addEventListener('change',()=>ring.classList.remove('on'));
  render(); rememberDashboardImages(); loadDashboardImages();
})();
