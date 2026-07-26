# NestPG Web Admin — Implementation Progress

**App:** `apps/web-admin` (Angular 22, standalone, signals/zoneless, Tailwind v4, Material M3)
**Backend:** NestJS API at `http://localhost:3000` (proxied via `/api` → `/api/v1`)
**Design source:** `docs/frontend/nestpg_system/<screen>/{screen.png, code.html}`
**Run:** Node 22.22.3 (`nvm use 22.22.3`), dev server on port 4200 (`web-admin` in `.claude/launch.json`)

## Legend
✅ Done · 🟡 In progress · ⬜ Pending · 🔌 API wired · 🧩 UI-only (API missing)

## Infrastructure
- ✅ API layer: `ApiService`, `TokenStore`, `authInterceptor`, env + proxy
- ✅ `AuthService` (login / register / OTP / me / logout)
- ✅ Design system (`os-*` components), theme tokens (light/dark), app shell, sidebar, topbar, routing, role gating

## Screens

| # | Screen | Route | Status | APIs | Pending / Notes |
|---|--------|-------|--------|------|-----------------|
| 1 | Login | `/auth/login` | ✅ 🔌 | `POST /auth/login`, `send-otp`, `verify-otp` | password + OTP modes |
| 2 | Register Organization | `/auth/register` | ✅ 🔌 | `POST /auth/register` | org/name UI-only (not in DTO) |
| 3 | Forgot Password | `/auth/forgot-password` | ✅ 🔌 | `POST /auth/send-otp` | OTP-based |
| 4 | Reset Password | `/auth/reset-password` | ✅ 🔌 | `POST /auth/verify-otp` | — |
| 5 | Super Admin Command Center | `/dashboard` (SUPER_ADMIN) | ✅ 🔌 | `properties`, `admin/ops/metrics` | role-aware home switch |
| 6 | Owner Executive Dashboard | `/dashboard/owner` | ✅ 🔌 | `dashboard/revenue|occupancy`, `properties` | charts fall back when API empty |
| 7 | Manager Operations Homepage | `/dashboard/manager` | ✅ 🔌 | `bookings` | — |
| 8 | Property Portfolio Hub | `/properties` | ✅ 🔌 | `GET /properties` | search + type filters, KPI strip |
| 9 | Property Workspace | `/properties/workspace?id=` | ✅ 🔌 | `properties`, `properties/{id}/buildings` | hero, KPIs, buildings, alerts |
| 10 | Bed Inventory Workspace | `/inventory` | ✅ 🔌 | `properties/{id}/buildings`→floors→rooms→`rooms/{id}/beds`, `beds/{id}/status` | floor/room/bed map, status drawer |
| 11 | Residents Command Center | `/residents` | ✅ 🔌 | `GET /users` | search, segments, KPIs, table |
| 12 | Resident CRM Workspace | `/residents/crm?id=` | ✅ 🔌 | `users/{id}`, `kyc/{userId}`, `kyc/{userId}/review` | 7 tabs, profile header |
| 12a | — Resident KYC tab | tab | ✅ 🔌 | `kyc/{userId}`, review | approve/clarify/reject |
| 12b–g | — Payments/Docs/Stay/Activity/Tickets/Comms tabs | tabs | ✅ 🧩 | — | scaffolded; integration points marked |
| 13 | Bookings & Reservations Workspace | `/bookings` | ✅ 🔌 | `GET /bookings` | shared queue, KPIs, search |
| 14 | Reservations | `/bookings/reservations` | ✅ 🔌 | `GET /reservations` | — |
| 15 | Waitlist | `/bookings/waitlist` | ✅ 🔌 | `GET/DELETE /waitlist` | priority list, remove |
| 16 | Check-In | `/bookings/check-in` | ✅ 🔌 | `bookings/{id}/check-in` | queue + action |
| 17 | Check-Out | `/bookings/check-out` | ✅ 🔌 | `bookings/{id}/check-out` | queue + action |
| 18 | Payment Transactions Feed | `/finance/payments` | ✅ 🧩 | — | designed; payments API pending |
| 19 | Payments & Collections | `/finance/collections` | ✅ 🧩 | — | designed; collections API pending |
| 20 | Operations Command Center | `/operations` | ✅ 🔌 | `admin/ops/metrics|jobs|alerts` | subsystems, quick links |
| 21 | Tickets | `/operations/tickets` | ✅ 🧩 | — | kanban board; tickets API pending |
| 22 | KYC | `/operations/kyc` | ✅ 🔌 | `GET /users`, `kyc/{userId}/review` | queue + review drawer |
| 23 | Revenue Analytics | `/analytics/revenue` | ✅ 🔌 | `dashboard/revenue`, `properties` | trend chart, by-property |
| 24 | Occupancy Analytics | `/analytics/occupancy` | ✅ 🔌 | `dashboard/occupancy`, `properties` | donut + per-property bars |
| 25 | Communications Hub | `/communication` | ✅ 🧩 | — | split layout; messaging API pending |
| 26 | Users & Team | `/admin/users` | ✅ 🔌 | `GET /users`, `users/{id}/role|status` | inline role/status edit |
| 27 | Roles & Permissions | `/admin/roles` | ✅ | — | role cards + capability matrix |
| 28 | Settings | `/admin/settings` | ✅ 🔌 | `GET/PUT users/me/profile` | profile form + theme toggle |

