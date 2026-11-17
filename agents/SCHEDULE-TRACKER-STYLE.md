# Schedule Tracker style: reproduction guide for an agent

You are restyling (or building) part of a website so it looks and behaves **exactly** like the Schedule Tracker WordPress plugin. This file is the full specification. The source of truth is `schedule-tracker/assets/st.css` (reproduced in full in the appendix) plus the small JS behaviours described in section 9. Follow the values here literally: do not "improve", soften, round, modernise or swap any colour, border width, shadow offset, radius, font or easing curve.

---

## 1. The look in one paragraph

**Neo-brutalist and maximalist, but tidy.** Every element is a flat, saturated colour block with a **thick near-black outline** and a **hard, unblurred drop shadow offset down-right**. The background is warm cream **dot-grid paper**. Headings are huge, **uppercase, ultra-heavy (Arial Black)**; numbers and labels are **monospace**. Everything moves with a **springy overshoot** (it bounces slightly past its target and settles). Hovering lifts things up-left and tilts them by a degree or two; pressing pushes them down-right into their shadow. There are no gradients-as-decoration, no blur shadows, no thin borders, no grey UI, and no soft pastel fills.

If something you build has a 1px border, a blurred `box-shadow`, a light font weight, sentence-case display text, or an `ease` transition with no overshoot, it is wrong.

---

## 2. Scope it so it can't leak

All styling lives under one root class so it never touches the host theme:

```css
.st-app, .st-login { /* tokens + base, see section 3 */ }
.st-app *, .st-login * { box-sizing: border-box; }
```

Use your own prefix if you are building something new (e.g. `.xx-`), but keep the **same structure**: tokens declared on the root class, every rule prefixed by it. Never style bare elements (`button`, `h1`, `li`) globally.

---

## 3. Design tokens (copy exactly)

```css
--ink:     #111;      /* every outline, every shadow, dark buttons, body text */
--paper:   #fff6e0;   /* warm cream page/panel background */
--hot:     #ff5c8a;   /* pink: primary actions, selected tab, selected day */
--sun:     #ffd23f;   /* yellow: forms, labels/badges, hover fill, settings */
--sky:     #3ec1d3;   /* cyan: header bar, "today" */
--lime:    #7cff6b;   /* green: running timer text, progress fill, checked box */
--display: "Arial Black", Impact, "Helvetica Neue", system-ui, sans-serif;
--mono:    ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
```

**Literal colours that are part of the design** (keep them as literals or add tokens with the same values):

| Value | Used for |
|---|---|
| `#fff` | inner surfaces: forecast panel, inputs, expanded detail, to-do rows, day cells, tabs |
| `#e11d2e` | danger/alert: Pause (running) button, delete hover, error box, LIVE pill, overdue |
| `#4ee03d` | the darker stripe inside the lime progress bar |
| `#ffe0e0` / `#ffe9e9` | pale red behind overdue items |
| `rgba(0,0,0,.18)` | the paper dots |
| `rgba(255,255,255,.22–.28)` | white diagonal stripes on the header and on running rows |

**Per-item colour palette.** Each task/to-do gets a colour from this list by `id % 6`, passed in as an inline CSS variable `--c`:

```js
var PALETTE = ['#FF5C8A', '#FFD23F', '#3EC1D3', '#7CFF6B', '#FF9F1C', '#B28DFF'];
function colorFor(id) { return PALETTE[id % PALETTE.length]; }
// <li class="st-row" style="--c:#FF5C8A">
```

Rows use `background: var(--c, var(--hot))`; bar charts use `var(--c)` too, so a task's chart matches its row.

**Base text:** `font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-weight: 600; color: var(--ink);`. Body text is semi-bold by default. Nothing in the UI is lighter than 600.

This design is **light-only on purpose**. Do not add a dark mode. The cream paper and black ink are the identity.

---

## 4. The signature recipe (apply to every "object")

Every card, panel, row, button and input is built from the same four ingredients. Getting these right is 80% of the look.

### 4a. Outline widths

| Element | Border |
|---|---|
| Big panels, rows, header bar, add form, empty state | `4px solid var(--ink)` |
| Buttons, tabs, inputs, small cards, day cells, chart bars | `3px solid var(--ink)` |
| Tiny chips (labels, due badges, dots, LIVE pill) | `2px solid var(--ink)` |

### 4b. Hard offset shadows (never blurred)

| Element | Rest | Hover / open |
|---|---|---|
| Main panels (`.st-left`, `.st-forecast`) | `10px 10px 0 var(--ink)` | n/a |
| Rows, header bar, add form | `6px 6px 0 var(--ink)` | `9px 9px 0 var(--ink)` |
| Tabs | `4px 4px 0 var(--ink)` | `6px 6px 0` (press: `1px 1px 0`) |
| Buttons | `3px 3px 0 rgba(0,0,0,.35)` | `5px 5px 0 rgba(0,0,0,.45)` (press: none) |
| Day cells | none | `3px 3px 0 var(--ink)` |

The shadow is always **down-right**, always **0 blur**, always **solid**.

### 4c. Radii

| Radius | Used for |
|---|---|
| `20px` | the two main panels |
| `14px` | rows, header bar, add form, empty state |
| `12px` | settings box, timetable day cards |
| `8px` | buttons, inputs, the time readout, day cells, checkboxes |
| `6px` | small labels and due badges; top corners of chart bars |
| `999px` | tabs (pills), LIVE pill, progress track, badges, count bubbles |
| `50%` | the round "+" button, dots |

### 4d. Dot-grid paper

```css
background:
  radial-gradient(circle at 1px 1px, rgba(0,0,0,.18) 1.2px, transparent 1.6px) 0 0 / 18px 18px,
  var(--paper);
```

Used on the outer/left panel only. The right-hand panel is plain `#fff`.

---

## 5. Typography

