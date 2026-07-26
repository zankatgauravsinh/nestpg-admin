# NestPG PMS — Screen Build Sequence

> The order to build/finish screens so dependencies land first and no screen
> needs the architecture re-worked later. Each wave is independently shippable.
> Status reflects the current `apps/web-admin` (much exists; this sequences the
> remaining hardening + new screens against the documented architecture).

## Guiding principles
1. **Infrastructure before screens** — shared `os-table`/forms/toast/SDK gaps first.
2. **Real-backend screens before mock-backed** — prove the contract, then fill gaps.
3. **Read before write** — list/detail before create/edit/actions per domain.
4. **Each screen:** SDK method → typed DTO → page signals → compose `os-*` → loading/empty/error states → role gating → verify against running API.

---

## Wave 0 — Architecture foundation (prerequisite, mostly exists)
- [exists] App bootstrap (zoneless, router input binding, interceptors), `ApiService`, `TokenStore`, interceptors, `SessionStore`, theme, nav config, AppShell/Sidebar/Topbar.
- [finish] `SessionStore.backendRole()` + `role-map.ts` (11→3 persona) + `APP_INITIALIZER` silent refresh.
- [add] **`ToastService`/`os-toast`**, **`os-confirm`**, `ERROR_COPY` map.
- [add] **`os-table` + `os-pagination` + `os-filter-bar`** (unblocks every list).
- [add] **Form kit** (`os-field/input/select/textarea/toggle/money-input/date-input/stepper`).
- **Exit criteria:** a throwaway list screen renders via `os-table` with server pagination, a form submits with field-error binding, a toast fires.

## Wave 1 — Auth & shell (exists; verify)
1. Login (password + OTP), Register→OTP, Forgot, Reset.
2. `authGuard` returnUrl round-trip; bootstrap refresh on reload.
3. Persona switch reflects in nav + dashboards.
- **Verify:** logged-out deep link → login → returns to destination.

## Wave 2 — Properties & Inventory (core, real backend)
1. **Portfolio hub** `/properties` — `GET /properties` + filters, cards, stats, status pills.
2. **Property detail/workspace** `/properties/workspace?id=` — stats, buildings, **media gallery (os-image-upload)**.
3. **Create-property wizard** `/properties/new` — multi-step form → `POST /properties` → deferred cover/gallery upload → `submit`.
4. **Ops review** — verify/reject actions (gated to OPS_ADMIN/SUPER_ADMIN via `backendRole()`).
5. **Inventory board** `/inventory` — beds/rooms by status (`os-table`/donut), bed status change (AVAILABLE/MAINTENANCE/BLOCKED), transfer.
6. **Add-inventory workspace** `/properties/:id/inventory/new` — building→floor→room→bed tree publish + deferred images.
- **Depends on:** Wave 0 table/forms/upload. **Backend:** 🟢 complete.

## Wave 3 — Residents & KYC (real backend)
1. **Residents command center** `/residents` — `GET /users?role=TENANT` table (kycStatus, avatar).
2. **Resident CRM** `/residents/crm?id=` — reactive param fetch; tabs: Profile, **Stay history** (`GET /bookings?tenantId=`), **Documents** (`GET /kyc/:userId/documents` + `os-private-doc`), Activity.
3. **Avatar upload** (`os-avatar-upload`).
4. **KYC queue** `/operations/kyc` — review (approve/reject) gated to OPS_ADMIN/SA; status-driven action enablement.
- **Backend:** 🟢 complete (KYC private docs via presign-get).

## Wave 4 — Bookings, Reservations, Waitlist (real backend)
1. **Bookings list** `/bookings` (+ check-in/check-out modes) — filters (status/property/tenant/date), enriched columns.
2. **Booking detail drawer** — full info + actions (check-in/out/cancel/notice/no-show) with state-machine-aware enablement (see `workflow-catalog.md`).
3. **Reservations** `/bookings/reservations` — list/create/cancel; TTL countdown.
4. **Create booking** — convert reservation flow (`POST /bookings`).
5. **Waitlist** `/bookings/waitlist` — join/leave/list.
- **Backend:** 🟢 complete. **Note:** disable actions that violate transition guards client-side; backend is the hard stop.

## Wave 5 — Dashboards & Analytics (real aggregates)
1. **Role dashboards** `/dashboard`, `/dashboard/owner`, `/dashboard/manager` — `GET /dashboard/occupancy|bookings|revenue` → metric cards + charts.
2. **Occupancy analytics** `/analytics/occupancy` — donut/bar from dashboard aggregates.
3. **Revenue analytics** `/analytics/revenue` (OWNER/SA) — bar/line from revenue aggregate.
- **Backend:** 🟡 live aggregates exist; **historical trends have no API** → time-series uses mock/`occupancy_snapshots`-shaped mock until a read endpoint lands. Isolate trend data behind `analytics-history.service.ts` (mock).

## Wave 6 — Administration & Operations observability (real backend)
1. **Users admin** `/admin/users` — list, status change, role change (SA), invite (uses register flow).
2. **Roles admin** `/admin/roles` (SA) — display 11 backend roles + persona mapping.
3. **Settings** `/admin/settings`.
4. **Operations center** `/operations` + Ops observability — `GET /admin/ops/*` (jobs, outbox, metrics, audit) for SA/OPS_ADMIN.
- **Backend:** 🟢 (users) / 🟢 (ops observability). **Gap:** manager-assignment CRUD has no API — property-user-management UI is read-only/mock for assignments.

## Wave 7 — Global search (real, composite)
- `/search` — fan-out `search.service.ts` over properties/users/bookings; grouped results, deep links. **Backend:** uses existing list endpoints.

## Wave 8 — Mock-backed features (build last, isolated)
> No backend — build against typed mock SDKs behind the real interface so the
> swap to live endpoints is a one-file change. Clearly badge as "preview data".
1. **Finance** `/finance/payments`, `/finance/collections` — derive from `GET /bookings` amount fields **today**; full ledger when a Payments API exists.
2. **Tickets** `/operations/tickets` — fully mock (`tickets.service.ts`).
3. **Communication hub** `/communication` — fully mock (`communications.service.ts`).
4. **Analytics history** — mock time-series (see Wave 5).
- **Exit:** each mock service has a `// MOCK: no backend` banner and matches the shape a future endpoint would return.

---

## Per-screen Definition of Done
- [ ] SDK method exists, typed DTO mirrors backend (paise/enums/nullable).
- [ ] Page state in signals; reads via `toSignal`, writes via subscribe+reload.
- [ ] Loading / empty / error states (no blank screens, no raw errors).
- [ ] Role gating: nav (persona) + action gating (`backendRole()`).
- [ ] Money via `InrPipe`/`os-money-input`; dates `YYYY-MM-DD`.
- [ ] Pagination server-side; sort flagged client-only where backend lacks it.
- [ ] Verified against the running API (`:3000`) with a real login.
- [ ] Mock-backed screens badged and isolated behind the SDK interface.

## Dependency graph (build-order summary)
```
Wave 0 (table/forms/toast/SDK/persona)
  └─▶ Wave 1 Auth ─▶ Wave 2 Properties/Inventory
                       ├─▶ Wave 3 Residents/KYC
                       ├─▶ Wave 4 Bookings/Reservations/Waitlist
                       └─▶ Wave 5 Dashboards/Analytics
                              └─▶ Wave 6 Admin/Ops ─▶ Wave 7 Search
                                                         └─▶ Wave 8 Mock features
```
Build Wave 0 fully before screens; thereafter Waves 2–5 can parallelize across people since each owns its feature folder + SDK service and shares only `core`/`shared`.