## Next pending screen
→ **ALL SCREENS COMPLETE** ✅ (28/28). Dev + production builds pass, 0 TS/console errors.

> Note: data-driven screens render real API responses; they show empty states until the backend DB is seeded and a user is logged in (login screen is wired). This is correct integration, not placeholder UI.

## Remaining integration points (backend endpoints not yet exposed)
- Payments / transactions feed (Screen 18)
- Collections / dues ageing (Screen 19)
- Tickets / maintenance (Screen 21)
- Messaging / communications threads (Screen 25)
- Resident CRM sub-tabs: Payments, Documents, Activity, Tickets, Communications (12b–g)
- Register: organization + full-name fields (RegisterDto only accepts phone/email/password)

When these endpoints land, wire each marked component's service call — UI is already built to the design.

## Verification (last run)
- `ng build` development: ✅ clean
- `ng build` production: ✅ 515 kB initial / 124 kB transfer, 0 warnings/errors
- Preview: ✅ shell, auth, dashboards, roles, occupancy verified; **0 console errors** across routes
- Light + dark themes: ✅ token-driven
- Responsive: ✅ sidebar overlay < lg, grids collapse

## API Integration Audit (verified against running backend)

Probed the live backend + entity/DTO definitions and corrected every contract mismatch found:

| Area | Bug found | Fix |
|------|-----------|-----|
| Properties | API shape ≠ frontend model (`propertyType`/`availableBeds`/`minPricePaisa`/`addressLine1`; no `occupiedBeds`/`revenue`/`type`) | Added adapter in `PropertiesService` (occupied = total − available; revenue = occupied × maxPricePaisa; type/address mapped). Owner + Super Admin dashboards now use the adapted service. **Verified live: 3 real properties render ("Acc PG"), 0 console errors.** |
| Auth — OTP | `send-otp`/`verify-otp` require a `purpose` field that wasn't sent → 400 | Added `OtpPurpose` to `AuthService`; screens pass `REGISTRATION` / `LOGIN` / `PASSWORD_RESET` |
| Auth — register | Navigated to `/dashboard`, but register only sends an OTP (no token) | Register now routes to OTP verify with `purpose=REGISTRATION` |
| Auth — verify | `verify-otp` returns `{accessToken, user}` only | After verify, store token + call `me()` then enter app |
| Auth — errors | Parsed `error.message`, but envelope is `{errors:[{code,message}]}` | Added `apiErrorMessage()` with code→message humanization; wired into all 4 auth screens |
| Roles | Backend roles (`SUPER_ADMIN`/`PG_OWNER`/`PROP_MANAGER`/`TENANT`…) ≠ nav personas | `AuthService.mapRole()` maps backend→nav roles; Users admin dropdown + counts use real `UserRole` values |
| KYC review | Sent `decision: NEEDS_REVIEW` + `notes` | DTO only accepts `APPROVED`/`REJECTED` + `reason`; KYC queue & CRM now send the correct contract (reason required on reject) |

