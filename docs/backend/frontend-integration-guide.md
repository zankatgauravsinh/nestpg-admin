# NestPG PMS — Frontend Integration Guide, API Quality Audit & Readiness Report

> How to build each screen against the real backend, what's missing, and an honest
> readiness scorecard. Cross-reference: `api-catalog.md`, `entity-catalog.md`,
> `workflow-catalog.md`, `permissions-matrix.md`.

## Part A — Screen → API mapping

Base `/api/v1`. Envelope is `{success,data,meta,errors}` — `ApiService.unwrap` returns `data`.

### Auth (Login / Register / OTP / Forgot)
- `POST /auth/register` → `POST /auth/verify-otp` (purpose REGISTRATION).
- `POST /auth/login` (with password) **or** `POST /auth/send-otp` + `POST /auth/verify-otp` (LOGIN).
- `POST /auth/refresh` (cookie) bootstraps the session on reload. Forgot = send-otp/verify-otp purpose PASSWORD_RESET.
- Store `accessToken` (memory/localStorage); the refresh token is an httpOnly cookie — never read it in JS.

### Super-Admin / Owner / Manager Dashboard
- `GET /dashboard/occupancy`, `/dashboard/bookings`, `/dashboard/revenue` (`?propertyId=` optional).
- Roles: SA/OA/FA/OWN/MGR. Money fields are paise → divide by 100 / use `InrPipe`.

### Properties (Portfolio + Workspace + Wizard)
- List: `GET /properties` (public search, filters) or `GET /properties/my` (own incl. DRAFT).
- Detail: `GET /properties/:id` → includes `stats{...}` + `media{coverImageUrl,gallery[]}`.
- Create wizard: `POST /properties` (DRAFT) → upload cover/gallery via media pipeline → `POST /properties/:id/submit`.
- Ops review: `PUT /properties/:id/verify` | `/reject {reason}`.
- Buildings/structure: `GET /properties/:id/buildings` (+ images), `POST /properties/:id/buildings`.
- Required perms: create OWN/SA/OA; verify SA/OA.

### Inventory (Add-Inventory workspace + Board)
- Build tree: `POST /properties/:id/buildings` → `POST /buildings/:id/floors` → `POST /floors/:floorId/rooms` → `POST /rooms/:roomId/beds`.
- Read: `GET /buildings/:id/floors`, `GET /floors/:floorId/rooms` (+images), `GET /rooms/:roomId/beds`.
- Bed ops: `PUT /beds/:id/status` (AVAILABLE/MAINTENANCE/BLOCKED only), `POST /beds/:id/transfer`.
- Availability search: `GET /beds/available?propertyId=&gender=&maxPricePaisa=&checkIn=`.

### Residents list / Resident CRM
- Roster: `GET /users?role=TENANT&page=&limit=` (each item carries `kycStatus`, `avatarUrl`).
- Profile: `GET /users/:id` (+ profile, avatar), `GET /users/:id` KYC via `GET /kyc/:userId`.
- Stay history: `GET /bookings?tenantId=` (enriched with property/room/bed/dates).
- KYC docs (CRM Documents tab): `GET /kyc/:userId/documents` → for each key `POST /uploads/presign-get` to view.
- Avatar upload: media pipeline scope `resident-avatar`, entityType `resident`.

### Bookings / Reservations / Check-In / Check-Out
- Reservations: `GET/POST /reservations`, `POST /reservations/:id/cancel`.
- Bookings: `GET /bookings` (filters `status,propertyId,tenantId,fromDate,toDate`), `GET /bookings/:id`.
- Create booking: `POST /bookings {reservationId,rentPaisa,...}` (convert-only).
- Actions: `POST /bookings/:id/check-in | check-out | cancel | notice | no-show`.

### Payments / Collections / Finance  ⚠️
- **No payment/invoice API.** Build these screens from booking amount fields (`rentPaisa`, `securityDepositPaisa`, `advancePaisa`, `totalPaidPaisa`, `paymentMode`) returned by `GET /bookings`. Treat as informational until a Payments module exists.

### KYC Queue (Ops)
- Queue: `GET /users?status=&role=` + `kycStatus`, or per-user `GET /kyc/:userId`.
- Review: `POST /kyc/:userId/review {decision, reason?}`. Docs: `GET /kyc/:userId/documents` + presign-get.

### Operations / Admin Ops
- `GET /admin/ops/{deployment,environment,performance,capacity,jobs,integrity,recovery,redis,metrics,alerts}`, `/admin/ops/outbox*`, `/admin/ops/audit`. SA/OA only.

### Waitlist
- `GET /waitlist?status=`, `POST /waitlist`, `DELETE /waitlist/:id`.

### Corporate
- Accounts/agreements per `corporate.controller` (HR/OWN/SA/OA). Assign/cancel beds.

### Media (everywhere)
- `POST /uploads/presign` → PUT to `uploadUrl` → `POST /uploads/confirm`. `GET /media?entityType=&entityId=`, `DELETE /media/:id`. Private reads via `POST /uploads/presign-get`.

### Communications / Notifications  ⚠️
- **No backend.** `NotificationService` is in-memory only; no controller/table. Comms screens have no real API.

### Analytics (Revenue / Occupancy)
- Revenue/occupancy: `GET /dashboard/revenue|occupancy`. Historical occupancy lives in `occupancy_snapshots` but has **no read endpoint** — not currently queryable from the API.

---

## Part B — API Quality Audit

