# BetterMoodle (UCL)

A Chrome/Firefox extension that reskins UCL Moodle (`moodle.ucl.ac.uk`) into a minimal interface with deadlines first, every course file on one page, and no tab sprawl.

## Install (unpacked)

**Chrome / Edge / Brave:** go to `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick this folder. After editing files, click the reload icon on the extension card and refresh Moodle.

**Firefox:** go to `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and pick `manifest.json`.

No build step. It's plain JavaScript, so you can edit the files directly.

## What it does (v0.1)

| Feature | Where |
|---|---|
| Minimal reskin: system font, quiet white navbar, no footer, grey icons, compact course header | everywhere |
| **Dashboard:** Due soon (Overdue / Today / Tomorrow / This week / Later, with countdowns) + Courses (starred first). The classic dashboard is one click away. | `/my/` |
| **Whole course on one page:** every section is listed, with file type and size, instead of UCL's one-section-per-page layout | course & section pages |
| **Filter bar:** type to filter (`/` to focus), chips for All / Files / Recordings / Assessments / Forums | course pages |
| **Due in this course** strip | course pages |
| **Side viewer:** PDFs, images, pages, books and folders open in a resizable right panel. `j`/`k` or `↑`/`↓` step through files, `Esc` closes, Ctrl/⌘-click still opens a new tab. | course pages |
| **Ctrl/⌘+K search** across courses, deadlines and every activity in every current course. Files open in the viewer. | everywhere |
| Popup on/off toggle | toolbar |

## How it works

UCL runs a custom theme (`theme_ucl`) and a custom course format (`format_ucl`) that shows **one section per page**. That's why reaching slides takes so many clicks. Rather than restyling that layout, BetterMoodle builds its own course view from data Moodle already serves to its own UI:

| Data | Source |
|---|---|
| Courses | `core_course_get_enrolled_courses_by_timeline_classification` |
| Deadlines | `core_calendar_get_action_events_by_timesort` (max 50 per call; completed items drop out) |
| Course deadlines | `core_calendar_get_action_events_by_course` |
| Every section and activity in a course | `core_courseformat_get_state` (what the course index sidebar uses; about 250 ms) |
| File type, size and description | each section page's HTML (`li.activity` → icon `f/pdf`, `.activitybadge`, `.resourcelinkdetails`), fetched in the background with 3 at a time, cached, and refetched only when the course changes or after 6 h |

All calls go to `/lib/ajax/service.php` with the student's existing session and the `sesskey`, which the content script reads from the page's `M.cfg`. No tokens, no passwords, and nothing leaves the browser except requests to UCL Moodle. Cached data in `chrome.storage.local` is namespaced by Moodle user ID.

Files are served from S3 via presigned redirects with `Content-Disposition: inline` and no frame blocking. The viewer iframes `/mod/resource/view.php?id=…&redirect=1`. Moodle pages shown in the viewer get `html.bm-embed`, which hides the navbar, drawers and footer.

### Fail-safe rules

* All CSS is scoped under `html.bm`. The popup toggle removes the class, so the page goes back to stock Moodle.
* Our views hide the stock content with a `bm-replaced` class, and a "Classic view" link brings it back (remembered per browser).
* If an API call fails, the course view switches to classic and the dashboard shows a message. The stock page always still works.

## Files

```
manifest.json            MV3, matches https://moodle.ucl.ac.uk/*
src/early.js             document_start: adds html.bm (no flash); html.bm-embed inside the viewer iframe
src/lib/util.js          DOM builder (text only, never innerHTML for data), M.cfg reader, date helpers
src/lib/store.js         chrome.storage cache per Moodle user; stale-while-revalidate
src/lib/api.js           Moodle AJAX calls
src/lib/course-data.js   whole-course model (state API + section-page enrichment), sanitiser for label HTML
src/features/viewer.js   split-view file viewer
src/features/course.js   one-page course view, filter bar, due strip
src/features/home.js     dashboard
src/features/palette.js  Ctrl/⌘+K search
src/main.js              on/off switch + routing by <body id>
src/styles/theme.css     the reskin of theme_ucl
src/styles/ui.css        BetterMoodle components
popup/                   on/off toggle
```

### UCL markup reference (checked Nov 2026)

* Dashboard: `body#page-my-index`; block regions in `#topofscroll > .row`
* Course: `body#page-course-view-ucl`, section page `body#page-course-view-section-ucl`, course id in `body.course-<id>`; content in `#page-content`
* Navbar `#ucl-navbar`, footer `#ucl-footer`, mobile tab bar `#ucl-mobile-menu`, activity prev/next `#ucl-section-navigation`, course hero `#course-header-bg`
* Forums are `forum` (Announcements) and `hsuforum` (Open Forum, "Ask a Question"). Recordings are `lti` and `panoptocourseembed`.

## Known limits

* A file the lecturer set to **force download** will download instead of previewing. The type icon doesn't reveal this ahead of time.
* Office files (pptx/docx/xlsx) and archives show an "Open / download" card instead of a preview.
* Ctrl+K builds its index from the course state API (refreshed hourly). File types appear in results once you've opened that course at least once.

## Next (v0.2)

Forum feed (newest first, threaded, staff answers highlighted), drag-and-drop submission, "new since last visit", and submission status on deadlines.