### Auth flow contract (confirmed)
`register {phone,email,password}` → OTP sent → `verify-otp {phone,otp,purpose:REGISTRATION}` → `{accessToken, user}` → `GET /users/me`. Password login also supported via `login {phone,password}`. Dev OTP is logged server-side (`[DEV OTP] phone → otp`) — needed to complete an authed login in the UI.

## Live authenticated verification (logged in as OPS_ADMIN)

Drove a real logged-in session against the running backend and verified each screen with live data. Additional fixes applied:

| Screen | Result | Fix made |
|--------|--------|----------|
| Command Center (`/dashboard`) | ✅ Properties **3**, Beds **55**, Revenue **₹4.16 L**, Occupancy **1.8%** | Now reads `dashboard/occupancy` + `dashboard/revenue` aggregates (property-list bed/revenue fields are 0) |
| Occupancy analytics | ✅ 55 beds / 1 occupied / 54 vacant | Mapped `occupancyRate`→ratePct |
| Revenue analytics | ✅ real expected rent | Mapped `expectedRentPaisa`→total |
| Bookings (`/bookings`) | ✅ **20 live bookings**, Confirmed/Checked-Out pills | `rentPaisa`, `CONFIRMED` status, name←`bookingNumber` |
| Check-In | ✅ **19 confirmed** in queue, check-in action | queue filters `CONFIRMED` (was `RESERVED`) |
| Reservations | ✅ **20 live**, "Converted" pills | added `CONFIRMED`/`CONVERTED`/`EXPIRED` pill tones |
| Residents (`/residents`) | ✅ graceful empty state | — (see backend issue below) |
| Properties | ✅ 3 real properties | adapter (earlier) |
| **Avatar crash** | ✅ fixed | `EntityAvatarComponent` now null-safe (`name` was undefined for real bookings → `undefined.trim()` flooded the console) |

Dashboard normalization moved into `DashboardService` (maps `expectedRentPaisa`/`occupancyRate`/booking-count payloads). **0 console errors** across all verified authed screens. Dev + prod builds clean.

## Backend issues found (not frontend)
- ~~`GET /users` → **500** for OPS_ADMIN~~ → **FIXED** (see below). Residents / Users & Team / KYC-queue now show live data.
- Property **list** endpoint returns `totalBeds: 0` / `availableBeds: 0` even though `dashboard/occupancy` reports 55 beds — per-property bed counts aren't populated on the list DTO, so per-property occupancy bars read 0%. Aggregates are correct.
- Bookings/reservations carry only `tenantId` (no tenant name) → rows show the booking number.

## Backend fix — `GET /users` 500 (resolved)

**Endpoint:** `GET /api/v1/users` (admin list). **Files:** `backend/libs/users/src/{users.service.ts, entities/user.entity.ts, entities/user-profile.entity.ts, users.service.spec.ts}`.

**Two root causes** in `UsersService.listUsers()` (both only triggered on the list path, which is why `me`/`getById` worked):
1. `leftJoinAndSelect('u.profile', 'p')` referenced a relation that **didn't exist** — `User` had no inverse `profile` property (only `UserProfile` owned the FK). → "Relation 'profile' was not found".
2. `orderBy('u.created_at', 'DESC')` used the **raw DB column** instead of the entity property `createdAt`. Under `skip`/`take` + a join, TypeORM's `createOrderByCombinedWithSelectExpression` resolves the order column via entity metadata and threw `Cannot read properties of undefined (reading 'databaseName')`.

