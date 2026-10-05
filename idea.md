# Rockbreakers — Employee & Field Service Management System

**Status:** Concept / architecture draft. Tech stack intentionally not chosen yet.
**Source:** Derived from the handwritten architecture notes (Service / Admin / Purchase / Meta pages).

---

## 1. What this system is

A multi-department, multi-role internal platform for a field-service business that sells and services
rock-breaking / heavy machinery. Engineers travel to customer sites, inspect machines, capture proof of
the visit, and raise requirements for spare parts. Those requirements flow through Sales (quotation),
Purchase (procurement) and Accounts (expense settlement), with every step logged.

**The core business loop:**

```
Manager schedules a JOB on a site (visit / installation / breakdown / preventive)
and assigns one or more engineers to it
        ↓
The job appears on every assigned engineer's WORK CALENDAR
        ↓
Engineer marks daily attendance (selfie + live location)
        ↓
Engineer reaches the site → on-site arrival selfie + live location  ← proves the visit
        ↓
Engineer captures site photos / machine condition
        ↓
Engineer raises a spare-part / service requirement from the job
        ↓
Sales team converts requirement → Quotation → sent to customer
        ↓
Customer approves → Purchase checks availability → procures → commits a date
        ↓
Engineer executes the work → closes the job (with completion photos)
        ↓
Accountant settles engineer expenses (site-wise, category-wise)
        ↓
Everything written to an immutable activity log
```

Four things make this different from a generic HRMS: **proof-of-presence** (geo + selfie + timestamp,
captured twice — once for the day, once at the site), a **shared work calendar** that every role reads
from and acts on, **site-centric work** (everything hangs off a Site, not off an office), and a
**requirement → quotation → purchase chain** that starts in the field.

---

## 2. Organisation model

### 2.1 Hierarchy

```
                       ┌─────────┐
                       │  ADMIN  │   full control, configuration, all reports
                       └────┬────┘
                            │
              ┌─────────────┼─────────────┬──────────────┐
              │             │             │              │
        ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐ ┌──────▼──────┐
        │  Service  │ │   Sales   │ │ Purchase  │ │  Accounts   │
        │  Manager  │ │  Manager  │ │  Manager  │ │   Manager   │
        └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └──────┬──────┘
              │             │             │              │
        ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐ ┌──────▼──────┐
        │ Engineers │ │Sales Exec │ │ Purchase  │ │ Accountant  │
        │   (~10)   │ │           │ │  Officer  │ │             │
        └───────────┘ └───────────┘ └───────────┘ └─────────────┘

        HR / Admin — cross-cutting: onboarding, leave, payroll inputs
```

Hierarchy is **data, not code** — a user row carries `department_id`, `role_id` and `reports_to_user_id`.
That means a new department or an extra layer (e.g. Regional Manager) is a config change, not a rewrite.

### 2.2 Departments

| Department | Owns | Primary objects |
|---|---|---|
| **Service** | Site jobs, inspections, installations, execution | Job, JobAssignment, Attendance, SiteCheckIn, Capture, Requirement |
| **Sales** | Customer relationship, pricing, quotations | Lead, Customer, Quotation, Order |
| **Purchase** | Stock availability, vendors, procurement | Purchase Request, PO, Vendor |
| **Accounts** | Expense approval, reimbursement, invoicing | Expense, Reimbursement, Invoice |
| **HR / Admin** | Employee lifecycle, leave, attendance policy | Employee, Leave, Shift, Document |
| **Inventory / Store** | Physical stock, issue to engineer | Item, Stock, Issue Note |

### 2.3 Roles and what they can do

| Role | Capabilities |
|---|---|
| **Super Admin** | Everything. Full create / read / update / delete on **users, roles, departments and permission sets**. Can impersonate for support. Sees all logs. |
| **Admin** | Full CRUD on **users and roles**, site master, item master, calendar override, org-wide reports. Can assign and reassign any engineer to any job. |
| **Manager** (per dept.) | Schedule jobs, assign engineers, approve/reject items from own department, see own team's calendar and data only |
| **Engineer** | Own calendar, own attendance, own site check-ins, own captures, raise requirements, submit own expenses |
| **Sales Executive** | Own leads/customers, create quotations, see requirements routed to them |
| **Purchase Officer** | See approved requirements, check availability, raise POs, commit dates |
| **Accountant** | See all submitted expenses, approve/reject, mark reimbursed, export |
| **HR** | Employee records, leave, attendance correction requests |