| Role | Font | Settings |
|---|---|---|
| Hero title ("THIS WEEK") | `--display` | weight 900, uppercase, `font-size: clamp(1.8rem, 6vw, 3rem)`, `line-height: .9`, `letter-spacing: -.03em`, `text-shadow: 3px 3px 0 #fff` |
| Panel title (forecast) | `--display` | weight 900, uppercase, `clamp(1.3rem, 2.2vw, 1.8rem)`, `letter-spacing: -.02em`, `line-height: 1`, `text-shadow: 3px 3px 0 var(--sun)` |
| Row names | `--display` | weight 900, uppercase, `clamp(1.05rem, 3.4vw, 1.5rem)`, `line-height: 1.05`, `letter-spacing: -.01em` |
| Buttons, tabs | `--display` | weight 900, uppercase, `letter-spacing: .02em`, buttons `.8rem`, tabs `1rem`, `line-height: 1` |
| Timers / numbers | `--mono` | weight 900, `font-variant-numeric: tabular-nums` (digits must not jiggle as time ticks) |
| Labels, badges, dates, weekday heads | `--mono` | weight 800, uppercase, `letter-spacing: .04em–.08em`, sizes `.6rem–.8rem` |
| To-do text (exception) | inherit (system-ui) | weight 800, `1.15rem`, **not** uppercase |

Text shadows are hard offset copies (`3px 3px 0`) in white or sun yellow, never blurred (except the lime glow on a running timer, see 6.6).

---

## 6. Components

The class names below are the plugin's. Reproduce the same structure.

### 6.1 Layout

```css
.st-app    { margin: 12px 0 24px; padding: 0; background: none; border: 0; box-shadow: none; } /* wrapper only */
.st-layout { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px; align-items: stretch; }
.st-left     { min-width: 0; padding: 20px; /* dot paper */ border: 4px solid var(--ink); border-radius: 20px; box-shadow: 10px 10px 0 var(--ink); }
.st-forecast { min-width: 0; padding: 20px; background: #fff; border: 4px solid var(--ink); border-radius: 20px; box-shadow: 10px 10px 0 var(--ink); }
```

Two equal side-by-side panels with a 32px gap: the left on dot paper, the right plain white.

### 6.2 Sticky header bar

```css
.st-bar-top {
  position: sticky; top: 8px; z-index: 5;
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 16px; margin-bottom: 16px;
  background: var(--sky);
  background-image: repeating-linear-gradient(-45deg, transparent 0 14px, rgba(255,255,255,.22) 14px 28px);
  border: 4px solid var(--ink); border-radius: 14px; box-shadow: 6px 6px 0 var(--ink);
}
```

It contains the big title, a small **tilted yellow sticker** (`.st-reset`: mono, uppercase, `background: var(--sun)`, `border: 3px solid`, `border-radius: 6px`, `transform: rotate(-2deg)`), and on the right the round **"+" button**.

### 6.3 Buttons

```css
.st-btn {
  font-family: var(--display); font-weight: 900; text-transform: uppercase; letter-spacing: .02em;
  font-size: .8rem; line-height: 1; padding: 10px 14px; cursor: pointer;
  color: #fff; background: var(--ink); border: 3px solid var(--ink); border-radius: 8px;
  box-shadow: 3px 3px 0 rgba(0,0,0,.35);
  transition: transform .15s cubic-bezier(.3,1.6,.5,1), box-shadow .15s, background .2s, border-radius .25s, color .2s;
}
.st-btn:hover  { transform: translate(-2px,-2px) rotate(-1.5deg); box-shadow: 5px 5px 0 rgba(0,0,0,.45); }
.st-btn:active { transform: translate(2px,2px); box-shadow: 0 0 0 rgba(0,0,0,0); }
```

Variants:

| Class | Look |
|---|---|
| default | black with white text |
| `.st-primary` | pink `--hot` with ink text |
| `.st-plus` | 56×56 circle, pink, `font-size: 2rem`; hover spins `rotate(90deg) scale(1.1)`; when its form is open (`.st-plus-on`) it becomes a yellow rounded square rotated 45° so the "+" reads as "×" |
| `.st-toggle` (Start) | black, lime text, `min-width: 84px` |
| `.st-running` (Pause) | `#e11d2e` with white text |
| `.st-morph` | plays on Start/Pause swap: squashes into a pill and springs back (keyframes below) |
| `.st-del` (×) | white, ink text, `font-size: 1.1rem`; hover turns red and spins `rotate(12deg) scale(1.1)` |
| `.st-gear` | 40×40 yellow square; when open, pink and `rotate(60deg)` |

```css
@keyframes st-morph {
  0%   { transform: scale(.7, 1.2);   border-radius: 999px; }
  55%  { transform: scale(1.18, .88); border-radius: 999px; }
  100% { transform: scale(1);         border-radius: 8px; }
}
```

**Focus:** `outline: 4px solid var(--ink); outline-offset: 3px;` on `:focus-visible` for buttons, tabs, inputs, checkboxes and clickable row heads.

### 6.4 Tabs

White pills with a 3px border and `4px 4px 0` shadow. Hover lifts and tilts `rotate(-2deg)`; press sinks `translate(3px,3px)`. The active tab (`.st-tab-on`) is filled pink.

### 6.5 Add form and inputs

```css
.st-add   { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; padding: 14px;
            background: var(--sun); border: 4px solid var(--ink); border-radius: 14px; box-shadow: 6px 6px 0 var(--ink);
            animation: st-drop .3s cubic-bezier(.3,1.6,.5,1); }
.st-input { font: inherit; font-weight: 700; padding: 10px 12px; min-width: 0; color: var(--ink); background: #fff;
            border: 3px solid var(--ink); border-radius: 8px; }
.st-input::placeholder { color: rgba(0,0,0,.5); }
```

Errors: a red block (`#e11d2e`, white bold text, 3px ink border, radius 10px).

### 6.6 Rows (the main list)

```css
.st-row { position: relative; margin-bottom: 14px; overflow: hidden;
          background: var(--c, var(--hot)); border: 4px solid var(--ink); border-radius: 14px;
          box-shadow: 6px 6px 0 var(--ink);
          transition: box-shadow .15s, translate .15s cubic-bezier(.3,1.6,.5,1); }
.st-row:hover        { translate: -2px -2px; box-shadow: 9px 9px 0 var(--ink); }
.st-row.st-open      { box-shadow: 9px 9px 0 var(--ink); }
.st-row.st-active    { background-image: repeating-linear-gradient(-45deg, transparent 0 12px, rgba(255,255,255,.28) 12px 24px); }
```