**Fixes:**
- Added inverse relation `User.profile` (`@OneToOne('UserProfile', p => p.user)`, via `import type` to avoid a circular import) and set the inverse callback on `UserProfile.user`.
- Changed `orderBy('u.created_at', …)` → `orderBy('u.createdAt', …)`.

**Verification (live, OPS_ADMIN token, rebuilt instance):**
- `GET /users?page=1&limit=3` → **200**, `meta {page:1, limit:3, total:65}`, no `passwordHash`, includes `profile`.
- pagination (`page=2&limit=5` → 5 rows), `role=OPS_ADMIN` filter (all match), `status=ACTIVE` filter (all match), no-auth → 401.
- Frontend Residents screen renders **20 live users**, 0 console errors.

**Tests:** added `listUsers()` coverage in `users.service.spec.ts` (asserts the `u.profile` join, `u.createdAt` order, pagination math, and role/status filters). `nx test users` → **10/10 pass**. `nx build api` → clean. Frontend contract unchanged (response only gains an optional `profile`; pagination `meta` identical).

## Backend fix — property statistics aggregation (0-vs-55 mismatch, resolved)

**Symptom:** `GET /properties` returned `totalBeds: 0` while `GET /dashboard/occupancy` returned `totalBeds: 55`.

**Root cause:** `pg_properties.total_beds` / `available_beds` are **denormalized counter columns** (default 0) that were **never recalculated** when beds are created/transferred — so they drift to stale `0`. The property list/detail endpoints returned those columns verbatim. The dashboard, in contrast, counts the **`beds` table** live (`COUNT(*) FILTER (WHERE status=…)`), which is the real source of truth.

**Fix (`backend/libs/properties/src/properties.service.ts`):** added `bedStatsMap()` — a single grouped query over `beds` (`WHERE deleted_at IS NULL AND property_id = ANY($1)` GROUP BY property_id) — and `withBedStats()`, wired into `search` (`GET /properties`), `findByOwner` (`/properties/my`), and `findOne` (`/properties/:id`). Each property now returns:
```
stats: { totalBeds, occupiedBeds, reservedBeds, availableBeds, maintenanceBeds, occupancyRate }
```
computed from actual bed records (no hardcoding). The stale `totalBeds`/`availableBeds` columns are also overwritten with the live values for any legacy consumer.

**Relationship verified:** Property → Building → Floor → Room → **Bed**; each `beds` row carries a denormalized `property_id`, so the aggregation counts at the property level directly while remaining consistent with the hierarchy.

**Reconciliation (live, OPS_ADMIN):** sum of per-property `stats` = `{total 55, occupied 1, reserved 48, available 6, maintenance 0}` == `dashboard/occupancy` exactly → `RECONCILES: true`. Portfolio card KPIs now read **Total Beds 55 / Occupancy 2%**, matching the dashboard; inventory bed map reads the same `beds` table.

**Tests:** `properties.service.spec.ts` +3 (live-stats attach, zeroed stats for bed-less property, `search()` multi-property reconciliation + bed-accounting invariant). `nx test properties` → **13/13 pass**; `nx build api` clean.

**Frontend:** `PropertiesService.adapt()` now consumes `stats` (occupied was previously mis-derived as `total − available` → would show 49 instead of 1); `Property` model gained optional `reserved/available/maintenanceBeds` + `occupancyRate`. Frontend build clean, 0 console errors.

## Demo seed data (`backend/scripts/seed.mjs`, `npm run seed`)

