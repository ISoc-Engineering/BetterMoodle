Run from the repository root with Python 3 and Firefox installed:

```sh
python3 tests/run.py
```

The runner starts a localhost server, creates a temporary Firefox profile, exercises the real content scripts and CSS against synthetic Moodle pages, then removes the profile. It needs permission to bind localhost and launch Firefox. No Python or JavaScript packages are required.

Checks cover resource selection and navigation, scroll and section state, keyboard focus, all resource filters, grid/list switching, PDF frame retention/reload, mobile details, Original Moodle switching, dashboard images, cover retention, asynchronous content updates, timeline details, empty courses, unavailable storage, section identity, URL validation and duplicate resources.

These fixtures stub the extension storage API and activity destinations. They do not verify installation in Chromium, authenticated UCL markup, actual PDF delivery, download headers, or Moodle's framing policy.