Row head (`.st-row-head`): flex, wrapping, `gap: 10px 12px`, `padding: 14px 16px`, clickable. Order of children:

1. **Name** (`.st-name`, display type, grows). When running, it gets a **LIVE pill** after it: mono `.65rem`, white on `#e11d2e`, 2px border, pill radius, a `●` prefix, and it **blinks** (`animation: st-blink 1s steps(2, start) infinite` → `visibility: hidden`).
2. **Sparkline** (`.st-spark`): a tiny 7-bar chart in a white box that is **hidden** (`max-width: 0; opacity: 0; border-width: 0`) and **slides in** on row hover/focus (`max-width: 80px; opacity: 1`). Bars are 6px wide ink blocks; height = % of the week's max, minimum 12%.
3. **Start/Pause** button.
4. **Time readout** (`.st-time`): mono 900, `clamp(1.1rem, 3.6vw, 1.6rem)`, tabular numbers, `min-width: 6.5ch`, centred, white on black, 3px border, radius 8px. **When running**, the text turns lime with a lime glow (`text-shadow: 0 0 12px var(--lime)`) and pulses (`scale 1 → 1.06`, 1.2s).
5. **Delete** (×) button.

Rows **pop in** on first render with a 70ms stagger per row:

```css
.st-enter { animation: st-pop .5s cubic-bezier(.3,1.6,.5,1) backwards; }   /* plus inline animation-delay: i*70ms */
@keyframes st-pop { from { opacity: 0; transform: translateY(24px) rotate(-2deg) scale(.95); } to { opacity: 1; transform: none; } }
```

