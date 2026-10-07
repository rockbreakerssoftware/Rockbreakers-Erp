# Design system — Rockbreakers

The audit that prompted this work is in [design-audit.md](design-audit.md).
Everything below is implemented; nothing here is aspirational.

---

## Direction

Industrial operations software. Dense, high-contrast, built to be used all day by people who are
either at a desk running dispatch or on a quarry site with a phone in one hand.

Borders carry the layout, not shadows. One accent, used sparingly. Warm neutrals rather than the
blue-grey default. Decoration is absent on purpose — whitespace and weight do the work.

**Explicitly rejected:** gradients, glassmorphism, neon, gradient text, emoji as icons, decorative
blobs, hero illustrations, centred-everything layouts, shadows on every surface, and filler copy like
"Welcome to your dashboard". Labels are the words the business already uses: Jobs, Crew, Site check-in,
Requirements, Geofence.

---

## Tokens

All in [`client/src/styles/tokens.css`](client/src/styles/tokens.css). Nothing in the app writes a
raw colour, size or duration.

### Colour

An 11-step warm neutral ramp (`--n-0` … `--n-1000`) and a 9-step brand ramp. Surfaces are named by
role, not by value, so the same markup works in both themes:

| Token | Role |
|---|---|
| `--bg` | the page beneath everything |
| `--surface` | cards, tables, the plane content sits on |
| `--surface-2` | table headers, inset strips |
| `--surface-3` | hover fills, segmented-control troughs |
| `--overlay-bg` | modal scrim |

Dark mode steps each surface up in lightness rather than going flat black, so a popover over a card
over the page reads as three planes.

**The brand is hi-vis yellow, and its fills carry dark text.** Ink on brand-500 is 8.91:1; white on it
is 1.92:1 and is never used. That constraint is the look rather than a workaround — black on yellow is
what a machine decal does, and it suits a hydraulics business better than a generic SaaS blue.

`--accent` (brand-500) is the hue for indicators, active nav bars, focus rings and chart marks.
`--accent-solid` is the interactive fill, with `--accent-fg` as the dark label on it in both themes.

**Status hues are checked for separation, not just contrast.** Moving the brand to yellow meant warn
could not also be orange: orange sits 17° from danger red, which made "Attendance not marked" read as
"Overdue jobs" at a glance. Warn stays amber at 31° from red. Amber is only 12° from the brand yellow,
but the two never compete because the brand is always a fill behind dark text and warn is always text.
Accent pill text is near-ink for the same reason — a brand pill must not look like a warning.

Status colours are four tokens each — `-text`, `-bg`, `-border`, `-solid` — rather than a colour and a
guess at its tint.

**Contrast is verified, not assumed.** Twenty text/background pairs are checked across both themes.
That check found and fixed two real failures: white on amber at 3.19:1, and success text on its own
tint at 4.47:1. Everything now clears WCAG AA (4.5:1 for text, 3:1 for secondary and nav labels).

### Type

Inter, three weights (400/500/600). Scale: **12 / 13 / 14 / 16 / 20 / 24 / 32**.

Headings are distinguished by size and weight, never colour. Tracking tightens as size grows
(`--tracking-tight` at 24px+). Tabular numerals everywhere numbers are compared — tables, KPI values,
number inputs.

### Spacing, geometry, motion

Strict 4px grid, `--sp-1` … `--sp-16`. No arbitrary pixel values.

Three radii (6 / 8 / 12). Control heights: 28 / 34 / 40, plus a 44px minimum touch target.

Motion is 120 / 160 / 200ms on a single easing curve, limited to opacity and small transforms.
`prefers-reduced-motion` collapses all of it.

---

## Components

| Component | What it does |
|---|---|
| **Shell** | Collapsible 240→64px rail with tooltips, state remembered. Top bar: breadcrumbs, go-to, theme, user menu. Mobile: bottom bar + drawer. |
| **Go-to palette** | Ctrl/Cmd+K, arrow keys, Enter. Moves between sections and says so — it does not search records. |
| **Table** | Optional sort (with `aria-sort`), pagination, dense mode. On phones becomes purpose-built cards, not a transposition. |
| **Stat** | Three tiers (lead / default / quiet), optional trend and icon. Tiers are what give a KPI grid hierarchy. |
| **Empty** | Compact single row by default; `size="page"` for a genuinely empty screen. |
| **Card** | Minimum head height so cards with and without subtitles align their bodies. |
| Button, Pill, Tabs, Modal, Toast, Banner, Avatar | Full hover / active / focus / disabled / loading coverage. |

### The mobile table

The old behaviour printed every column as a label/value row — six rows per person, with
"Department: Service" directly above "Designation: Service Engineer".

Columns now declare their role: `primary` becomes the card heading, `secondary` its sub-line,
`wide` spans the full card, `hideOnMobile` drops out. A page can replace the whole card with `card`.
Exactly one of the table and the cards is in the accessibility tree at any width, since `display:none`
removes the other from it.

---

## Two decisions worth knowing

**Absence is quiet.** The payroll ribbon painted every day with no record in saturated red, so a
month with little data was a wall of alarm — the loudest thing on the page signalling that nothing
happened. Pill tone and ribbon weight are now separate: a day with no record is the faintest mark on
the strip. Red is reserved for a day that contradicts itself.

**A zero needs no attention.** Dashboard tiles at zero never appear under "Needs attention"; they fall
through to Reference. Colour is reserved for a number that wants someone to do something.

---

## Mobile

Field engineers are the reason this matters. Bottom bar carries the four routes their role actually
reaches, chosen per role, with More opening the full drawer. Safe-area insets respected, page padding
clears the bar. Touch targets 44px. No horizontal overflow at 390px on any screen, verified.

---

## What is still worth doing

- **Charts.** Expense breakdowns are bar lists. Real charts need a library decision and a palette
  extension; the token work to support them is done.
- **Bulk actions.** The table supports selection structurally but no page uses it, because every bulk
  operation would need an endpoint, and this pass did not touch the API.
- **Record search.** The palette navigates sections only. A real search needs a server endpoint.
- **Calendar empty states.** An empty month is still six quiet rows; clicking a day to schedule works
  but is not advertised.
- **Form density.** Forms were not reworked in this pass beyond inheriting the new tokens.

---

## Verification

Playwright, five roles × fourteen routes × 1440px and 390px — 96 screenshots per pass, re-run after
every stage. Final pass: no JavaScript errors, no React warnings, no horizontal overflow.

Backend untouched: `git diff --name-only -- server/` across the whole redesign returns nothing, and
both API suites still pass 64/64 and 26/26.
