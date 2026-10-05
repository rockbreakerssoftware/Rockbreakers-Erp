# Build Plan — Rockbreakers FSM

Implementation plan for [idea.md](idea.md). MERN, single Render web service, free tier throughout.

---

## 0. Stack decisions (locked)

| Concern | Choice | Why this one |
|---|---|---|
| **Frontend** | React 18 + Vite + React Router | Vite builds to static files the API server can serve — required for single-service deploy |
| **Backend** | Node + Express | — |
| **Database** | MongoDB Atlas **M0 free** (512 MB) | Only free managed Mongo; lives outside Render, so no paid DB add-on |
| **Auth** | JWT in `httpOnly` cookie + bcrypt | No external auth service to pay for |
| **Geolocation capture** | Browser `navigator.geolocation` | Free, no key, no SDK, works in every mobile browser over HTTPS |
| **Maps / tiles** | **Leaflet + OpenStreetMap** | Free, no API key, no credit card, no request cap for our volume. (Google Maps needs billing enabled.) |
| **Reverse geocoding** | **Nominatim (OSM)** — address from lat/long | Free; 1 req/sec limit, so we call it once per check-in, server-side, and cache the result on the record |
| **Distance / geofence** | Haversine computed in our own code | No service needed at all |
| **Selfie capture** | `getUserMedia` + `<canvas>`, camera-only | Browser-native. Blocks gallery upload, which is the whole point of the control |
| **Image storage** | Client-side resize → JPEG ~60 KB → stored in Mongo, served via `/api/media/:id` | Render's free tier has **ephemeral disk** — anything written to disk is lost on restart. External object storage is the alternative but needs another account. Cloudinary is wired as an optional upgrade via env var. |
| **Styling** | Hand-written CSS with design tokens | No framework look. See §6. |
| **Deploy** | One Render Web Service, free tier | `npm run build` builds the client; Express serves `/api/*` and the built SPA from the same port |

### The free-tier constraints we design around
1. **Ephemeral disk** → no file uploads to disk. Images go to Mongo (compressed) or Cloudinary.
2. **Service sleeps after 15 min idle**, ~50 s cold start → a branded loading state, and no cron-dependent features in the core flow.
3. **512 MB Mongo** → selfies resized to ~60 KB (≈8,000 check-ins), originals never stored, old media archivable.
4. **One service, one port** → API and SPA share an origin, so cookies are first-party and CORS is a non-issue.

---

## 1. Repository layout

```
rockbreakers/
├── package.json          root — Render runs build + start from here
├── render.yaml           infra-as-code (optional, documents the service)
├── .env.example
├── server/
│   ├── index.js          express app + Mongo connection, serves API + client/dist
│   ├── models/           User Role Department Site Customer Job
│   │                     Attendance SiteCheckIn Capture Requirement
│   │                     Expense Leave Holiday Media ActivityLog
│   ├── middleware/       auth.js — authenticate, requirePermission, scope, audit
│   ├── routes/           one router per resource; handlers live here, no controller layer
│   └── utils/            geo.js (haversine, nominatim), crud.js (CRUD factory), seed.js
└── client/
    ├── vite.config.js    dev proxy → :5000
    └── src/
        ├── styles/       tokens.css, base.css
        ├── lib/          api.js, auth.jsx, can.js, geo.js, camera.js
        ├── components/   Shell, Sidebar, Table, Modal, Field, Button,
        │                 StatusPill, SelfieCapture, MapPicker, Empty
        └── pages/        Login, Dashboard, Calendar, Jobs, JobDetail,
                          Attendance, Sites, Users, Roles, Departments,
                          Expenses, Requirements, ActivityLog, Profile
```

---

## 2. Data model → Mongoose