When the order changes, rows **slide** to their new places (FLIP: record each row's old `top`, re-render, apply `translateY(old - new)`, then transition to 0 over `250ms ease`).

### 6.7 Expanded detail (accordion)

Only one row open at a time. The detail area is white with a `4px solid var(--ink)` **top** border, `padding: 6px 16px 18px`, and drops in with `st-drop`. Inside, each block starts with a **yellow mono label chip** (`.st-label`: uppercase, `.8rem`, 2px border, radius 6px).

- **Bar chart** (`.st-chart`): 110px tall flex row, `gap: 8px`. Each bar is the row's `--c` colour, 3px ink border **without a bottom border**, top radius 6px, `min-height: 4px`, and grows from the bottom on render (`transform-origin: bottom; animation: st-grow .5s` from `scaleY(0)`). Hover: `scaleY(1.06)` + `brightness(1.1)`. Day letters under each bar in mono 800 `.72rem` uppercase.
- **Progress bar** (`.st-progress`): 22px tall pill, white track, 3px border. The fill has **moving diagonal lime stripes**:
  ```css
  background: repeating-linear-gradient(-45deg, var(--lime) 0 10px, #4ee03d 10px 20px);
  background-size: 28px 28px; animation: st-march 1s linear infinite;
  border-right: 3px solid var(--ink); transition: width .6s cubic-bezier(.3,1.2,.5,1);
  @keyframes st-march { to { background-position: 28px 0; } }
  ```

### 6.8 To-do rows

A variant of `.st-row`: **white** background with an **18px-thick left border** in the item's `--c` colour. Hover tilts `rotate: -.4deg`. A **custom checkbox** (`appearance: none`, 30×30, 4px border, radius 8px): hover tilts and turns yellow; checked turns lime, shrinks to `.9`, and draws a tick with a rotated bordered box (`::after`, `border-width: 0 4px 4px 0`, `rotate(45deg)`). Due badge: yellow mono chip. **Overdue:** red badge that **shakes** every 1.6s, plus the row gets pale-red diagonal stripes, a red border and a red shadow (`6px 6px 0 #e11d2e`).

### 6.9 Empty state

`text-align: center; padding: 28px 16px;` display font, uppercase, `1.1rem`, white, **4px dashed** ink border, radius 14px.

### 6.10 Calendar (forecast panel)

- Header: big title with a yellow hard text-shadow, a yellow gear button and a lime "refresh" button.
- Month nav: black step buttons, a pink "Today" button, and the month name centred in display type.
- Weekday heads: a 7-column grid, mono 800 `.7rem` uppercase.
- **Day cells** (`.st-day`): white, 3px border, radius 8px, `min-height: 58px`, padding 4px, day number in display 900 `.95rem` top-left, a black **count bubble** top-right (red if overdue), and a 2-line clamped label. Hover: lift, tilt `-1.5deg`, yellow fill, `3px 3px 0` shadow. **Today** = cyan; **selected** = pink; days from other months at `opacity: .45`.
- **Dots** per event type: 8px with a 2px border. Lecture = cyan circle; deadline = pink rounded square; to-do = yellow diamond (square rotated 45°); overdue = red.
- **Event list** for the chosen day: cards with a 3px border, radius 10px and a **12px coloured left border** by kind (cyan lecture / pink deadline / yellow to-do / red overdue on a pale red background). A 3-column grid: mono time (5.6rem), text, and a black pill badge. Each card drops in with `st-drop`.

---

## 7. Motion rules

- **The house easing is `cubic-bezier(.3, 1.6, .5, 1)`**, a spring that overshoots. Use it for every transform transition and every entrance. (Progress width uses the gentler `cubic-bezier(.3,1.2,.5,1)`.)
- Durations are short: **.15s** for hover/press, **.2–.3s** for drops and fades, **.45–.5s** for pops, morphs and bar growth.
- **Hover = lift up-left + tiny tilt + bigger shadow.** **Press = push down-right + shadow collapses.** Apply this pattern to anything clickable.
- Entrances: `st-drop` (fade + slide down 14px + scale .97), `st-pop` (rise 24px + tilt −2° + scale .95), `st-grow` (bars from `scaleY(0)`).
- Continuous motion is reserved for **live state only**: the blinking LIVE pill, the pulsing running timer, the marching progress stripes, and the shaking overdue badge. Do not add idle animations anywhere else.
- **Reduced motion is mandatory:**
  ```css
  @media (prefers-reduced-motion: reduce) {
    .st-app *, .st-app *::before, .st-app *::after, .st-cursor, .st-cursor::before {
      animation: none !important; transition: none !important;
    }
  }
  ```

---

## 8. Responsive behaviour

```css
@media (max-width: 960px) { .st-layout { grid-template-columns: minmax(0, 1fr); } }   /* panels stack */
@media (max-width: 560px) {
  .st-left, .st-forecast, .st-login { padding: 12px; border-width: 3px; box-shadow: 6px 6px 0 var(--ink); }
  .st-name  { flex: 1 1 100%; }     /* name gets its own line */
  .st-time  { margin-left: auto; }
  .st-spark { display: none; }
  .st-day   { min-height: 52px; padding: 2px; }
  .st-day-label { display: none; }
  .st-fc-item { grid-template-columns: 1fr auto; }
  .st-fc-time { grid-column: 1 / -1; }
}
```

On small screens borders thin from 4px to 3px and big shadows shrink from 10px to 6px. Keep that ratio.

---

## 9. Behaviours the look depends on (JavaScript)

These are part of the style. Reproduce them.

1. **Per-item colour:** set `style="--c:<PALETTE[id % 6]>"` on each row (section 3).
2. **Staggered pop-in on the first render only**, plus FLIP sliding on re-sort (section 6.6).
3. **Start/Pause morph:** add `st-morph` only to the button that was just clicked, for one render.
4. **"+" button state:** toggle `st-plus-on` while the add form is open.
5. **Custom cursor ring** (desktop only): a 40px circle with a 3px `#111` border that follows the mouse exactly (no easing). It **grows ×1.7 with a yellow fill** over anything clickable and **shrinks ×.7 with a pink fill** while the mouse is pressed. Only create it when `(pointer: fine)` matches and reduced motion is **off**.
   ```css
   .st-cursor { position: fixed; top: 0; left: 0; z-index: 99999; width: 40px; height: 40px; pointer-events: none; opacity: 0; transition: opacity .2s; }
   .st-cursor::before { content: ""; display: block; width: 100%; height: 100%; border: 3px solid #111; border-radius: 50%;
                        background: rgba(255,210,63,0); transition: transform .2s cubic-bezier(.3,1.6,.5,1), background .2s; }
   .st-cursor-on { opacity: 1; }
   .st-cursor-hot::before  { transform: scale(1.7); background: rgba(255,210,63,.55); }
   .st-cursor-down::before { transform: scale(.7);  background: rgba(255,92,138,.7); }
   ```
   ```js
   // move: ring.style.transform = `translate(${e.clientX - 20}px, ${e.clientY - 20}px)`
   // hot:  e.target.closest('button, input, label, a, .st-row-head')
   ```
6. **Full-width breakout (WordPress only):** the plugin makes the app fill the screen whatever the theme's column width. It sets `width = viewportWidth − 2×24px`, then shifts `margin-left` so the left edge sits 24px from the viewport edge, and re-runs on resize. On pages that host it, it adds `body.st-page`, which hides the theme's page title and top padding and sets `overflow-x: hidden`. Only copy this if your page sits inside a narrow theme column.

---

## 10. Do / don't checklist

**Do**
- Use `--ink` for every outline and shadow. Black is the frame of everything.
- Use flat, saturated fills from the 6-colour palette, on cream or white.
- Make display text uppercase, Arial Black 900, with tight letter-spacing.
- Use monospace with `tabular-nums` for every number that changes.
- Make every clickable thing lift and tilt on hover and sink on press, with the spring easing.
- Use tilted stickers (`rotate(-2deg)`) and diagonal stripes as the only "decoration".

**Don't**
- No blurred shadows, no `box-shadow` with blur radius, no glassmorphism, no gradients except the dot grid and the 45° stripes.
- No 1px or 2px borders on panels or buttons (2px is for tiny chips only).
- No light or regular font weights, no sentence-case headings, no serif fonts.
- No grey UI. Disabled or muted elements use `opacity`, not grey colours.
- No dark mode, no theme switching.
- No `ease-in-out` on hovers. Use the spring.

---

## 11. How to check your result

1. Put your page next to the original plugin at the same width. Borders, shadow offsets and radii should match pixel for pixel.
2. Hover a row: it moves up-left 2px and its shadow grows from 6px to 9px.
3. Click Start: the button squashes and springs into a red Pause button, the row gets white stripes, LIVE blinks, and the timer turns lime and pulses.
4. Hover a row head: the 7-bar sparkline slides in between the name and the button.
5. Resize to 900px (panels stack) and to 400px (name on its own line, sparkline hidden, borders 3px).
6. Turn on "reduce motion" in the OS: nothing animates and the cursor ring is gone.
7. Tab through with the keyboard: every control shows a 4px black outline.

---

## Appendix: complete original stylesheet (`schedule-tracker/assets/st.css`)

This is the exact source. When anything above is unclear, this wins.

```css
/* Schedule Tracker: maximalist, bold type, tactile micro-interactions.
   Everything is scoped to .st-app so it can't leak into the theme. */

.st-app, .st-login {
	--ink: #111;
	--paper: #fff6e0;
	--hot: #ff5c8a;
	--sun: #ffd23f;
	--sky: #3ec1d3;
	--lime: #7cff6b;
	--display: "Arial Black", Impact, "Helvetica Neue", system-ui, sans-serif;
	--mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

	max-width: 1280px;
	margin: 24px 0;
	padding: 20px;
	color: var(--ink);
	font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
	font-weight: 600;
	background:
		radial-gradient(circle at 1px 1px, rgba(0, 0, 0, .18) 1.2px, transparent 1.6px) 0 0 / 18px 18px,
		var(--paper);
	border: 4px solid var(--ink);
	border-radius: 20px;
	box-shadow: 10px 10px 0 var(--ink);
}
.st-app *, .st-login * { box-sizing: border-box; }

/* The app itself is just a wrapper; the two columns are separate boxes.
   Width is set by st.js so it fills the screen whatever the theme's column is. */
.st-app {
	max-width: none; margin: 12px 0 24px; padding: 0;
	background: none; border: 0; border-radius: 0; box-shadow: none;
}

/* On pages with the tracker (class added by the plugin): keep the theme's own background,
   hide the page title so the boxes start at the top, and never show a sideways scrollbar. */
body.st-page { overflow-x: hidden; }
body.st-page .entry-title, body.st-page .wp-block-post-title, body.st-page .page-title,
body.st-page h1.entry-title, body.st-page .entry-header { display: none; }
body.st-page .entry-content, body.st-page .wp-block-post-content { margin-top: 0; padding-top: 0; }
.st-app [hidden] { display: none !important; }

/* ---------- two-column layout: tasks left, forecast right ---------- */

.st-login { max-width: 520px; }
.st-layout {
	display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 32px; align-items: stretch;
}
.st-left {
	min-width: 0; padding: 20px;
	background:
		radial-gradient(circle at 1px 1px, rgba(0, 0, 0, .18) 1.2px, transparent 1.6px) 0 0 / 18px 18px,
		var(--paper);
	border: 4px solid var(--ink); border-radius: 20px; box-shadow: 10px 10px 0 var(--ink);
}
.st-forecast {
	min-width: 0; padding: 20px; background: #fff;
	border: 4px solid var(--ink); border-radius: 20px; box-shadow: 10px 10px 0 var(--ink);
}

/* ---------- header ---------- */

.st-bar-top {
	position: sticky; top: 8px; z-index: 5;
	display: flex; align-items: center; justify-content: space-between; gap: 12px;
	padding: 12px 16px; margin-bottom: 16px;
	background: var(--sky);
	border: 4px solid var(--ink); border-radius: 14px;
	box-shadow: 6px 6px 0 var(--ink);
	background-image: repeating-linear-gradient(-45deg, transparent 0 14px, rgba(255, 255, 255, .22) 14px 28px);
}
.st-title { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; min-width: 0; }
.st-title strong {
	font-family: var(--display); font-weight: 900; text-transform: uppercase;
	font-size: clamp(1.8rem, 6vw, 3rem); line-height: .9; letter-spacing: -.03em;
	text-shadow: 3px 3px 0 #fff;
}
.st-reset {
	display: inline-block; padding: 3px 10px;
	font-family: var(--mono); font-weight: 800; font-size: .8rem; text-transform: uppercase; letter-spacing: .04em;
	background: var(--sun); border: 3px solid var(--ink); border-radius: 6px;
	transform: rotate(-2deg);
	font-variant-numeric: tabular-nums;
}

/* ---------- buttons ---------- */

.st-btn {
	font: inherit; font-family: var(--display); font-weight: 900; text-transform: uppercase; letter-spacing: .02em;
	font-size: .8rem; line-height: 1;
	padding: 10px 14px; cursor: pointer;
	color: #fff; background: var(--ink);
	border: 3px solid var(--ink); border-radius: 8px;
	box-shadow: 3px 3px 0 rgba(0, 0, 0, .35);
	text-decoration: none; display: inline-block;
	transition: transform .15s cubic-bezier(.3, 1.6, .5, 1), box-shadow .15s, background .2s, border-radius .25s, color .2s;
}
.st-btn:hover { transform: translate(-2px, -2px) rotate(-1.5deg); box-shadow: 5px 5px 0 rgba(0, 0, 0, .45); }
.st-btn:active { transform: translate(2px, 2px); box-shadow: 0 0 0 rgba(0, 0, 0, 0); }
.st-btn:focus-visible, .st-row-head:focus-visible, .st-input:focus-visible, .st-tab:focus-visible, .st-check:focus-visible {
	outline: 4px solid var(--ink); outline-offset: 3px;
}

.st-tz {
	margin-left: auto; flex: none;
	font: inherit; font-weight: 800; font-size: .8rem; padding: 6px 8px; cursor: pointer;
	color: var(--ink); background: #fff;
	border: 3px solid var(--ink); border-radius: 8px;
}
.st-plus {
	width: 56px; height: 56px; padding: 0; flex: none;
	font-size: 2rem; border-radius: 50%; background: var(--hot); color: var(--ink);
	display: grid; place-items: center;
}
.st-plus:hover { transform: rotate(90deg) scale(1.1); }
.st-plus-on { transform: rotate(45deg); background: var(--sun); border-radius: 12px; }
.st-plus-on:hover { transform: rotate(45deg) scale(1.1); }

.st-primary { background: var(--hot); color: var(--ink); }

/* Start/Pause morph: squishes into a pill and settles into its new colour. */
.st-toggle { min-width: 84px; background: var(--ink); color: var(--lime); }
.st-running { background: #e11d2e; border-color: var(--ink); color: #fff; }
.st-morph { animation: st-morph .45s cubic-bezier(.3, 1.6, .5, 1); }
@keyframes st-morph {
	0%   { transform: scale(.7, 1.2); border-radius: 999px; }
	55%  { transform: scale(1.18, .88); border-radius: 999px; }
	100% { transform: scale(1); border-radius: 8px; }
}

.st-del {
	padding: 8px 12px; font-size: 1.1rem; background: #fff; color: var(--ink);
}
.st-del:hover { background: #e11d2e; color: #fff; transform: rotate(12deg) scale(1.1); }

/* ---------- tabs ---------- */

.st-tabs { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.st-tab {
	font-family: var(--display); font-weight: 900; text-transform: uppercase; letter-spacing: .02em;
	font-size: 1rem; padding: 10px 20px; cursor: pointer;
	color: var(--ink); background: #fff;
	border: 3px solid var(--ink); border-radius: 999px;
	box-shadow: 4px 4px 0 var(--ink);
	transition: transform .15s cubic-bezier(.3, 1.6, .5, 1), box-shadow .15s, background .2s;
}
.st-tab:hover { transform: translate(-2px, -2px) rotate(-2deg); box-shadow: 6px 6px 0 var(--ink); }
.st-tab:active { transform: translate(3px, 3px); box-shadow: 1px 1px 0 var(--ink); }
.st-tab-on { background: var(--hot); }

/* ---------- form ---------- */

.st-add {
	display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; padding: 14px;
	background: var(--sun); border: 4px solid var(--ink); border-radius: 14px; box-shadow: 6px 6px 0 var(--ink);
	animation: st-drop .3s cubic-bezier(.3, 1.6, .5, 1);
}
.st-add .st-input { flex: 1 1 200px; }
.st-input {
	font: inherit; font-weight: 700; padding: 10px 12px; min-width: 0;
	color: var(--ink); background: #fff;
	border: 3px solid var(--ink); border-radius: 8px;
}
.st-input::placeholder { color: rgba(0, 0, 0, .5); }
.st-small { width: 130px; }
@keyframes st-drop { from { opacity: 0; transform: translateY(-14px) scale(.97); } to { opacity: 1; transform: none; } }

.st-error {
	margin-bottom: 14px; padding: 10px 14px; border: 3px solid var(--ink); border-radius: 10px;
	background: #e11d2e; color: #fff; font-weight: 800;
}

/* ---------- rows ---------- */

.st-list { list-style: none; margin: 0; padding: 0; }

.st-row {
	position: relative;
	margin-bottom: 14px; overflow: hidden;
	background: var(--c, var(--hot));
	border: 4px solid var(--ink); border-radius: 14px;
	box-shadow: 6px 6px 0 var(--ink);
	transition: box-shadow .15s, translate .15s cubic-bezier(.3, 1.6, .5, 1);
}
.st-row:hover { translate: -2px -2px; box-shadow: 9px 9px 0 var(--ink); }
.st-row.st-open { box-shadow: 9px 9px 0 var(--ink); }
.st-row.st-active { background-image: repeating-linear-gradient(-45deg, transparent 0 12px, rgba(255, 255, 255, .28) 12px 24px); }
@keyframes st-march { to { background-position: 28px 0; } }

.st-enter { animation: st-pop .5s cubic-bezier(.3, 1.6, .5, 1) backwards; }
@keyframes st-pop { from { opacity: 0; transform: translateY(24px) rotate(-2deg) scale(.95); } to { opacity: 1; transform: none; } }

.st-row-head {
	display: flex; flex-wrap: wrap; align-items: center; gap: 10px 12px;
	padding: 14px 16px; cursor: pointer;
}
.st-name {
	flex: 1 1 160px; min-width: 120px; overflow-wrap: break-word; word-break: normal;
	font-family: var(--display); font-weight: 900; text-transform: uppercase;
	font-size: clamp(1.05rem, 3.4vw, 1.5rem); line-height: 1.05; letter-spacing: -.01em;
}
.st-live {
	display: inline-block; margin-left: 10px; padding: 2px 8px; vertical-align: middle;
	font-family: var(--mono); font-size: .65rem; letter-spacing: .08em;
	color: #fff; background: #e11d2e; border: 2px solid var(--ink); border-radius: 999px;
	animation: st-blink 1s steps(2, start) infinite;
}
.st-live::before { content: "\25CF "; }
@keyframes st-blink { to { visibility: hidden; } }

.st-time {
	font-family: var(--mono); font-weight: 900; font-size: clamp(1.1rem, 3.6vw, 1.6rem);
	font-variant-numeric: tabular-nums; min-width: 6.5ch; text-align: center;
	padding: 6px 10px; color: #fff; background: var(--ink);
	border-radius: 8px; border: 3px solid var(--ink);
}
.st-active .st-time { color: var(--lime); text-shadow: 0 0 12px var(--lime); animation: st-pulse 1.2s ease-in-out infinite; }
@keyframes st-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }

/* 7-day preview that slides out on hover */
.st-spark {
	display: flex; align-items: flex-end; gap: 3px; height: 30px; padding: 3px 5px;
	background: #fff; border: 3px solid var(--ink); border-radius: 8px;
	opacity: 0; transform: translateX(14px) scale(.8); max-width: 0; overflow: hidden; padding-left: 0; padding-right: 0; border-width: 0;
	transition: opacity .2s, transform .25s cubic-bezier(.3, 1.6, .5, 1), max-width .25s, padding .25s;
}
.st-spark i { display: block; width: 6px; background: var(--ink); border-radius: 2px 2px 0 0; }
.st-row-head:hover .st-spark, .st-row-head:focus-visible .st-spark {
	opacity: 1; transform: none; max-width: 80px; padding: 3px 5px; border-width: 3px;
}

/* ---------- expanded detail ---------- */

.st-detail {
	padding: 6px 16px 18px; background: #fff; border-top: 4px solid var(--ink);
	animation: st-drop .3s cubic-bezier(.3, 1.6, .5, 1);
}
.st-block { margin-top: 14px; }
.st-label {
	display: inline-block; margin-bottom: 8px; padding: 2px 8px;
	font-family: var(--mono); font-weight: 800; font-size: .8rem; text-transform: uppercase; letter-spacing: .04em;
	background: var(--sun); border: 2px solid var(--ink); border-radius: 6px;
}
.st-chart { display: flex; align-items: flex-end; gap: 8px; height: 110px; }
.st-bar-col { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
.st-bar {
	width: 100%; min-height: 4px; background: var(--c, var(--hot));
	border: 3px solid var(--ink); border-bottom: 0; border-radius: 6px 6px 0 0;
	transform-origin: bottom; animation: st-grow .5s cubic-bezier(.3, 1.4, .5, 1) backwards;
	transition: filter .15s, transform .15s;
}
.st-bar-col:hover .st-bar { transform: scaleY(1.06); filter: brightness(1.1); }
.st-bar-label { margin-top: 6px; font-family: var(--mono); font-weight: 800; font-size: .72rem; text-transform: uppercase; }
@keyframes st-grow { from { transform: scaleY(0); } }

.st-progress { height: 22px; border: 3px solid var(--ink); border-radius: 999px; background: #fff; overflow: hidden; }
.st-progress-fill {
	height: 100%; border-right: 3px solid var(--ink);
	background: repeating-linear-gradient(-45deg, var(--lime) 0 10px, #4ee03d 10px 20px);
	background-size: 28px 28px; animation: st-march 1s linear infinite;
	transition: width .6s cubic-bezier(.3, 1.2, .5, 1);
}
.st-adjust { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }

/* ---------- to-do ---------- */

.st-todo-label { display: flex; align-items: center; gap: 14px; padding: 14px 16px; cursor: pointer; }
.st-todo { background: #fff; border-left-width: 18px; border-left-color: var(--c, var(--hot)); }
.st-todo:hover { rotate: -.4deg; }
.st-check {
	appearance: none; -webkit-appearance: none; flex: none; margin: 0;
	width: 30px; height: 30px; cursor: pointer; position: relative;
	background: #fff; border: 4px solid var(--ink); border-radius: 8px;
	transition: transform .15s cubic-bezier(.3, 1.6, .5, 1), background .15s;
}
.st-check:hover { transform: rotate(-8deg) scale(1.15); background: var(--sun); }
.st-check:checked { background: var(--lime); transform: scale(.9); }
.st-check:checked::after {
	content: ""; position: absolute; left: 7px; top: 1px; width: 8px; height: 16px;
	border: solid var(--ink); border-width: 0 4px 4px 0; transform: rotate(45deg);
}
.st-todo .st-name { text-transform: none; font-family: inherit; font-weight: 800; font-size: 1.15rem; letter-spacing: 0; }

.st-empty {
	margin: 0 0 14px; padding: 28px 16px; text-align: center; list-style: none;
	font-family: var(--display); font-weight: 900; text-transform: uppercase; font-size: 1.1rem;
	background: #fff; border: 4px dashed var(--ink); border-radius: 14px;
}

/* ---------- to-do due dates + overdue ---------- */

.st-due-field { display: flex; flex-direction: column; gap: 4px; flex: 1 1 180px; font-size: .8rem; font-family: var(--mono); text-transform: uppercase; font-weight: 800; }
.st-due-field .st-input { width: 100%; }

.st-due {
	flex: none; padding: 3px 8px; white-space: nowrap;
	font-family: var(--mono); font-weight: 800; font-size: .72rem; letter-spacing: .04em;
	background: var(--sun); border: 2px solid var(--ink); border-radius: 6px;
}
.st-due-over { background: #e11d2e; color: #fff; animation: st-shake 1.6s ease-in-out infinite; }
.st-overdue {
	background: repeating-linear-gradient(-45deg, #ffe0e0 0 12px, #fff 12px 24px);
	border-color: #e11d2e; box-shadow: 6px 6px 0 #e11d2e;
}
.st-overdue:hover { box-shadow: 9px 9px 0 #e11d2e; }
@keyframes st-shake { 0%, 88%, 100% { transform: none; } 91% { transform: rotate(-4deg); } 94% { transform: rotate(4deg); } 97% { transform: rotate(-2deg); } }

/* ---------- forecast panel ---------- */

.st-fc-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 12px; }
.st-fc-title {
	flex: 1 1 140px; min-width: 0; font-family: var(--display); font-weight: 900; text-transform: uppercase;
	font-size: clamp(1.3rem, 2.2vw, 1.8rem); letter-spacing: -.02em; line-height: 1;
	text-shadow: 3px 3px 0 var(--sun);
}
.st-gear { width: 40px; height: 40px; padding: 0; font-size: 1.2rem; display: grid; place-items: center; background: var(--sun); color: var(--ink); }
.st-gear[aria-expanded="true"] { background: var(--hot); transform: rotate(60deg); }
.st-fc-refresh { background: var(--lime); color: var(--ink); }

.st-set {
	display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; padding: 12px;
	background: var(--sun); border: 3px solid var(--ink); border-radius: 12px;
	animation: st-drop .3s cubic-bezier(.3, 1.6, .5, 1);
}
.st-set-field { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; align-items: center; font-family: var(--mono); font-weight: 800; font-size: .75rem; text-transform: uppercase; }
.st-set-field span { grid-column: 1 / -1; }
.st-set-field .st-input { width: 100%; font-size: .85rem; }
.st-set-note { margin: 0; font-size: .75rem; font-weight: 700; }

.st-fc-nav { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
.st-fc-month { flex: 1 1 120px; min-width: 0; text-align: center; font-family: var(--display); font-weight: 900; text-transform: uppercase; font-size: 1.05rem; }
.st-fc-step { padding: 8px 12px; background: var(--ink); }
.st-fc-today { background: var(--hot); color: var(--ink); }

.st-fc-weekdays, .st-fc-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.st-fc-weekdays span {
	text-align: center; font-family: var(--mono); font-weight: 800; font-size: .7rem; text-transform: uppercase; padding-bottom: 4px;
}

.st-day-count {
	position: absolute; top: 3px; right: 3px; min-width: 18px; padding: 1px 5px;
	font-family: var(--mono); font-weight: 900; font-size: .65rem; line-height: 1.3; text-align: center;
	color: #fff; background: var(--ink); border-radius: 999px;
}
.st-day-count-over { background: #e11d2e; }
.st-day-label {
	display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
	width: 100%; margin: 2px 0; text-align: left;
	font-size: .62rem; font-weight: 800; line-height: 1.15; overflow-wrap: anywhere;
}
.st-day {
	position: relative; min-height: 58px; padding: 4px;
	display: flex; flex-direction: column; justify-content: space-between; align-items: flex-start;
	font: inherit; cursor: pointer; color: var(--ink); background: #fff;
	border: 3px solid var(--ink); border-radius: 8px;
	transition: transform .15s cubic-bezier(.3, 1.6, .5, 1), background .15s, box-shadow .15s;
}
.st-day:hover { transform: translate(-2px, -2px) rotate(-1.5deg); box-shadow: 3px 3px 0 var(--ink); background: var(--sun); }
.st-day:active { transform: translate(1px, 1px); box-shadow: none; }
.st-day:focus-visible { outline: 4px solid var(--ink); outline-offset: 2px; }
.st-day-num { font-family: var(--display); font-weight: 900; font-size: .95rem; line-height: 1; }
.st-day-other { opacity: .45; }
.st-day-today { background: var(--sky); box-shadow: 3px 3px 0 var(--ink); }
.st-day-sel { background: var(--hot); box-shadow: 3px 3px 0 var(--ink); opacity: 1; }

.st-dots { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; width: 100%; }
.st-dots b { font-family: var(--mono); font-size: .6rem; line-height: 1; }
.st-dot { display: block; width: 8px; height: 8px; border: 2px solid var(--ink); border-radius: 50%; }
.st-dot-lecture { background: var(--sky); }
.st-dot-deadline { background: var(--hot); border-radius: 2px; }
.st-dot-todo { background: var(--sun); transform: rotate(45deg); border-radius: 2px; }
.st-dot-overdue { background: #e11d2e; }

.st-fc-detail { margin-top: 14px; padding-top: 12px; border-top: 4px solid var(--ink); }
.st-fc-dayhead { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; font-family: var(--display); text-transform: uppercase; }
.st-fc-dayhead span { font-family: var(--mono); font-size: .75rem; }
.st-fc-none { margin: 0; padding: 14px; text-align: center; border: 3px dashed var(--ink); border-radius: 10px; font-weight: 800; }
.st-fc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; max-height: 340px; overflow-y: auto; }
.st-fc-item {
	display: grid; grid-template-columns: 5.6rem 1fr auto; gap: 10px; align-items: center;
	padding: 8px 10px; border: 3px solid var(--ink); border-radius: 10px; background: #fff;
	border-left-width: 12px;
	animation: st-drop .25s cubic-bezier(.3, 1.6, .5, 1) backwards;
}
.st-k-lecture { border-left-color: var(--sky); }
.st-k-deadline { border-left-color: var(--hot); }
.st-k-todo { border-left-color: var(--sun); }
.st-k-overdue { border-left-color: #e11d2e; background: #ffe9e9; }
.st-fc-time { font-family: var(--mono); font-weight: 900; font-size: .9rem; font-variant-numeric: tabular-nums; }
.st-fc-body { display: flex; flex-direction: column; min-width: 0; overflow-wrap: anywhere; }
.st-fc-body em { font-style: normal; font-size: .8rem; opacity: .7; }
.st-fc-badge {
	padding: 2px 8px; font-family: var(--mono); font-weight: 800; font-size: .65rem; letter-spacing: .05em;
	background: var(--ink); color: #fff; border-radius: 999px; white-space: nowrap;
}
.st-k-overdue .st-fc-badge { background: #e11d2e; }
.st-fc-status { margin-top: 12px; font-family: var(--mono); font-weight: 700; font-size: .72rem; opacity: .8; min-height: 1em; }

/* ---------- logged-out ---------- */

.st-login { text-align: center; }
.st-login p { margin: 0 0 14px; font-family: var(--display); text-transform: uppercase; font-size: 1.2rem; }
.st-login .st-btn { background: var(--hot); color: var(--ink); }

/* ---------- cursor follower ---------- */

.st-cursor {
	position: fixed; top: 0; left: 0; z-index: 99999;
	width: 40px; height: 40px; pointer-events: none;
	opacity: 0; transition: opacity .2s;
}
.st-cursor::before {
	content: ""; display: block; width: 100%; height: 100%;
	border: 3px solid #111; border-radius: 50%;
	background: rgba(255, 210, 63, .0);
	transition: transform .2s cubic-bezier(.3, 1.6, .5, 1), background .2s;
}
.st-cursor-on { opacity: 1; }
.st-cursor-hot::before { transform: scale(1.7); background: rgba(255, 210, 63, .55); }
.st-cursor-down::before { transform: scale(.7); background: rgba(255, 92, 138, .7); }

/* ---------- small screens + reduced motion ---------- */

@media (max-width: 960px) {
	.st-layout { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 560px) {
	.st-fc-item { grid-template-columns: 1fr auto; }
	.st-fc-time { grid-column: 1 / -1; }
	.st-day { min-height: 52px; padding: 2px; }
	.st-day-label { display: none; }
	.st-login { padding: 12px; border-width: 3px; box-shadow: 6px 6px 0 var(--ink); }
	.st-left, .st-forecast { padding: 12px; border-width: 3px; box-shadow: 6px 6px 0 var(--ink); }
	.st-row-head { flex-wrap: wrap; }
	.st-name { flex: 1 1 100%; }
	.st-spark { display: none; }
	.st-time { margin-left: auto; }
}

@media (prefers-reduced-motion: reduce) {
	.st-app *, .st-app *::before, .st-app *::after, .st-cursor, .st-cursor::before {
		animation: none !important; transition: none !important;
	}
}

/* ---------- PIN gate (shared, read-only view) ---------- */

.st-gate {
	max-width: 440px; margin: 40px auto; padding: 24px; text-align: center;
	background: #fff; border: 4px solid var(--ink); border-radius: 16px; box-shadow: 8px 8px 0 var(--ink);
}
.st-gate-title { margin: 0 0 8px; font-family: var(--display); text-transform: uppercase; font-size: 1.6rem; }
.st-gate p { margin: 0 0 14px; }
.st-gate-row { display: flex; gap: 10px; justify-content: center; }
.st-pin { text-align: center; letter-spacing: .3em; font-size: 1.3rem; width: 9em; }
.st-gate-error { margin: 14px 0 0; }

/* ---------- timetable tab ---------- */

.st-tt { display: grid; gap: 10px; }
.st-tt[hidden] { display: none; }
.st-tt-nav { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.st-tt-label { flex: 1; font-family: var(--display); text-transform: uppercase; font-size: .95rem; }
.st-tt-day { background: #fff; border: 3px solid var(--ink); border-radius: 12px; box-shadow: 4px 4px 0 var(--ink); overflow: hidden; }
.st-tt-dayhead { display: flex; justify-content: space-between; padding: 6px 12px; background: var(--sky); border-bottom: 3px solid var(--ink); font-weight: 800; }
.st-tt-today { background: var(--sun); }
.st-tt-day .st-fc-list { margin: 0; padding: 8px; }
```
