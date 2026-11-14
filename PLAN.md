# BetterMoodle: Plan

A Chrome/Firefox extension that reskins **UCL Moodle** (`moodle.ucl.ac.uk`) into a minimal interface that puts the most important information first.

## 1. Problem

User testing shows that Moodle is used for five things about 99% of the time:

1. Viewing lecture slides
2. Checking deadlines
3. Finding course resources (for projects)
4. Submitting work
5. Forums, the only way to get feedback from lecturers online

Moodle's interface isn't built around these. Pain points we observed:

- Courses are slow to open, sometimes need a refresh, and the interface feels clunky.
- Reaching the slides took about 5 clicks. Each file opens in a new tab, which leaves too many tabs open and no way to stay oriented.
- Files without a description have to be opened or downloaded just to see what they are.
- Forums are hard to find, with several places that look like "the forum". Threads aren't laid out like the social feeds students are used to.
- In lectures, students juggle Moodle, the slides and an AI assistant (to expand on slides or take notes in maths-heavy modules).

## 2. Approach

**Reskin with a content script**, targeting UCL only for now.

- CSS restyles Moodle's existing pages, and JavaScript adds features on top of them.
- Data that isn't on the page (deadlines, course list) comes from Moodle's own AJAX endpoint, `/lib/ajax/service.php`. It uses the student's existing login (session cookie and `sesskey`), which is the same mechanism the stock dashboard uses. No tokens or passwords are involved.
- Manifest V3 in plain JavaScript, with no build step. Load it unpacked and edit it directly.

### Design principles

- **Absolutely minimal.** Neutral colours, one accent, system font, generous whitespace, no shadows, grey activity icons.
- **Most important information first.** Deadlines and courses replace the dashboard clutter.
- **Fail safe.** If a selector doesn't match UCL's markup, the feature doesn't appear and the page stays stock Moodle. Nothing breaks.
- **Easy to switch off.** All CSS is scoped under `html.bm`, and the popup toggle removes it completely.
- **Fast.** Cached data renders instantly and refreshes in the background (stale-while-revalidate).

## 3. Features

### MVP (v0.1)

| # | Feature | Solves |
|---|---------|--------|
| 1 | **Minimal reskin**: typography, spacing, quieter navbar and cards, hidden footer clutter | "UI feels clunky" |
| 2 | **Dashboard**: *Due soon* grouped as Overdue / Today / Tomorrow / This week / Later with countdowns, plus a clean *Courses* list (starred first). The classic dashboard sits behind a toggle. | Deadlines, finding courses |
| 3 | **Side viewer for files**: clicking a PDF, image, video, page, folder or book opens it in a resizable right-hand panel. j/k or ↑/↓ moves to the next or previous file, Esc closes. Ctrl+click still opens a new tab. | The 5 clicks and too many tabs |
| 4 | **Course filter bar**: type to filter (press `/` to focus), with chips for All / Files / Assessments / Forums. Sections with no matches collapse away. | Scrolling past loads of resources |
| 5 | **"Due in this course" strip** at the top of each course page | Deadlines in context |
| 6 | **Ctrl/⌘+K search** across courses, deadlines and every file on course pages you've visited (indexed locally as you browse). Selecting a file jumps to its course and opens it in the viewer. | Finding anything fast |
| 7 | **Popup** with an on/off toggle | Safety valve |

### Next (v0.2)

- **Forum feed**: a social-media-style layout with newest threads first, threaded replies, highlighted staff answers and an inline reply box. Image attachments already exist in Moodle forums where the course allows them, so we'd expose them rather than add them.
- **Drag-and-drop submission**: drop a file onto an assignment card and see the submitted status.
- **"New since last visit"** on the dashboard: new files and forum replies.
- **Submission status** on deadlines, so finished work stops nagging.

### Later

- **Lecture mode**: slides in a side panel with "copy slide text" / "send to AI assistant" and a maths-capable notes area. Check UCL's AI policy and staff views on uploading slides first.
- **Timetable**: import UCL's timetable ICS and show "Next: X in room Y".
- Dark mode, "download all slides" as a zip, and calendar export shortcuts.

## 4. Architecture

```
manifest.json            MV3, matches https://moodle.ucl.ac.uk/*
src/early.js             document_start: adds html.bm (no flash); html.bm-embed inside the viewer iframe
src/lib/util.js          DOM builder (no innerHTML for data), sesskey/user id, date helpers
src/lib/selectors.js     ALL Moodle DOM selectors: the one file to edit for UCL's markup
src/lib/store.js         chrome.storage cache, namespaced per Moodle user; stale-while-revalidate
src/lib/api.js           Moodle AJAX calls (courses, deadlines)
src/features/viewer.js   split-view file viewer
src/features/course.js   filter bar, due strip, click-to-viewer, local search index
src/features/home.js     dashboard
src/features/palette.js  Ctrl+K search
src/main.js              routes features by page (<body id/class>)
src/styles/theme.css     the reskin (scoped to html.bm)
src/styles/ui.css        styles for our own components
popup/                   on/off toggle
```

**Moodle API functions used** (all used by Moodle's own dashboard):

- `core_course_get_enrolled_courses_by_timeline_classification` for courses
- `core_calendar_get_action_events_by_timesort` for deadlines (completed items drop out automatically)

**Privacy:** nothing leaves the browser except requests to UCL Moodle itself. Cached data is keyed by Moodle user id, so a shared computer never shows one student's data to another.

## 5. Status

| Item | State |
|------|-------|
| Manifest, early reskin hook, util/store/api libs, selectors | Written |
| Viewer, course page, dashboard, Ctrl+K search, entry point | Written, untested |
| `theme.css`, `ui.css`, popup, icons | **To do** |
| Test against real UCL Moodle | **Blocked**: no access from the dev environment |
| Push to GitHub | **Blocked**: the Claude GitHub App needs access to the `ISoc-Engineering` org |

## 6. Risks and mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| UCL uses a custom theme or course format (Tiles, Grid, one section per page), so selectors don't match | Medium | All selectors live in `selectors.js`, and features fail safe. Refine using real UCL page HTML. |
| Lecturer set a file to "force download", so it can't preview in the viewer | Low–medium | The viewer shows an "Open / download" fallback |
| Moodle API function disabled or changed after an upgrade | Low | The stock dashboard depends on the same functions. On error, the UI shows a message and the stock page still works. |
| Moodle upgrade changes markup | Medium (yearly) | Same as above: one selectors file, fail safe |
| Dev container is temporary and the code isn't pushed | **High, now** | Fix GitHub access, or keep a local copy of the repo |

## 7. Next steps

1. **Fix GitHub access** so the work is saved, by reconnecting at claude.ai/connect-github or having an org owner install the Claude GitHub App.
2. **Finish the MVP**: CSS, popup and icons.
3. **Get real UCL markup.** Either run Claude Code locally with Claude in Chrome (best), or save the cleaned HTML of the Dashboard, a course page with slides, a forum and an assignment page.
4. **Tune `selectors.js`** to UCL and test each MVP feature on a real course.
5. **User test with 3–5 students.** Measure clicks and time to reach this week's slides and the next deadline, against stock Moodle.
6. Build v0.2: the forum feed and drag-and-drop submission.

## 8. Success metrics

- This week's slides in **≤ 2 clicks** from opening Moodle (down from about 5)
- Next deadline visible in **0 clicks** on the dashboard
- Any file found with **Ctrl+K in under 5 seconds**
- **No extra tabs** opened while browsing a course's files