| Collection | Notes |
|---|---|
| `users` | `name, email, phone, passwordHash, role→Role, department→Department, reportsTo→User, sites[], skills[], baseLocation, active` |
| `roles` | `name, key, permissions: ["job:create:team", …], isSystem` |
| `departments` | `name, key` |
| `customers`, `sites` | site holds `location {lat,lng}`, `geofenceRadius`, `machines[]` |
| `jobs` | `type, status, priority, site, customer, scheduledStart, scheduledEnd, description, assignments[{user, roleOnJob, status, acceptedAt}], createdBy, closedAt, completionNotes` |
| `attendances` | daily: `user, date, checkIn{selfie,lat,lng,accuracy,at,address,flags[]}, checkOut{…}` |
| `sitecheckins` | `job, site, user, date, in{…}, out{…}, distanceMeters, outOfGeofence` |
| `captures` | `job, site, user, media, tags[], note, lat, lng, phase(before/after)` |
| `requirements` | `job, site, raisedBy, items[], urgency, status, approvals[]` |
| `expenses` | `user, job, site, category, amount, date, receipt→Media, status, approvals[]` |
| `media` | `data Buffer, contentType, size, uploadedBy, kind` |
| `activitylogs` | `actor, action, entityType, entityId, before, after, ip, at` — append-only |

`assignments` is embedded in `jobs` (idiomatic Mongo, still many-to-many) and indexed on `assignments.user`, which is the hot query for "my calendar".

---

## 3. Permission system

- Permission string: `resource:action:scope` — e.g. `job:update:team`, `user:delete:all`.
- `Role.permissions` is a flat array of these strings.
- `requirePermission('job','update')` middleware resolves the **highest scope** the user holds and attaches `req.scopeFilter` — a Mongo filter (`{}` for `all`, `{department}` for department, `{'assignments.user': me}` for own).
- **Scope narrows the query, never filters after fetch.**
- Same strings drive the frontend: `can('user','delete')` hides buttons. Server still enforces.

**Seeded roles:** Super Admin, Admin, Service Manager, Engineer, Sales Executive, Purchase Officer, Accountant, HR.

---

## 4. API surface

```
POST   /api/auth/login              /logout   GET /api/auth/me
CRUD   /api/users                   + PATCH /:id/password, /:id/active
CRUD   /api/roles                   (permission matrix editor)
CRUD   /api/departments
CRUD   /api/customers  /api/sites
CRUD   /api/jobs                    + POST /:id/assign  DELETE /:id/assign/:userId
                                    + PATCH /:id/status  POST /:id/accept
GET    /api/calendar?from&to&view   my | team | site | department
POST   /api/attendance/check-in     /check-out    GET /api/attendance
POST   /api/jobs/:id/check-in       /check-out    (site check-in)
CRUD   /api/captures  /api/requirements  /api/expenses
       + PATCH /api/expenses/:id/status
GET    /api/media/:id
GET    /api/logs                    (admin, filterable)
GET    /api/dashboard               role-aware payload
```

---

## 5. Task list

### Phase A — Foundation
- [ ] A1 Root `package.json` with Render build/start scripts; `.env.example`; `render.yaml`
- [ ] A2 Express app, Mongo connection, error handler, static SPA serving + history fallback
- [ ] A3 All Mongoose models
- [ ] A4 Auth: login, logout, me, JWT cookie, bcrypt
- [ ] A5 Permission middleware + scope resolution
- [ ] A6 Audit middleware writing `activitylogs` on every mutation
- [ ] A7 Seed script: departments, 8 roles with permission sets, super admin, demo sites/users

### Phase B — Client foundation & design system
- [ ] B1 Vite + React Router + API client with cookie auth
- [ ] B2 **Design tokens** — colour, type scale, spacing, radius, shadow; light + dark
- [ ] B3 App shell: sidebar nav (permission-filtered), topbar, mobile drawer, responsive grid
- [ ] B4 Primitive components: Button, Field, Select, Table, Modal, Pill, Card, Empty, Toast
- [ ] B5 Login page + auth context + protected routes