### Missing APIs (blocking real product features)
1. **Payments / Invoices / Collections / Refunds** — no controller, service, or table. `PayGateway` + `webhook_events` are scaffolding only. **Blocker** for Finance.
2. **Communications / Notifications** — in-memory `NotificationService`, no persistence or HTTP surface. **Blocker** for Comms.
3. **Tickets / Operations work items** — no entity/controller (the "operations/tickets" screens have no backend).
4. **Agreements (standalone)** — only corporate agreements exist; no general agreement entity/PDF.
5. **Analytics history read** — `occupancy_snapshots` written nightly but never exposed.
6. **Owner/Manager assignment management** — `property_manager_assignments` is read by guards but has **no CRUD endpoint** to create/list assignments (managers can't be assigned via API).
7. **Resident avatar / owner avatar** scopes exist in storage but no convenience endpoint beyond the generic media pipeline (acceptable).

### Inconsistent / partial
- **Pagination/sorting:** list endpoints accept `page,limit` but **no `sort`/`order` param anywhere** — ordering is fixed server-side. Frontend cannot request sort order.
- **Filtering depth:** `GET /bookings` filters by status/tenant/property/date, but `GET /users` only by role/status (no name/phone search); `GET /properties` search is rich, `/properties/my` is not filterable.
- **DTO shape drift:** `PgProperty`/`Room` still expose legacy `cover_image_url`/`media_urls` columns alongside the new `media`/`images` arrays — two sources of truth in the entity (the legacy ones are not written, but a naive client could read them).
- **`UpdatePropertyDto extends CreatePropertyDto`** — all fields required on PUT (no true partial update for properties).
- **Reject endpoint body** `{reason}` is an inline object, not a validated DTO (loose contract).

### Security observations
- ✅ JWT + role guards + ownership re-checks; presigned URLs short-lived; KYC private + deny-by-default reads; passwordHash `select:false`; token revocation on role/status change; Redis-throttled auth.
- ⚠️ `GET /bookings` & `GET /reservations` are **role-open**; tenant scoping is in the service query — verify it actually restricts a TENANT to their own rows before exposing tenant UIs.
- ⚠️ `presign-get` allows FINANCE_ADMIN to read **any** private object (agreement/invoice/ticket) — fine today (no such objects), revisit when those features land.
- ⚠️ Public `GET /beds/available` / `GET /rooms/:roomId/beds` expose inventory unauthenticated (intended, but note for data-exposure review).

### N+1 / performance
- Read enrichment is generally **batched** (booking `enrich()`, `MediaService.mapByEntities`, `attachKycStatus/attachAvatar` use `ANY($1)` / `IN`), so list endpoints avoid N+1. ✅
- Property stats use a single aggregate query per page. ✅
- Watch: per-user KYC document viewing requires one `presign-get` round-trip per document (expected for signed URLs).

### Unused / scaffolding
- `webhook_events` table + `V3_019` migration: no consumer. `bed_pricing_rules`: entity exists, **no controller** (pricing rules can't be managed via API). `corporate` flows present but no frontend.

---

## Part C — Readiness Report

### Backend readiness by module
| Module | Score | Notes |
|--------|-------|-------|
| Auth | 🟢 95% | Complete (OTP+password, refresh cookie, throttle, revocation). |
| Users/Profile | 🟢 90% | Solid; lacks name/phone search + sorting. |
| KYC | 🟢 90% | Full lifecycle + private docs + audit. |
| Properties | 🟢 90% | Full CRUD + review workflow + live stats + media. |
| Inventory (rooms/beds) | 🟢 85% | CRUD + transfer + availability; bed-status API intentionally restricted; pricing rules unexposed. |
| Reservations | 🟢 85% | TTL holds, locks, expiry cron. |
| Bookings | 🟢 88% | Full state machine + history + events; convert-only create. |
| Corporate | 🟡 70% | Backend present, no frontend, lighter validation. |
| Dashboard | 🟡 75% | Aggregates exist; no historical analytics read. |
| Media/Storage | 🟢 90% | Presigned pipeline, public/private, key-only. |
| Waitlist | 🟢 85% | Join/leave/notify cron. |
| **Payments/Finance** | 🔴 5% | Not implemented (only booking amount fields). |
| **Communications** | 🔴 10% | In-memory only, no API. |
| **Tickets/Operations work** | 🔴 0% | No backend (ops endpoints are observability, not tickets). |
| Admin Ops/Observability | 🟢 90% | Rich operational endpoints. |

### Aggregate scores
- **Backend readiness: ~72%** — core PMS (identity, property, inventory, reservation, booking, KYC, media) is production-shaped; finance/comms/tickets are absent.
- **Frontend readiness (buildable against real APIs): ~70%** — every "core" screen has real endpoints; Finance, Communications, Tickets, and historical Analytics screens must run on mock/derived data until their backends exist.
- **API contract completeness for FE without reading code: ~90%** — these five docs cover routes, DTOs, enums, permissions, workflows, and state machines.

### Blockers (must build backend before these screens are "real")
1. Payments / Invoices / Collections / Refunds module + gateway webhooks.
2. Communications / Notifications persistence + API.
3. Tickets / maintenance work-order module.
4. Manager-assignment CRUD (`property_manager_assignments`) — managers currently can't be assigned via API.
5. Analytics history read endpoints over `occupancy_snapshots`.

### Recommended improvements (non-blocking)
1. Add `sort`/`order` query params to all list endpoints.
2. Add user search (name/phone) to `GET /users`.
3. Make `UpdatePropertyDto` a true partial; validate the reject `{reason}` body with a DTO.
4. Drop legacy `cover_image_url`/`media_urls` columns once no reader references them.
5. Expose `bed_pricing_rules` management + `occupancy_snapshots` read.
6. Confirm/lock down tenant row-scoping on `GET /bookings` & `/reservations`.
7. Add OpenAPI/Swagger export as a machine-readable companion to this catalog (decorators already present).

---

*Generated by static analysis of controllers, DTOs, entities, services, guards, consumers, and jobs. No code was modified.*