Idempotent seed (safe to re-run; uses `ON CONFLICT` / existence guards) that fills the data screens need but the app doesn't create on its own:
- **user_profiles** — 65 (full names, gender, city, occupation, emergency contact) → Residents / Users / CRM now show real names.
- **user_kyc** — 41 with a realistic status spread (APPROVED / SUBMITTED / UNDER_REVIEW / REJECTED) → KYC queue + CRM KYC tab.
- **waitlist_entries** — 8 (room type, gender pref, price, move-in) → Waitlist screen.
- **bed status variety** — converted some RESERVED beds to MAINTENANCE(3)/BLOCKED(2)/VACATING_SOON(4) → Inventory map shows all legends.

**Supporting backend changes (so seeded data surfaces):**
- `listUsers()` now joins `user_profiles` and attaches `kycStatus` (from `user_kyc`) → names + KYC state on `GET /users`.
- `getById()` loads the `profile` relation → CRM shows the resident's name.
- Frontend: `userDisplayName()` helper reads `profile.fullName`; Residents / Users / KYC / CRM use it.

**Verified live (OPS_ADMIN):** Residents (real names), Users & Team (names + roles), KYC queue (13 queued w/ names), Waitlist (8 entries), Inventory (51-bed map, varied statuses), Bookings/Reservations (20 each), Properties/Dashboards (reconciled stats). 0 console errors.

**Remaining endpoint limitations (not seed-related):** `GET /waitlist` and `GET /bookings` return only `tenantId` (no joined tenant name) → those rows show "Guest"/booking number. Enriching needs a tenant-profile join in those services (offer pending).

## Inventory Board rebuild (reference-matched, real data)

Rebuilt `/inventory` to match the "Inventory Board" reference, fully backed by live API data:
- **Header + sub-tabs** (Portfolio / Workspaces / Reports), property dropdown, **Building A/B toggle**, status legend (Occupied/Vacant/Maint./Rsvd.), grid/list affordance.
- **Floor-grouped unit cards** — each room = a unit (room number + room-type label); beds render as A/B/C/D tiles colored by real status (occupied=navy, vacant=outline, reserved=amber+dot, maintenance=red+dot, vacating=accent+dot). Click → status drawer (`PUT /beds/{id}/status`).
- **Right rail** — Occupancy Health (live occupied/total + %), **Revenue Leakage** (Σ vacant-bed `pricePaisa`), **Upcoming Activity** (live bookings → TODAY/TOMORROW/OVERDUE/+Nd tags, tenant name + unit).
- `InventoryService.board()` now returns `{ buildings, rooms }` with `buildingId`/`roomType`/`pricePaisa`; component filters by selected building.

**Supporting backend change:** `GET /bookings` enriched (`booking.service.enrich()`) to attach `tenantName` (user_profiles), `bedLabel`, `roomNumber` via 3 batched lookups — fixes the "Guest" rows across Bookings/Check-In/Check-Out and powers the activity feed.

**Structured seed (`backend/scripts/seed-property.mjs`, `npm run seed:property`):** idempotent creation of **Grand Nest Residences** → Building A & B → Floors 1–4 → ~5 units/floor → A–D beds (78 beds, ~46% occupancy, all statuses) + 8 arrivals (overdue→+7d) for the activity feed.

**Verified live (light + dark):** board renders Grand Nest units with correct bed colors; Occupancy 34% (Building A 13/38), Leakage ₹1,32,503, Activity shows real names (Rahul Pillai · Unit 402-D OVERDUE, Sai Patil · Unit 302-B TODAY…). 0 console errors. Prod build 517 kB / 124 kB.

## Completing incomplete screens + functionality (this pass)

Per the chosen scope (Finance from bookings · CRM sub-tabs · wire create/edit · functional-UI+note for no-API actions):

**Finance — now fully functional from real booking data** (no payments table exists; derived from `rentPaisa` vs `totalPaidPaisa`):
- **Payments** (`/finance/payments`): transaction ledger with resident, unit, due/paid/balance, method, status (PAID/PARTIAL/DUE/OVERDUE); KPIs (Collected/Outstanding/Paid/Overdue); search + status filter. Verified: Outstanding ₹2.19 L, real residents & RAZORPAY method.
- **Collections** (`/finance/collections`): recovery queue (overdue, days overdue, Remind), ageing buckets (0-7/8-30/31-60/60+), KPIs (Outstanding, Overdue accounts, Due-this-week, Recovery rate). `paymentFromBooking()` helper in `bookings.service.ts`.