**Permission model:** RBAC with a **scope dimension**.
A permission is `action : resource : scope`, e.g. `approve : expense : department`,
`read : job : own`, `read : job : team`, `manage : role : all`. Scope values: `own` → `team` → `department` → `all`.
This is what lets one "Manager" role serve every department without cloning it per department.

---

## 3. Core modules

### 3.1 Employee Management
- Employee master: personal details, joining date, department, role, reporting manager, documents.
- **Login / auth**: phone-or-email + password, token session, optional device binding for engineers.
- Leave, holidays, shifts.
- Deactivation instead of deletion — history must survive.

### 3.2 Attendance & proof-of-presence — the two-selfie model

There are **two distinct selfie events**, and conflating them is the single easiest way to get this
module wrong. They answer different questions and are stored as different records.

| | **Daily Attendance** | **Site Check-In** |
|---|---|---|
| Question it answers | "Did this employee start work today?" | "Was this engineer actually at the site?" |
| Who does it | Every employee, all departments | Engineers, on field jobs only |
| How often | Once per day (in + out) | Once per site, per job — repeated if multiple sites in a day |
| Anchored to | The day | A specific `job_id` + `site_id` |
| Geofence checked against | Office / assigned base (or none for field staff) | **That site's registered coordinates** |
| Feeds | HR, payroll, leave | Job verification, billing, customer proof |

An engineer visiting three sites in one day produces **one** attendance record and **three** site
check-ins.

**Both record types require all of:**
- `selfie_url` — camera-only capture; gallery upload blocked, screenshots rejected
- `latitude`, `longitude`, `accuracy_meters`
- `captured_at` (device clock) **and** `received_at` (server clock) — divergence is flagged
- `device_id`, and a mock-location flag read from the OS where available

**Site check-in additionally requires:** `job_id`, `site_id`, and a matching **check-out** when the
engineer leaves — the difference between the two gives time-on-site, which is what managers actually
want to see and what justifies the expense claim.

**Geofence rule:** the server computes the distance between the captured point and the site's registered
coordinates. Outside the radius → the record is **accepted but flagged** `out_of_geofence` for manager
review. **Never silently reject.** The engineer is standing in a quarry, GPS drifts, and a hard block
strands someone who is genuinely there. Flag it; let a human judge.

**Anti-spoofing, in order of value:** camera-only capture (not gallery), OS mock-location detection,
server timestamp divergence check, same-device check, and a flag when two check-ins from one engineer
are geographically impossible for the time elapsed between them. None of these is perfect alone; the
combination plus a visible audit log is what actually deters it.

### 3.3 Site Management
- Site master: customer, address, lat/long, geofence radius, machines installed on site, site contact.
- Engineer ↔ Site assignment (an engineer can be mapped to many sites; a site can have a primary engineer).
- Site history timeline: every visit, capture, requirement and job on that site, in order.

### 3.4 Job Scheduling (visits, installations, breakdowns)

The notes said "schedule visit for engineer". In practice the manager schedules several *kinds* of work
and some of them need a **crew, not one person**. So the scheduled unit is a **Job**, and `visit` is one
of its types.

**Job types**

| Type | Typical duration | Engineers | Notes |
|---|---|---|---|
| `INSPECTION` | hours | 1 | Routine survey, quotation groundwork |
| `BREAKDOWN` | hours–1 day | 1–2 | Highest priority, often unscheduled/emergency |
| `PREVENTIVE` | hours | 1 | Recurring — generated from a schedule template |
| `INSTALLATION` | **multi-day** | **2–6 (crew)** | Commissioning a machine on site; has a lead engineer |
| `TRAINING` / `HANDOVER` | hours | 1–2 | Customer-facing |

**A Job carries:** `site`, `customer`, `type`, `priority`, `scheduled_start`, `scheduled_end`,
`description`, `machines involved`, `created_by`, and a list of assigned engineers.

