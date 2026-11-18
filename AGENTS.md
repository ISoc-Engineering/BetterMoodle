# Instructions for AI agents working in this repo

BetterMoodle is a Chrome/Firefox extension (Manifest V3) for UCL Moodle (`moodle.ucl.ac.uk`). Plain JavaScript, no build step. Several students work on it at once, so follow these rules.

## Git

- Never commit or push to `main`. Work on a branch named `<person>/<feature>` and open a pull request.
- Keep changes scoped to the task. Don't reformat or "tidy" files you weren't asked to touch, because that causes merge conflicts for everyone else.
- Pull `main` before starting.

## Code layout

- `manifest.json`: two content scripts. `src/early.js` and the CSS run at `document_start` in every frame; everything else runs at `document_idle` in the order listed. A new file must be added to the manifest.
- Every script attaches to the shared `BM` namespace (`var BM = globalThis.BM;`). `src/lib/util.js` creates it, so it must load first.
- `src/lib/`: data and helpers. `api.js` calls Moodle's AJAX web services with the page's `sesskey`. `store.js` is a per-user `chrome.storage` cache. `course-data.js` builds one model of a whole course.
- `src/features/`: one file per feature (home, course, viewer, palette). `src/main.js` routes by Moodle's `<body id>`.
- `src/styles/`: all CSS is scoped under `html.bm`, so switching the extension off removes it.

## Rules

- Build DOM with `BM.h(tag, attrs, ...children)`. Data always goes in as text, never through `innerHTML`. Moodle HTML must go through `BM.safeFragment`.
- Never send data anywhere except `moodle.ucl.ac.uk`. Nothing leaves the browser (see PRIVACY.md).
- If a feature fails, leave the stock Moodle page usable. Every view has a "Classic" toggle.
- Be gentle with UCL's servers: cache with `BM.store.swr`, and limit parallel requests with `BM.pool`.
- Styling: match the existing look unless asked otherwise. For the Pop!/Schedule Tracker style, follow `docs/SCHEDULE-TRACKER-STYLE.md` literally.

## Testing

There's no automated test suite on `main` yet. Load the folder unpacked in `chrome://extensions`, refresh Moodle, and check the dashboard (`/my/`) and a course page. Releasing: see README.md.
