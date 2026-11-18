# Store submission kit

Copy and paste these fields into the Chrome Web Store dashboard and the Firefox Add-ons Developer Hub. Upload the zip from `dist/` (create it with `scripts/package.sh`).

---

## Shared fields

**Name:** BetterMoodle (UCL)

**Summary** (Chrome ≤132 characters, AMO ≤250):
> Unofficial. A minimal reskin of UCL Moodle: deadlines first, every course file on one page, a side viewer and Ctrl+K search.

**Category:** Chrome: *Productivity → Education* (Productivity is fine if Education isn't offered). AMO: *Productivity* (also tick *Other* if you want).

**Homepage / support URL:** https://github.com/ISoc-Engineering/BetterMoodle
**Support / issues:** https://github.com/ISoc-Engineering/BetterMoodle/issues
**Privacy policy URL:** https://github.com/ISoc-Engineering/BetterMoodle/blob/main/PRIVACY.md

**Full description:**

> BetterMoodle is an unofficial, student-made extension that makes UCL Moodle faster to get around.
>
> • Dashboard that shows deadlines first: Overdue, Today, Tomorrow, This week and Later, with countdowns
> • Every course on one page, with each section, file type and size listed, instead of one section per page
> • Filter bar: type to filter, or tap Files, Recordings, Assessments or Forums
> • Side viewer: open PDFs, slides, pages and folders in a panel next to the course and step through them with j/k
> • Ctrl/⌘+K: search all your courses, deadlines and activities at once
> • Aggressive mode (optional): hide admin sections so only teaching material is left
> • One switch in the toolbar turns it all off and gives you normal Moodle back
>
> Privacy: everything stays in your browser. The extension only talks to moodle.ucl.ac.uk using the login you already have. There's no server, no analytics and no tracking.
>
> Not affiliated with or endorsed by UCL.

---

## Chrome Web Store: Privacy practices tab

**Single purpose:**
> Improves the layout of UCL Moodle (moodle.ucl.ac.uk), showing deadlines and all course files on one page, with a side file viewer and search.

**Permission justification: `storage`:**
> Saves the user's settings (on/off, aggressive mode) and caches their course and deadline data locally so Moodle pages load quickly. Nothing is sent off the device.

**Host permission justification: `https://moodle.ucl.ac.uk/*`:**
> The extension only works on UCL Moodle. Content scripts restyle Moodle pages and call Moodle's own AJAX endpoints (same origin, using the user's existing session) to list courses, deadlines and course files.

**Remote code:** No, I am not using remote code.

**Data usage:** tick these, since the extension *handles* them even though nothing leaves the device:
- ☑ Personally identifiable information: the Moodle user ID, used only to keep each user's local cache separate
- ☑ Website content: course names, deadlines and file listings shown on the user's own pages

Leave everything else unticked. Then tick all three certifications:
- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

> Google treats data as "collected" even when it is only processed locally, so declaring the two categories above is the safe answer. Saying "none" when the code clearly reads course data is a common reason listings get rejected.

**Visibility for launch:** Start with **Unlisted** for the ISoc beta, then switch to **Public**.

---

## Firefox Add-ons (AMO)

- Distribution: **On this site** (listed).
- Compatibility: Firefox desktop. Also tick **Firefox for Android** if it works on mobile Moodle.
- Data collection: already declared in the manifest as `"data_collection_permissions": {"required": ["none"]}`. This means nothing is *transmitted* to the developer or third parties, which is what Mozilla's definition covers.
- Source code: answer **No**. The upload is the unminified source with no build step.
- Notes to reviewer:
  > No build step; the uploaded files are the source. The extension only runs on moodle.ucl.ac.uk and calls Moodle's same-origin /lib/ajax/service.php with the logged-in user's sesskey. A UCL account is needed to see it working. Screenshots are attached in the listing.
- License: MIT (or whatever you choose; add a LICENSE file to the repo to match).

---

## Images

| Asset | Size | Status |
|---|---|---|
| Store icon | 128×128 | ✅ `icons/128.png` |
| Chrome small promo tile | 440×280 | ✅ `store/promo-440x280.png` |
| Screenshots (Chrome 1–5, AMO any) | 1280×800 | ⏳ Take these yourself while logged in. See below. |

**Screenshot checklist** (set the browser window to 1280×800; use a Chrome window with DevTools device toolbar → Responsive → 1280×800):
1. Dashboard (`/my/`): deadlines list
2. A course page: all sections, with the filter bar visible
3. Side viewer open on a PDF
4. Ctrl+K search open with results
5. Popup open (optional)

Before uploading, blur or crop any classmates' names and your own name and photo in the navbar.

---

## Release routine (each new version)

1. Bump `version` in `manifest.json`.
2. Run `scripts/package.sh` to create `dist/bettermoodle-<version>.zip`.
3. Commit, then `git tag v<version>` and `git push --tags`.
4. Upload the same zip to the Chrome Web Store and AMO, and attach it to a GitHub Release.