**Engineer assignment is many-to-many** (`JobAssignment` join table), because an installation needs a
crew. Each assignment row carries a `role_on_job` — `LEAD` / `MEMBER` / `TRAINEE` — and its own
acceptance status. **Exactly one LEAD per job**, enforced at the service layer; the lead is who closes
the job and signs off the completion report.

**Multi-day jobs** (installations) are the reason the model needs `scheduled_start` and `scheduled_end`
rather than a single date. A multi-day job generates **one calendar entry per day** per assigned
engineer, and expects **a site check-in on each of those days**. A 4-day installation with 3 engineers
should produce 12 site check-ins; anything less is visible as a gap.

**Assignment safety checks** run when a manager assigns an engineer, as warnings not hard blocks:
- already assigned to another job in that window (double-booking)
- on approved leave
- not skill-matched to the machine type
- travel time between consecutive jobs is implausible

**Lifecycle:**
```
Draft → Scheduled → Accepted (by engineer) → In Progress (first site check-in)
      → Work Done → Closed (lead submits completion report)

side branches:  Rescheduled   Cancelled   On Hold (waiting for parts)
```

`On Hold` matters: it is the status a job sits in while the Purchase chain runs, and it is what stops a
blocked job from being counted as an overdue one.

- Engineer-initiated jobs (emergency breakdown calls) are allowed but enter as `Pending Manager Approval`.
- Reassigning or removing an engineer from a job is logged with a reason and notifies both engineers.

### 3.5 Work Calendar

One shared calendar surface, filtered by who is looking at it. This is the daily home screen for
everyone, not a separate report.

**Views**
- **Day / Week / Month** toggle on web; **Day + Week agenda** on mobile (month grids are unusable on a phone).
- **My Calendar** — what every user sees by default: their own assigned jobs, meetings, leave, holidays.
- **Team Calendar** — managers only: a resource/timeline view, one row per engineer, jobs as bars
  across the dates. This is the view a manager schedules *from*, because it is the only one where
  double-booking and idle capacity are visible at a glance.
- **Site Calendar** — all jobs on one site, in order.
- **Department Calendar** — scoped by the same `own / team / department / all` permission scope used
  everywhere else, so the calendar needs no separate permission logic.

**What appears on it:** jobs assigned to you, leave (own and, for managers, the team's), public
holidays, preventive-maintenance jobs auto-generated from recurrence templates, and quotation/PO
follow-up reminders for sales and purchase staff.

**Actions available directly from a calendar entry** — the calendar is interactive, not a read-only list:
- **Mark daily attendance** (selfie + live location) from the day header
- **Check in / check out of a site** from the job card itself
- Accept or request reschedule of a job
- Open the job, add captures, raise a requirement, submit expenses
- For managers: drag to reschedule, click an empty slot to create a job, assign or swap engineers

**Colour/status legend** is driven by job status, with overdue and `out_of_geofence` flagged distinctly —
a manager should be able to spot a problem day without opening anything.

**Offline:** the next 7 days of a user's calendar are cached on the device, so an engineer heading into
a no-signal site still knows where they are going and can still check in.

### 3.6 User, Role & Permission Administration

The admin console is a first-class module, not an afterthought screen. Admin has **full create, read,
update and delete** over every user and every role.

**User management**
- Create, view, edit, deactivate and delete users; bulk import from spreadsheet for the initial load.
- Assign and change: department, role, reporting manager, assigned sites, base location, skill tags.
- Reset password, force logout on all devices, unbind a device, enable/disable the account.
- Reassign a user's open work when they change role or leave — the system **must not** allow deleting a
  user with open jobs without first prompting for reassignment.

**Role management**
- Create and delete custom roles; rename them; clone an existing role as a starting point.
- Edit a role's permission matrix: for each resource (user, role, site, job, calendar, attendance,
  capture, requirement, quotation, purchase, expense, report, log), tick the actions
  (`create / read / update / delete / approve`) and pick the scope (`own / team / department / all`).
- See which users hold a role before changing it, and a preview of what the change will take away.

**Delete semantics — decided once, applied everywhere**

