// Every Moodle DOM assumption lives here. These target stock Moodle 4.x (Boost theme).
// When adapting to UCL's exact markup, this should be the main file that needs edits.
(() => {
  const BM = globalThis.BM;

  BM.SEL = {
    // Page regions
    main: '#region-main, [role="main"]',
    navbar: 'nav.navbar.fixed-top, .navbar.fixed-top',
    userNav: '#usernavigation, .usernav, .navbar .ml-auto, .navbar .ms-auto',
    pageTitle: '.page-header-headings h1, #page-header h1, h1',

    // Pages, matched against <body id> / <body class>
    homePageIds: ['page-my-index'],
    coursePageClass: 'path-course-view',
    sectionPageIds: ['page-course-section'],
    loginPageIds: ['page-login-index'],

    // Course content
    courseContent: '.course-content',
    section: 'li.section, .course-section',
    sectionName: '.sectionname, .course-section-header h3, h3',
    activity: 'li.activity',
    activityLink: 'a.aalink, .activityname a, .activity-instance a',
    activityName: '.instancename',
    activityIcon: 'img.activityicon, .activityiconcontainer img, img.iconlarge',
    hiddenText: '.accesshide, .sr-only, .visually-hidden',
    collapsedSection: '.course-content-item-content.collapse, .section .content .collapse',

    // Classic dashboard blocks we hide behind "Show classic dashboard"
    classicDashboard: '#block-region-content, [data-region="blocks-column"], .block-region',
  };

  /** Activity types (modtype_*) grouped for the course filter chips. */
  BM.MODS = {
    files: ['resource', 'folder', 'page', 'book', 'url'],
    assessments: ['assign', 'quiz', 'turnitintooltwo', 'workshop', 'lti'],
    forums: ['forum', 'hsuforum'],
    // Opened in the side viewer instead of a new page.
    viewer: ['resource', 'page', 'folder', 'book'],
  };
})();
