# Working on BetterMoodle together

## The one rule

**Never push straight to `main`.** `main` is what goes to the Chrome Web Store. Everything else goes through a branch and a pull request (PR).

## Every time you start something

```sh
git checkout main
git pull                       # get everyone else's latest work
git checkout -b yourname/what  # e.g. harris/pinning, starhamy/pop-theme
```

Work, then save and upload it:

```sh
git add -A
git commit -m "Add pinned resources board"
git push -u origin yourname/what
```

Then on GitHub, click **Compare & pull request**, write what you changed, and post the link in Discord. Someone else reviews it and clicks **Merge**.

## Before you merge

- Load it unpacked (`chrome://extensions` → Developer mode → **Load unpacked** → this folder), refresh Moodle, and check that what you touched still works.
- Pull `main` into your branch first if it has moved on (`git pull origin main`), and fix any conflicts.
- Keep PRs small: one feature per PR is easier to review and less likely to clash.

## Who's working on what

Say it in Discord before you start, so two people don't edit the same file at once.

| Area | Files |
|---|---|
| Dashboard | `src/features/home.js` |
| Course page | `src/features/course.js`, `src/lib/course-data.js` |
| File viewer | `src/features/viewer.js` |
| Ctrl+K search | `src/features/palette.js` |
| Moodle data | `src/lib/api.js` |
| Styling | `src/styles/` (style guide: [docs/SCHEDULE-TRACKER-STYLE.md](docs/SCHEDULE-TRACKER-STYLE.md)) |
| Popup settings | `popup/` |

## Old branches

- `harris`: Harris's earlier version (a separate codebase). Kept for reference; port ideas from it into `main` through PRs.
- `claude/affectionate-hamilton-dyc7m5`: the very first scaffold. Not needed.

## Using an AI agent

Point it at [AGENTS.md](AGENTS.md) first. It has the rules every agent should follow in this repo.