| Target | Behaviour |
|---|---|
| **User** | **Soft delete.** Account disabled, login blocked, record retained. Their attendance, check-ins, captures and approvals stay intact and attributable — deleting them would destroy the audit trail and the evidence behind closed jobs. Hard delete reserved for Super Admin, for genuine data-entry mistakes only, and blocked once the user has any linked records. |
| **Role** | Blocked while any user holds it. Admin must reassign those users first; the UI offers a bulk "move all holders to role X". |
| **Department** | Blocked while it has users or open jobs. |
| **Master data** (site, item, customer) | Soft delete; hidden from new entries, preserved on historical ones. |

**Guard rails** — these prevent the two ways an admin console gets a company locked out:
- The last remaining Super Admin cannot be deleted, demoted or deactivated.
- An admin cannot remove their own `manage : role` permission.
- Every user/role/permission change writes to the activity log with before/after state.
- Permission changes take effect on the user's next request, not on next login — a revoked permission
  should stop working immediately.

### 3.7 Capture (site evidence)
- Multiple photos/videos per job, each carrying its own geolocation and timestamp.
- Tagged: `machine`, `problem_area`, `before` / `after`, free-text note.
- For installations, a **mandatory completion photo set** before the lead can close the job.
- Captures are **append-only**. Deleting a capture is a soft-delete recorded in the log, with a reason.

### 3.8 Requirement → Quotation → Purchase chain
The spine of the system. One continuous thread, not three disconnected forms.

```
Requirement (raised by Engineer during a job)
  items[], qty, urgency, linked captures, linked site & machine
        │
        ├──► Service Manager approves (technical validity)
        │
        ├──► Sales:  builds Quotation (price, margin, taxes, validity)
        │            → sent to customer → Approved / Rejected / Revised
        │
        └──► Purchase: checks stock availability
                      ├─ in stock     → Issue Note → engineer collects
                      └─ not in stock → Purchase Request → PO → vendor
                                        → committed delivery date flows back
                                          to the Requirement and the Job
```

Every stage keeps a pointer back to the originating `requirement_id`, so the field engineer can see
"where is my part?" without asking anyone.

### 3.9 Expense Management
- Engineer submits expenses against a **job** (travel, food, lodging, toll, consumables).
- Mandatory dimensions: **site** and **category** — exactly the "site wise / category wise" requirement
  from the notes, and what makes per-site profitability computable.
- Flow: `Draft → Submitted → Manager Approved → Accountant Verified → Reimbursed`
  (reject at any step with a reason).
- Receipt photo attached; policy limits per category enforced with a soft warning and a hard cap.

### 3.10 Meta / Activity Log (audit trail)
A single append-only `activity_log` table that every module writes to:

`actor_id, actor_role, action, entity_type, entity_id, before_json, after_json, ip, device, timestamp`

Rules: no updates, no deletes, no application path that can bypass it. Approvals, rejections, status
changes, geofence flags, permission changes and login events all land here. This is the "Meta → logs"
box in the notes, and it is what makes the approval chain defensible later.

### 3.11 Notifications
Event-driven: job assigned, crew member added or removed, schedule changed, requirement approved, quotation sent, part arrived, expense reimbursed,
attendance missing. Channels: in-app → push → WhatsApp/SMS for field staff → email for office staff.

### 3.12 Reports & Dashboards
Each role gets a different home screen:
- **Engineer:** today's calendar, jobs to accept, pending site check-outs, my expenses, my parts status
- **Manager:** team calendar + team on map today, unassigned jobs, pending approvals, overdue jobs, geofence flags, SLA breaches
- **Sales:** open quotations, conversion rate, pipeline value
- **Purchase:** open requirements, stock-outs, pending POs, vendor delivery performance
- **Accounts:** pending reimbursements, cost per site, cost per category, monthly burn
- **Admin:** everything, plus audit log search

---

## 4. Data model (entity sketch)

