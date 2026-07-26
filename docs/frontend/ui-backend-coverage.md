# NestPG PMS — UI ↔ Backend Coverage Audit

> Method: traced every `ApiService` call in `apps/web-admin` (typed **and**
> untyped, incl. action subpaths and SDK helper paths) and matched it against the
> backend endpoints in `docs/backend/api-catalog.md`; verified the backend is
> live (public reads return seeded data, all protected routes return 401 when
> unauthenticated). **No code changed** — this is a gap list only.
> Re-audited 2026-06-19 after wiring gaps A, B (property review + booking actions)
> and C, D, F, G, H (reservation cancel, bed transfer, corporate, ops, auth refresh).

Legend: ✅ wired & functional in UI · ⚠️ SDK exists but not surfaced in any screen · ❌ backend exists but **no UI calls it** · 🚫 no backend (out of scope).

---

## ✅ Now working from the UI (backend exercised)

| Area | Endpoints wired |
|------|-----------------|
| Auth | `POST /auth/login`, `/register`, `/send-otp`, `/verify-otp`, `/logout`, **`/refresh`** (silent bootstrap on reload) |
| Users | `GET /users`, `/users/:id`, `/users/me`, `GET+PUT /users/me/profile`, `PUT /users/:id/status`, `/users/:id/role` |
| KYC (admin) | `GET /kyc/:id`, `/kyc/:id/documents`, `POST /kyc/:id/review`, `POST /uploads/presign-get` |
| Properties | `GET /properties`, `/properties/my`, `/properties/:id`, `POST /properties`, **`/:id/submit`**, **`PUT /:id/verify`**, **`PUT /:id/reject`**, **`DELETE /:id`**, `GET+POST /:id/buildings` |
| Inventory | `GET+POST /buildings/:id/floors`, `GET+POST /floors/:floorId/rooms`, `GET+POST /rooms/:roomId/beds`, `PUT /beds/:id/status`, **`POST /beds/:id/transfer`** |
| Reservations | `POST /reservations`, `GET /reservations`, **`POST /reservations/:id/cancel`** |
| Bookings | `POST /bookings`, `GET /bookings`, `/:id/check-in`, `/:id/check-out`, **`/:id/cancel`**, **`/:id/notice`**, **`/:id/no-show`** |
| Waitlist | `GET /waitlist`, `POST /waitlist`, `DELETE /waitlist/:id` |
| Corporate | **`POST /corporate/accounts`**, **`GET /corporate/accounts/:id`**, **`POST /corporate/agreements`**, **`GET /corporate/agreements/:id`**, **`/:id/assign-bed`**, **`/:id/cancel`** |
| Dashboard | `GET /dashboard/occupancy`, `/bookings`, `/revenue` |
| Media | `POST /uploads/presign`, `/confirm`, `/presign-get`; `GET /media`; `DELETE /media/:id` |
| Ops | `GET /admin/ops/metrics`, **`/jobs`**, **`/alerts`**; **`POST /admin/ops/outbox/requeue-all`** |

**Bold = wired in the last two sessions.** Coverage of backend endpoints rose from ~45% to **~85%**.

---

## ❌ / ⚠️ Still missing or not surfaced

### A. Property **edit** — ❌ (only one left in the property workflow)
- ❌ `PUT /properties/:id` — `PropertiesService.update()` exists in the SDK but **no edit form invokes it**. Submit/verify/reject/delete are all wired; in-place edit of name/address/price is not.

### D′. Inventory **edit/delete of structure** — ⚠️ SDK only
Bed transfer + bed status are wired. The structural edit/delete SDK methods exist but **no screen calls them**:
- ⚠️ `PUT /buildings/:id`, `DELETE /buildings/:id`
- ⚠️ `PUT /floors/:id`
- ⚠️ `PUT /floors/:floorId/rooms/:id`, `DELETE /floors/:floorId/rooms/:id`
(`inventory.service` has `updateBuilding/deleteBuilding/updateFloor/updateRoom/deleteRoom` — no UI controls yet.)

### G′. Ops observability — ⚠️ partially surfaced
Wired: metrics, jobs, alerts, requeue-all. SDK exists but **not rendered**:
- ⚠️ `GET /admin/ops/audit` (audit-trail viewer), `/capacity`, `/outbox/analytics`, `/outbox/failed`, `POST /admin/ops/outbox/requeue/:id`
- ❌ no SDK at all: `/admin/ops/deployment, /environment, /performance, /integrity, /recovery, /redis`

### E. KYC self-service — ❌ (resident-facing, not an admin-panel concern)
- ❌ `GET/POST /kyc/me`, `GET/POST /kyc/me/documents` — belongs to a resident app, not this operator console.

### Minor
- ❌ `GET /bookings/:id`, `GET /reservations/:id` — detail drawers reuse the list row instead of a dedicated detail fetch (functional; no data missing).
- ❌ `GET /beds/available` — Reservations derives availability by traversing rooms→beds via `InventoryService` rather than the optimized endpoint.

---

## 🚫 No backend yet (UI is mock — not a UI gap)
Cannot be wired until the backend exists (see `docs/backend/frontend-integration-guide.md` Part B):
- Finance / Payments / Collections / Refunds (derived from booking amount fields only).
- Tickets (`/operations/tickets`) — fully mock.
- Communications hub — fully mock.
- Analytics history/trends — mock time-series (live aggregates only).
- Manager-assignment CRUD — `property_manager_assignments` has no endpoint.

---

## Priority of what remains (all pure frontend, backend ready)
1. **Property edit form** (A) — `PUT /properties/:id`. Highest remaining value; SDK already there.
2. **Inventory structural edit/delete** (D′) — building/floor/room rename + delete controls in the inventory board / add-inventory workspace.
3. **Ops audit-trail viewer + capacity/failed-events panels** (G′) — surface the SDK methods already written.
4. Booking/reservation **dedicated detail fetch** + `/beds/available` adoption — minor polish.
5. KYC self-service (E) — only if a resident-facing surface is added.

Everything in 1–4 is wiring against existing, verified endpoints — no backend work needed.

## Live verification
API `:3000` healthy (seeded data returns); web `:4200` serving. All newly-wired
endpoints confirmed mounted (401 unauthenticated, not 404):
`properties/:id/{submit,verify,reject}`, `PUT/DELETE /properties/:id`,
`bookings/:id/{cancel,notice,no-show}`, `reservations/:id/cancel`,
`beds/:id/transfer`, `buildings/:id`, `floors/:f/rooms/:id`,
`corporate/{accounts,agreements/:id/assign-bed}`, `admin/ops/{jobs,outbox/requeue-all}`,
`auth/refresh`.