**Resident CRM sub-tabs — functional:**
- KYC (real user_kyc fields), **Payments** (per-tenant booking dues), **Stay History** (booking timeline), **Documents** (Aadhaar/PAN/selfie URLs from KYC), **Activity** (KYC + booking events). Profile header gained live quick-stats (bookings, total paid, balance, city). Tickets/Comms tabs show a built-and-ready note.

**Create/edit actions wired (real POST):**
- `os-modal` shell added. **Add property** → `POST /properties` (full form; verified — "QA Verify Property" created as DRAFT). **Add to waitlist** → `POST /waitlist` (property/roomType/gender/price/move-in). `createReservation()` helper added.
- No-endpoint actions get **functional UI + clear note** (toast): "Add resident" (OTP onboarding), "New booking" (reserve→convert flow), Collections "Remind" (messaging pending).

**Verified live (OPS_ADMIN, light theme, 0 console errors):** Payments, Collections, CRM Payments/Stay tabs, and the Add-property create flow (DB-confirmed). Prod build 519 kB / 124 kB.

> Still genuinely blocked on backend (no table/endpoint): standalone Tickets board + Communications Hub threads. These remain built UI with explicit "awaiting endpoint" messaging.

## Bug-fix + feature pass (CRM / properties / beds / search / auth)

1. **CRM "no data"** — root cause: the sidebar "Resident CRM" link opens `/residents/crm` with no `?id`. Fixes: CRM now (a) reacts to `?id` query-param changes (`switchMap`) so navigating between residents reloads, and (b) shows a "Select a resident" empty state when no id. Backend: `GET /users` and `GET /users/:id` roles widened to `PG_OWNER`/`PROP_MANAGER` so operators (not just admins) can open residents. *Verified: Vivaan Reddy loads — 2 bookings, ₹24.8K, KYC Approved.*
2. **Created PG not showing** — new properties are `DRAFT`, but `GET /properties` returns ACTIVE only. Added `PropertiesService.portfolio()` = `list()` (active) ⊕ `mine()` (own, all statuses) de-duped; portfolio uses it so a just-created DRAFT appears.
3. **Bed status 400 (Occupied/Reserved/Vacating)** — `UpdateBedStatusDto` only accepts `AVAILABLE/MAINTENANCE/BLOCKED` (Occupied/Reserved/Vacating are system-driven by booking/reservation/notice flows). Inventory drawer now offers only the settable statuses + an explanatory note, and surfaces API errors instead of failing silently.
4. **Global search** (`/search?q=`) — new `SearchService` (residents + properties + bookings) and results screen grouped by type; topbar search + the search box submit on Enter → navigate. *Verified: "rohan" → 2 residents, clickable to CRM.*
5. **Auth guard + returnUrl** — `authGuard` protects the app shell; unauthenticated users → `/auth/login?returnUrl=<path>`. A 401 response interceptor clears the session and redirects on token expiry. Login + OTP-verify honor `returnUrl`. *Verified: `/finance/collections` while logged out → `/auth/login?returnUrl=%2Ffinance%2Fcollections`, then login returns there.*

All verified live (light theme, 0 console errors); prod build 520 kB / 125 kB.

### Still pending (needs new backend) → next
- **Tickets** and **Communications Hub** have no DB table/endpoint. To make them fully functional requires backend scaffolding (a `tickets` table + CRUD, a `messages/threads` table + CRUD) then wiring the screens. Flagged as the next backend task.

## Feature pass 2 (KYC docs/review, detail drawers, create flows, role mgmt)