```
Department ──< Role ──< RolePermission >── Permission
     │
User (Employee) ──< UserSiteAssignment >── Site ──< Machine
     │                                       │        │
     ├──< Attendance (daily: selfie, geo)    │        │
     ├──< Leave                              │        │
     │                                       │        │
     └──< JobAssignment >────── Job ─────────┘        │
            (role_on_job:          │  type, priority, │
             LEAD/MEMBER/          │  scheduled_start,│
             TRAINEE;              │  scheduled_end,  │
             accepted_at)          │  status ─────────┘
                                   │
                                   ├──< SiteCheckIn (selfie, geo, in/out)  ← per engineer, per day
                                   ├──< Capture (photo, geo, tags)
                                   ├──< Requirement ──< RequirementItem >── Item
                                   │         ├──< Quotation ──< QuotationItem
                                   │         └──< PurchaseRequest ──< PurchaseOrder >── Vendor
                                   └──< Expense >── ExpenseCategory

CalendarEntry ── derived view over: Job (per assigned day), Leave, Holiday, Reminder
ActivityLog ── append-only, references any entity, written by every module

Customer ──< Site
Item ──< Stock (per store)
```

**Key design choices**

1. **Job is the hub.** Site check-ins, captures, requirements and expenses all hang off a job, so the
   true cost and effort of a piece of site work is a single query.
2. **`JobAssignment` is a real table, not a column.** An installation needs a crew; a `job.engineer_id`
   column would have forced a redesign the first time two engineers went to one site together.
3. **The calendar is a derived view, not a table.** It reads jobs, leave and holidays. Storing calendar
   entries separately would create two sources of truth that drift the moment a job is rescheduled.
4. **Soft deletes everywhere.** `deleted_at` plus a log entry. Nothing in an approval chain is ever
   hard-deleted.
5. **Status fields are enums with an explicit transition table**, not free strings. Illegal transitions
   are rejected at the service layer.
6. **Media lives in object storage**, the DB holds only keys and metadata. Thumbnails are generated on
   upload — field photos are large and the network is bad.
7. **Every row carries** `created_by`, `updated_by`, `created_at`, `updated_at`.

---

## 5. System architecture (tech-agnostic)

```
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│  Mobile App      │   │  Web Dashboard   │   │  Admin Console   │
│  (Engineers)     │   │  (Managers,      │   │  (Super Admin)   │
│  offline-capable │   │   Sales, Purch., │   │                  │
│  camera + GPS    │   │   Accounts, HR)  │   │                  │
└────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘
         └──────────────────────┼──────────────────────┘
                                │  HTTPS
                       ┌────────▼────────┐
                       │   API Gateway   │  auth, rate limit, request log
                       └────────┬────────┘
                                │
     ┌──────────┬──────────┬────┴─────┬──────────┬──────────┐
     │  Auth &  │ Employee │  Field   │ Commerce │ Finance  │
     │   RBAC   │  & HR    │ Service  │ (Sales / │ (Expense/│
     │          │          │  (Job,   │ Purchase)│ Invoice) │
     │          │          │ Calendar,│          │          │
     │          │          │ Attend., │          │          │
     └──────────┴──────────┴────┬─────┴──────────┴──────────┘
                                │
   ┌────────────┬───────────┬───┴───────┬──────────────┐
┌──▼────────┐ ┌─▼───────┐ ┌─▼───────┐ ┌─▼───────┐ ┌────▼────────┐
│Relational │ │ Object  │ │  Cache  │ │   Job   │ │Notification │
│    DB     │ │ Storage │ │(session)│ │  Queue  │ │  Service    │
│(core data)│ │(photos) │ │         │ │ (async) │ │(push/SMS/   │
└───────────┘ └─────────┘ └─────────┘ └─────────┘ │ email)      │
                                                  └─────────────┘
```

Start as a **modular monolith** — one deployable, hard module boundaries, a separate schema per module.
At roughly 10 engineers this is the right size; the boundaries above mean it can be split later if it
ever genuinely needs to be.

### Offline-first on mobile (non-negotiable)
Quarries and industrial sites have no signal. The engineer app must:
- queue check-ins, captures, requirements and expenses locally
- sync when connectivity returns, preserving the **original device timestamp and GPS fix**
- show per-item sync status so the engineer knows what has actually reached the server
- resolve conflicts server-side; last-write-wins only for drafts, never for approved records

---

## 6. Cross-cutting concerns