### Phase C — Admin (users, roles, departments, sites)
- [ ] C1 Users: list, create, edit, deactivate, delete, reset password, assign sites
- [ ] C2 Roles: list, create, clone, delete, **permission matrix editor**
- [ ] C3 Departments CRUD
- [ ] C4 Customers + Sites CRUD with **map location picker** (Leaflet) + geofence radius

### Phase D — Jobs & Calendar
- [ ] D1 Job CRUD, types, priority, status transitions, On Hold
- [ ] D2 Crew assignment UI — add/remove engineers, set LEAD, conflict warnings
- [ ] D3 Job detail page: tabs for crew, check-ins, captures, requirements, expenses
- [ ] D4 **Work Calendar** — month + week + day, My/Team/Site views, colour by status
- [ ] D5 Team timeline view (row per engineer) with double-booking visible
- [ ] D6 Accept / reschedule-request from calendar

### Phase E — Attendance & proof-of-presence
- [ ] E1 `SelfieCapture` component — getUserMedia, front camera, canvas, resize, no gallery
- [ ] E2 `useGeolocation` hook — high accuracy, permission states, accuracy readout
- [ ] E3 Daily attendance check-in / check-out
- [ ] E4 Site check-in / check-out against a job, haversine geofence, flagging
- [ ] E5 Manager review screen for flagged records; map of today's team

### Phase F — Field data
- [ ] F1 Captures: camera photo + tags + geo, gallery per job
- [ ] F2 Requirements raised from a job, manager approve/reject
- [ ] F3 Expenses: submit against job with site + category, approval chain, accountant view

### Phase G — Dashboards, logs, polish
- [ ] G1 Role-aware dashboard with real counts
- [ ] G2 Activity log viewer with filters
- [ ] G3 Empty states, loading skeletons, cold-start splash, error boundary
- [ ] G4 Mobile pass: every page at 360 px
- [ ] G5 `README.md` with Render deploy steps

---

## 6. Design direction (so it does not look generated)

**Rejected on sight:** purple/indigo gradients, glassmorphism, emoji in headings, oversized rounded cards, centred hero text, `box-shadow: 0 20px 60px rgba(0,0,0,.3)`, Tailwind default palette.

**Instead — an industrial-operations look:**
- **Palette:** near-black ink `#14161a`, warm greys, a single utilitarian accent (safety amber `#d97706`) used only for primary action and active nav. Status colours are semantic and muted, not neon.
- **Type:** Inter (one family), tight scale — 12/13/14/16/20/28. Headings are **size + weight**, never colour. Tabular numerals in all tables.
- **Density:** this is a tool people use all day. 36 px rows, 8 px base spacing unit, 6 px radius maximum. Compact by default.
- **Structure:** fixed left sidebar (240 px) collapsing to a drawer under 1024 px; content max-width 1400 px; tables become stacked cards under 720 px.
- **Depth:** 1 px borders carry the layout, not shadows. One shadow level, only for overlays.
- **Motion:** 120–160 ms, opacity and 2–4 px transforms only. Nothing bounces.
- **Dark mode** via `prefers-color-scheme` plus a manual toggle.

---

## 7. Deployment — single Render web service

**Render settings**
- Runtime: Node · Plan: Free · Region: Singapore
- Build: `npm install && npm run build`
- Start: `npm start`
- Health check path: `/api/health`

**Root scripts**
```json
"build": "npm install --prefix client && npm run build --prefix client",
"start": "node server/index.js"
```

**Env vars on Render:** `MONGO_URI`, `JWT_SECRET`, `NODE_ENV=production`, optional `SEED_ON_BOOT=true` for first run, optional `CLOUDINARY_URL`.

Express serves `client/dist` as static and falls back to `index.html` for any non-`/api` route, so React Router deep links work. One service, one URL, no CORS.

---

## 8. Explicitly out of scope for this build

Full quotation→PO→vendor→inventory chain (requirements stop at manager approval), payroll, customer portal, WhatsApp/SMS notifications, offline sync (needs a service worker + local queue — noted in idea.md as essential for production, deferred here), multi-language. Each is additive and does not change the schema above.
