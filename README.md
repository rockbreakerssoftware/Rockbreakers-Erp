# Rockbreakers — Field Service & Employee Management

A MERN application for a machinery service business: schedule jobs and installations, prove the engineer
was on site with a geo-tagged selfie, and settle the cost site-by-site.

Design notes are in [idea.md](idea.md); the build plan is in [plan.md](plan.md).

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite + React Router, hand-written CSS design system |
| Backend | Node + Express |
| Database | MongoDB (Atlas M0 free tier) via Mongoose |
| Auth | JWT in an httpOnly cookie, bcrypt hashes |
| Maps | **Leaflet + OpenStreetMap** — free, no API key, no billing account |
| Reverse geocoding | **Nominatim (OSM)** — free, called once per check-in, cached on the record |
| Geofencing | Haversine, computed in our own code — no service at all |
| Selfies | `getUserMedia` + canvas, camera only, resized to ~60 KB in the browser |
| Images | Stored in MongoDB, served from `/api/media/:id` |

Everything above is free. No paid API keys anywhere.

---

## Run it locally

```bash
cp .env.example .env        # then fill in MONGO_URI and JWT_SECRET
npm install
npm install --prefix client

npm run dev:server          # :5000  — API
npm run dev:client          # :5173  — Vite, proxies /api to :5000
```

Open http://localhost:5173.

To load demo data (8 roles, 9 users, 3 customers, 3 sites, 4 jobs including a 3-engineer installation):

```bash
npm run seed
```

**Demo sign-ins** — password `rockbreakers123` for all:

| Role | Email |
|---|---|
| Super Admin | `admin@rockbreakers.in` |
| Service Manager | `manager@rockbreakers.in` |
| Engineer | `amit@rockbreakers.in` |
| Sales Executive | `sales@rockbreakers.in` |
| Purchase Officer | `purchase@rockbreakers.in` |
| Accountant | `accounts@rockbreakers.in` |

Each one lands on a different dashboard and sees a different navigation — that is the permission system
working, not separate builds.

---

## Deploy to Render — one free web service

The API also serves the built React app, so this is **a single service**, not two.

### 1. Database (free, 2 minutes)

1. Create a free cluster at [mongodb.com/atlas](https://www.mongodb.com/cloud/atlas) — pick the **M0** tier.
2. Database Access → add a user with a password.
3. Network Access → **allow `0.0.0.0/0`**. Render's free tier has no static outbound IP, so an IP
   allowlist will lock you out.
4. Copy the connection string. It looks like
   `mongodb+srv://user:pass@cluster.mongodb.net/rockbreakers`.

### 2. Web service

Push this repository to GitHub, then on Render → **New → Web Service**:

| Setting | Value |
|---|---|
| Runtime | Node |
| Plan | **Free** |
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |

### 3. Environment variables

| Key | Value |
|---|---|
| `MONGO_URI` | your Atlas connection string |
| `JWT_SECRET` | a long random string |
| `NODE_ENV` | `production` |
| `SEED_ON_BOOT` | `true` for the first deploy, then set it to `false` |

`SEED_ON_BOOT` is safe to leave on — roles and departments are upserted, and demo users are only created
when the database has no users at all. Turning it off afterwards just saves a few hundred milliseconds
on each cold start.

A `render.yaml` is included if you prefer a Blueprint deploy.

### What you get

One URL serving everything. No CORS, no second service, no custom domain needed.

---

## Free-tier realities this was built around

| Constraint | How the app handles it |
|---|---|
| **Disk is ephemeral** — anything written to disk vanishes on restart | Images go to MongoDB, never to the filesystem. Set `CLOUDINARY_URL` later if you outgrow it. |
| **Service sleeps after 15 min idle**, ~50 s to wake | The first screen is a branded "starting up" state that explains the wait instead of showing a blank page. |
| **512 MB database** | Selfies are resized to 640 px and compressed to ~60 KB in the browser before upload — roughly 8,000 check-ins. Receipts are compressed the same way. |
| **No static outbound IP** | Atlas must allow `0.0.0.0/0`. |
| **HTTPS required for camera and GPS** | Render provides HTTPS on every service, so both work out of the box. |

---

## How the permission system works

A permission is a string: `resource : action : scope`, e.g. `job:update:team`.

Scopes widen in this order: `own` → `team` → `department` → `all`.

A role holds a flat list of these. The server resolves the highest scope a user has for a given
resource-and-action, then **uses it to narrow the database query** — it is never a filter applied after
fetching. A user with `job:read:own` does not receive other people's jobs and then have them hidden; the
query never asks for them.

This is why one "Manager" role works for every department instead of needing a clone per department, and
why the Roles screen is a single grid rather than hundreds of checkboxes. Edit it at
**Administration → Roles & permissions**.

Two guard rails exist because they are the two ways a system like this gets everyone locked out:
the last Super Admin cannot be deleted, demoted or deactivated, and an admin cannot strip role-management
permission from their own role.

---

## The two-selfie model

"Mark attendance with a selfie" and "prove the engineer visited the site" are different questions, so
they are different records:

|  | Daily Attendance | Site Check-In |
|---|---|---|
| Answers | Did this person start work today? | Was this engineer actually at the site? |
| Frequency | Once a day | Once per site, per job |
| Anchored to | The day | A `job` and a `site` |
| Geofenced against | Nothing (field staff move) | That site's registered coordinates |
| Feeds | HR and payroll | Job verification and billing |

An engineer visiting three sites in one day produces **one** attendance record and **three** site check-ins.

**A check-in outside the geofence is flagged, never rejected.** GPS drifts badly at quarry sites, and a
hard block would strand an engineer who is genuinely standing there. The record is accepted, marked
`OUT_OF_GEOFENCE`, and queued for a manager to judge at **Attendance → Flagged check-ins**, with a map
showing the site boundary and where the person actually was.

---

## Project layout

```
server/
  index.js        express app, Mongo connection; serves /api and the built SPA from one port
  models/         all Mongoose schemas in one file
  middleware/     auth, permission + scope resolution, audit logging
  routes/         one router per resource — request handling lives here, no separate controller layer
  utils/          geo (haversine + Nominatim), generic CRUD factory, seed
client/src/
  styles/         tokens.css, base.css, app.css, features.css
  lib/            api client, auth context, geolocation, formatting
  components/     Shell, UI primitives, SelfieCapture, Map, Icon
  pages/          one per route
```

---

## What is not built yet

The quotation → purchase order → vendor → inventory chain stops at manager approval of a requirement;
payroll, a customer portal, WhatsApp/SMS notifications, offline sync and multi-language are all deferred.
None of them change the schema above. Offline sync matters most in real use — engineers work where there
is no signal — and is the first thing to add after this is in production.