- **KYC documents** — seed now sets viewable image URLs (`scripts/seed.mjs`); Documents tab shows thumbnails with **Preview (lightbox) + Download**. *Verified: Aadhaar/PAN/Selfie render.*
- **Approve / Reject identity (was "not working")** — root cause: backend only allows review when KYC is `SUBMITTED`/`UNDER_REVIEW` (already-decided → `KYC_NOT_REVIEWABLE`). UI now gates the buttons to reviewable states, surfaces the real error, and the status pill **reactively refreshes** after a decision. *Verified: Aarav Menon SUBMITTED → Approve → Approved.*
- **Payment detail** — clicking a payment row opens a drawer with property/unit/booking + full ledger (rent/advance/deposit/paid/balance/method).
- **Booking & Reservation view** — "View" opens a detail drawer (resident, property, floor/room/bed, dates, rent, paid).
- **Stay history** — backend `enrich()` now adds `propertyName`/`floorNumber`/`roomType`; the tab shows **PG · Floor · Room/Bed · From→To · Rent**.
- **Add reservation** — Reservations → New reservation: property → available-bed picker (from live board) → date → `POST /reservations`. *Verified 201.*
- **Add booking** — Bookings → New booking: pick an ACTIVE reservation + rent → `POST /bookings` (convert). *Verified 201.*
- **Add inventory** — Property Workspace → Add inventory: one modal chains `building → floor → room → N beds` (`InventoryService.quickAddUnit`).
- **Role management** — Roles screen now lists members with an inline role selector → `PUT /users/{id}/role` (SUPER_ADMIN only; surfaces 403 for lesser roles).
- Backend: `getById`/`list` users opened to operators; booking enrich extended; KYC doc-URL seeding.

Prod build clean (522 kB / 125 kB), 0 console errors on verified screens.

### Still needs NEW backend endpoints (next)
- **Add / Invite users** — no admin create-user/invite endpoint (residents self-onboard via phone+OTP). Needs `POST /users/invite`.
- **Property → manager assignment** — `property_manager_assignments` table exists but **no create endpoint**. Needs `POST /properties/:id/managers`.
- **Tickets** + **Communications** — no tables/endpoints.
These four are the remaining work to be "fully functional"; each requires backend scaffolding.

## Property Portfolio screen — full rebuild (AppFolio/Stripe/Linear style)

