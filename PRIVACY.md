# BetterMoodle Privacy Policy

_Last updated: 18 November 2026_

BetterMoodle (UCL) is an unofficial browser extension that changes how UCL Moodle (`moodle.ucl.ac.uk`) looks and is laid out. It is made by students and is not affiliated with or endorsed by UCL.

## Short version

BetterMoodle does not collect, sell or share any data. Everything it reads stays in your browser. It has no server, no analytics and no tracking.

## What the extension accesses

The extension only runs on pages under `https://moodle.ucl.ac.uk/`. To build its views, it asks UCL Moodle for information that your own Moodle session can already see:

- the courses you are enrolled on
- your upcoming deadlines and calendar events
- the sections, activities and files in your courses (names, file types and sizes)

These requests go **only to UCL Moodle**, using the login you already have open in your browser. BetterMoodle never sees or stores your password. It reads Moodle's per-page session key (`sesskey`) only so it can make the same requests that Moodle's own pages make.

## What is stored, and where

- **Settings** (on/off, aggressive mode) are saved in your browser's extension storage.
- **A cache of course and deadline data** is saved in your browser's extension storage so pages load quickly. It is grouped by Moodle user ID, so different people on a shared computer don't see each other's data. Cached items are refreshed after a few hours or when a course changes.

None of this leaves your device. Removing the extension deletes all of it.

## What is not done

- No data is sent to the developers or to any third party.
- No analytics, advertising, fingerprinting or remote code.
- No access to any website other than UCL Moodle.

## Changes and contact

If this policy changes, the new version will be published here with a new date. Questions or concerns: open an issue at <https://github.com/ISoc-Engineering/BetterMoodle/issues>.
