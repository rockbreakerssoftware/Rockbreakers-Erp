# UI audit — Rockbreakers

Audited against the live build at `rockbreakers-erp.onrender.com`, commit `02332ef`.
97 screenshots: 5 roles × 14 routes × 1440px and 390px, captured with Playwright.

**Existing approach:** React 18 + Vite, hand-written CSS with custom properties in four files
(`tokens.css`, `base.css`, `app.css`, `features.css`). No CSS framework. Inter via Google Fonts,
a custom inline SVG icon set, light and dark themes already wired to `prefers-color-scheme` plus a
manual override.

The foundation is sound — there are tokens, a 4px spacing base, 1px borders rather than shadows, no
gradients, no glassmorphism. The problems are not "it looks AI-generated"; they are **hierarchy,
density and mobile** problems, plus a handful of craft defects.

---

## What is actually wrong

### 1. The dashboard has no hierarchy — this is the worst offender
Thirteen KPI tiles render in one flat 4-column grid, all identical in size, weight and colour.
"Today's jobs" and "Sites" are given exactly the same visual importance. The 13th tile wraps onto a
row by itself, which reads as a layout bug. Nothing tells the eye where to start.

There are no trend indicators, so every number is context-free. One tile ("Attendance") holds a
string — "Not marked" — in a slot the other twelve use for a numeral, so the type scale breaks mid-row.

The same information also appears twice: a warning banner says attendance is not marked, and a tile
immediately below says "Attendance / Not marked".

### 2. Severity is inverted on the payroll ribbon
The month-at-a-glance ribbon paints every day with no record in saturated red. On a month with little
data that is a solid wall of red — the loudest element on the page, used to signal *absence*. It
reads as a system failure. Absence should be the quietest state; only genuine exceptions should be red.

The same page stacks a blue info banner and an amber warning banner above the content, so roughly
180px of chrome precedes any data.

### 3. Mobile is a transposition, not a design
This matters most: engineers use this on phones at quarry sites.

- The engineer's mobile dashboard spends ~600px on three single-number cards before reaching "My day",
  which is the only thing they opened the app for. The two actions that matter — mark attendance,
  check in at site — are not reachable without scrolling.
- Tables collapse into stacked cards by printing *every* column as a label/value row. The Employees
  list shows six rows per person, including "Department: Service" directly above
  "Designation: Service Engineer". The person's name is right-aligned against an "EMPLOYEE" label
  rather than being the card's heading.
- Action buttons are 28–34px. The minimum comfortable touch target is 44px, and these are gloved hands.
- Row actions mix icon-only buttons with a text button ("Disable"), and put a red delete immediately
  beside it.
- Navigation is only reachable through a hamburger drawer; there is no persistent way to move between
  the three or four screens an engineer actually uses.

### 4. Empty states are oversized and uninformative
An empty "My day" card occupies ~400px to say one sentence. Empty list states carry no primary action
in most places. An empty month in the calendar is six rows of nothing with no hint that clicking a day
creates a job.

### 5. Tables stop short of being usable tools
No column sorting, no pagination, no bulk actions, no density control, no sticky header in practice.
Within a single column the treatment is inconsistent: Priority renders "Normal" as plain text but
"High" and "Urgent" as pills. Job type pills are all the same neutral grey, so Breakdown and
Inspection — very different urgencies — look identical.

### 6. The top bar is empty
It holds a theme toggle and nothing else. No breadcrumbs, no search, no user menu (the user menu is
at the bottom of the sidebar). On desktop that is 56px of full-width chrome doing almost no work.

### 7. Craft defects
- **Icon set**: hand-drawn paths at inconsistent optical weight. Several glyphs (briefcase, chart,
  receipt) are visibly cruder than the rest and do not share a construction grid.
- **Card header alignment**: a card with a subtitle and one without sit side by side, so their body
  content starts at different Y positions.
- **Segmented controls** fill the active segment with near-black. Two of them beside an amber primary
  button puts three heavy elements in a row competing for attention.
- **Today's calendar cell** is tinted amber across the full cell *and* carries an amber date chip —
  the same emphasis applied twice.
- **Terminology drifts**: the nav says "Employees", the page it opens is titled "Users".
- **Numeric columns** mix `0` and `—` for the same meaning in one table.
- **React key warning** in the console on the payroll page — a fragment in a list without a key.
- Legends sit detached from what they explain, at 9px.

### What is already right, and should be preserved
Token-driven colour, the 4px spacing base, 36px table rows, 1px borders, restrained single accent,
real light/dark themes, no gradients or decorative noise, `prefers-reduced-motion` respected, and
no horizontal overflow at 390px on any screen.

---

## Plan

Six stages, each committed separately.

1. **Tokens** — extend to a full 11-step neutral ramp with explicit elevation layers, a type scale of
   12/13/14/16/20/24/32, semantic status tokens, motion tokens, and verified AA contrast.
2. **Icons** — replace the hand-drawn set with Lucide at one stroke width and one size scale.
3. **Shell** — top bar with breadcrumbs, global search and user menu; collapsible sidebar; a mobile
   bottom bar for the routes a field engineer uses; 44px touch targets.
4. **Shared components** — a real data table (sort, paginate, density, sticky header, bulk select),
   KPI tiles with trend and tiers, full button/badge/tab/modal/toast state coverage, compact empty
   and skeleton states.
5. **Pages** — dashboard hierarchy, payroll severity fix, purpose-built mobile cards, calendar and
   job polish.
6. **Verify** — re-shoot all roles at both widths, critique against this list, fix what remains.

Business logic, API calls, routes and data models are not touched.