Rebuilt `/properties` as a business-object workspace per spec, on **live `GET /properties`** (occupancy comes from backend `stats.occupancyRate` — never computed on the frontend):
- **Header** — title/subtitle + Add Property (modal → `POST /properties`), Import (note), Export (real CSV download).
- **Summary strip** — insight chips: Properties · Beds · Occupied · Reserved · Available · Occupancy% · Monthly Revenue · Open Issues · Cities.
- **Filter bar** — search, city, type, status, occupancy band, sort (Revenue / Occupancy / Newest).
- **Property cards** (2-col desktop, 1-col tablet/mobile) — cover image (or deterministic gradient + initial), name, city/type, status pill; **occupancy bar + color-coded Health badge** (Excellent ≥90 / Healthy ≥70 / Attention ≥40 / Critical <40); Occupied/Reserved/Vacant/Revenue; insight row (today's arrivals/departures from live bookings, tickets); manager avatar (Unassigned) + last activity; Workspace button.
- **Quick View drawer** — tabs Overview / Occupancy (bed-status breakdown bars) / Revenue (run-rate + avg/bed) / Operations (arrivals/departures/tickets), with Open-workspace CTA.

`Property` model + adapter gained `status` + `coverImageUrl`. *Verified live: 6 properties incl. DRAFTs (QA Verify, Skyblue), Grand Nest health "Attention · 44%", occupancy breakdown 35/18/13/8. 0 console errors. Prod build 523 kB.* Property Workspace intentionally not rebuilt.

## Create Property Wizard (`/properties/new`)

Guided 6-step onboarding (Stripe/Rippling/Linear style), built as a custom stepper in the Operations OS design language (no `mat-stepper`, to stay on-brand):
- **Steps**: 1 Basics (name, type chips PG/Hostel/Co-Living/Apartment/Villa, gender, description, status, cover URL) · 2 Location (country/state/city/area/pincode/address + lat/lng with **Google Maps embed preview**) · 3 Configuration (buildings/floors/rooms/beds, room-type & amenity chips) · 4 Operations (manager/owner dropdowns from `/users`, contacts, check-in/out, notice, lock-in) · 5 Financials (rent range, deposit, late fee, maintenance/utilities, GST) · 6 Review (per-section summary with Edit jump-links).
- **Sticky progress stepper** with done/active states; **live summary sidebar** (cover, name, status, beds, rent, completion %); **auto-save** to localStorage (restores on return, cleared after create); per-step validation; **Save draft** + **Create property**.
- Maps the rich wizard fields onto `CreatePropertyDto` (gender+type → `propertyType` enum; lat/lng numbers; deposit→`securityDepositPaisa`; notice days; food amenity→`foodIncluded`; amenities→`rules`). The "Add Property" button on the portfolio now routes here.

*Verified live end-to-end: filled Basics→Location→…→Review, clicked Create → "QA Wizard Property" persisted (DRAFT, Bengaluru, Indiranagar, lat/lng saved) → redirected to portfolio (now 7 properties), draft cleared, 0 console errors. Prod build 532 kB.* Property Workspace / inventory management intentionally not built here.

## Add Inventory Workspace (`/properties/:id/inventory/new`)

Three-panel operational builder (Notion/Stripe/AppFolio style) for adding inventory to an existing property:
- **Left — hierarchy tree builder**: Property → Building → Floor → Room → Bed; add/select/delete nodes, collapse/expand, inline rename via the config panel.
- **Center — dynamic config** (switches on selected node): Building (name/code/status/description/images), Floor (name/number/description), Room (number/type/category/rent/deposit/amenity chips/**images**/bed counter), Bed (label/status/rent/deposit).
- **Right — live preview**: summary tiles (Buildings/Floors/Rooms/Beds), Capacity, **Projected revenue**, room cards with status-colored bed dots + legend.
- **Bulk actions**: **Generate Rooms** (numbered range × beds-per-type), **Generate Beds** (by capacity), **Clone Floor**, **Clone Building**, Import CSV (note).
- **Validations**: duplicate building codes, duplicate room numbers per floor, bed-count vs capacity, no-publish-with-zero-rooms.
- **Save Draft** (localStorage per property) + **Publish** → sequential `POST /properties/:id/buildings → /buildings/:id/floors → /floors/:id/rooms → /rooms/:id/beds`.

**Multi-image upload** — new reusable `os-image-upload` (client-side multi-file → data-URL thumbnails + remove); used on **Building & Room** config here and on the **Property wizard** Photos step (first image → cover). Stored locally; flagged "upload endpoint pending".

*Verified live: built Building 1 → Floor 1 → Generate Rooms 101–102 (2 rooms × 2 beds), preview showed 1/1/2/4 + ₹20K/mo with Available bed dots → Publish → DB confirms Building 1 with **2 rooms, 4 beds** → redirected to /inventory, 0 console errors. Prod build 533 kB.* Portfolio & Inventory Dashboard left untouched.

## Known issues / notes
- **Authenticated screens** (residents, users, bookings, dashboards' authed parts) return **401 until logged in**; they degrade to empty states by design. To see live data, log in via `/auth/login` (OTP from the backend dev console).
- `User` entity has **no name field** — lists display phone (expected).
- Bookings carry `tenantId` only (no embedded tenant name) — rows show "Guest" until/if the API enriches.
- Did **not** modify the shared DB or bypass auth (DB write was correctly blocked).
- Public `GET /properties` confirmed working through the dev proxy → real data verified.