| Concern | Approach |
|---|---|
| **Auth** | Token sessions with refresh, device binding for engineer accounts, forced logout from admin |
| **Authorisation** | Middleware checks `action:resource:scope` on every endpoint; scope narrows the DB query, it does not filter after fetch |
| **Audit** | One centralised interceptor writes `activity_log`; no module writes its own ad-hoc log |
| **File handling** | Pre-signed direct upload to object storage; server stores metadata only |
| **Localisation** | Multi-language UI planned from day one (field staff and office staff differ) |
| **Data retention** | Photos archived to cold storage after N months; logs retained indefinitely |
| **Backups** | Daily DB snapshot plus point-in-time recovery; media bucket versioned |

---

## 7. Build order (suggested phases)

**Phase 1 — Foundation & Admin console**
Auth, Employee master, Department / Role / Permission with the full permission matrix editor,
Site master, **full user and role CRUD**, activity log from day one.
*Exit criteria:* an admin can create a department, a custom role with a chosen permission set, a user
and a site; edit and deactivate each of them; and every one of those actions appears in the log.

**Phase 2 — Jobs & Work Calendar**
Job creation with types, multi-engineer assignment with a lead, my-calendar and team-calendar views,
job lifecycle, accept/reschedule.
*Exit criteria:* a manager schedules a 3-day installation with a 3-engineer crew from the team calendar
and all three see it on their own calendar.

**Phase 3 — Attendance & proof-of-presence**
Daily attendance selfie + location, site check-in / check-out selfie + location, geofence validation and
flagging, manager review screen for flagged records.
*Exit criteria:* a manager can open a completed job and see who was on site, when, where and for how long.

**Phase 4 — Captures & Expenses**
Site photo capture with tags and completion sets; expense submission against jobs with site-wise and
category-wise tagging, approval chain, accountant view.

**Phase 5 — Requirement → Quotation**
Engineer raises a requirement from a job; sales builds and sends a quotation.

**Phase 6 — Purchase & Inventory**
Availability check, purchase request, PO, vendor, delivery date flowing back to the engineer.

**Phase 7 — Reports, dashboards, notifications**
Role-based dashboards, exports, push/WhatsApp notifications, SLA tracking.

**Phase 8 — Hardening**
Offline sync edge cases, audit log search UI, retention policy, performance.

---

## 8. Open questions to settle before building

1. Does a quotation go directly to the customer, or does it always need manager approval first? yes
2. Can an engineer raise a requirement **without** a scheduled job (emergency breakdown call)? yes
3. Is inventory tracked per store/warehouse, or is there one central store? no one storeon
4. Are expense limits per category fixed company-wide, or per role/grade?
5. Does the customer ever need a portal (view job reports, approve quotations), or is this fully internal?
6. Is there an existing accounting system (Tally / Zoho / QuickBooks) that invoices must sync to?
7. Scale — roughly 10 engineers, but how many sites, jobs per day, and photos per job?

**New, raised by the scheduling and calendar requirements:**

8. **Installation crews** — does a typical installation need 2–3 engineers or more, and does it ever run
   across multiple weeks? This decides whether a simple start/end date range is enough or whether a job
   needs sub-tasks with their own dates.
9. **Attendance on a multi-day installation** — does an engineer staying near the site mark daily
   attendance from the site itself, or does the first site check-in of the day count as attendance too?
   (Recommendation: keep them separate but let the app offer "use this to mark attendance as well" in
   one tap, so the engineer is not photographed twice in the same minute.)
10. **Half-day and overnight jobs** — does the calendar need time-of-day slots, or is a date enough?
    Time slots cost more to build but are the only way to fit two jobs into one engineer's day cleanly.
11. **Who can reassign a crew member mid-job** — only the scheduling manager, or any admin?
12. **Does a customer ever need to appear on the calendar** (a confirmed appointment slot they were told
    about), which would mean reschedules need a customer notification?
13. **Can an engineer decline a job**, or only request a reschedule with a reason?
14. **Hard delete of a user** — is there any legal or practical need for it, or is deactivation always
    sufficient? (Recommendation: deactivation only; the audit trail is the point of the system.)

---

## 9. Not decided yet

Tech stack: frontend framework, backend language, database, mobile approach (native vs cross-platform),
hosting, object storage provider, notification provider. Everything above is written so these choices
can be made independently and swapped without reworking the model.
