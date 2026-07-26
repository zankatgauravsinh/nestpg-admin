# NestPG PMS — API Catalog

> **Source of truth:** traced directly from controllers/DTOs/services in `backend/libs/*`.
> Documentation only — no behavior was changed. Last audited against the codebase at
> commit on branch `develope` (media stack present).

## Conventions

- **Base URL:** `http://<host>:3000` → all routes are prefixed **`/api/v1`** (global prefix `api` + URI version `1`).
- **Auth:** Bearer JWT in `Authorization: Bearer <accessToken>` unless marked `@Public`.
  The refresh token is an **httpOnly cookie** (`refreshToken`), not a body field.
- **Response envelope** (every endpoint): 
  ```jsonc
  { "success": true,  "data": <T>,   "meta": <PaginationMeta|null>, "errors": [] }
  { "success": false, "data": null,  "meta": null, "errors": [ { "code": "STRING", "message": "...", "field": "optional" } ] }
  ```
- **PaginationMeta:** `{ page, limit, total, totalPages }` (present on list endpoints that paginate).
- **Money:** all amounts are integer **paise** (₹1 = 100 paise). Field suffix `*Paisa`.
- **Dates:** request date fields are `YYYY-MM-DD` strings; timestamps in responses are ISO-8601.
- **IDs:** UUID v4. Path params validated by `ParseUUIDPipe` (malformed id → `400`).
- **Standard errors:** `401` (no/invalid token), `403` (role/ownership), `404` (not found),
  `400` (validation/business rule), `409` (conflict/state), `422` (unsupported media type),
  `413` (payload too large), `429` (throttled).

Roles enum: `SUPER_ADMIN, OPS_ADMIN, FINANCE_ADMIN, PG_OWNER, PROP_MANAGER, CARETAKER, HOUSEKEEPING, SECURITY, CORP_HR, TENANT, GUEST`.

---

## 1. Auth — `/api/v1/auth` (`auth.controller.ts`)

All public except logout. Sensitive routes use `SecurityThrottlerGuard` (Redis-backed rate limit).

### POST /auth/register  — Public
Register by phone (password optional → OTP-only account).
- Body `RegisterDto`: `{ phone: /^[6-9]\d{9}$/, email?: string, password?: string(8–72) }`
- Response: registration result (user bootstrap). Follow with `verify-otp` (purpose `REGISTRATION`).
- Errors: `409` phone exists, `400` validation.

### POST /auth/send-otp — Public · throttled
- Body `SendOtpDto`: `{ phone, purpose: 'REGISTRATION'|'LOGIN'|'PASSWORD_RESET'|'KYC' }`
- Response: `{ message: 'OTP sent' }`.

### POST /auth/verify-otp — Public · throttled · 200
- Body `VerifyOtpDto`: `{ phone, otp: /^\d{6}$/, purpose }`
- Sets `refreshToken` cookie. Response: `{ accessToken, user }`.

### POST /auth/login — Public · throttled · 200
- Body `LoginDto`: `{ phone, password? }` (omit password → OTP login path).
- Sets `refreshToken` cookie. Response: `{ accessToken, user }`.

### POST /auth/refresh — Public · throttled · 200
- Reads `refreshToken` cookie (no body). Rotates cookie. Response: `{ accessToken }`.

### POST /auth/logout — JWT · 200
- Revokes session. Response: `{ message: 'Logged out' }`.

**`user` object** returned on login/verify: id, phone, role, status (+ profile basics). The `accessToken` is a JWT whose payload is `{ sub, phone, role, iat, exp }`.

---

## 2. Users — `/api/v1/users` (`users.controller.ts`)
Controller-level `@UseGuards(JwtAuthGuard, RolesGuard)` — all routes require auth.

| Method | Path | Roles | Body / Query | Response |
|--------|------|-------|--------------|----------|
| GET | `/users/me` | any authed | — | current `User` (+ kycStatus, avatarUrl/avatarKey) |
| GET | `/users/me/profile` | any authed | — | `UserProfile` or null |
| PUT | `/users/me/profile` | any authed | `UpdateProfileDto` | updated `UserProfile` |
| GET | `/users` | SUPER_ADMIN, OPS_ADMIN, PG_OWNER, PROP_MANAGER | `page,limit,role?,status?` | `User[]` + `meta`; each has `kycStatus`, `avatarUrl/Key` |
| GET | `/users/:id` | SUPER_ADMIN, OPS_ADMIN, PG_OWNER, PROP_MANAGER | — | `User` (+ profile, avatar) |
| PUT | `/users/:id/status` | SUPER_ADMIN, OPS_ADMIN | `UpdateStatusDto {status}` | 200; revokes target's tokens |
| PUT | `/users/:id/role` | SUPER_ADMIN | `UpdateRoleDto {role}` | 200; revokes target's tokens |

**UpdateProfileDto:** `fullName?, dateOfBirth?(ISO date), gender?(MALE|FEMALE|OTHER|PREFER_NOT_SAY), addressLine1?, city?, state?, pincode?(6 digit), occupation?, emergencyContactName?, emergencyContactPhone?`.
**UpdateStatusDto.status:** `PENDING|ACTIVE|SUSPENDED|DELETED`. **UpdateRoleDto.role:** any `UserRole`.

Side effects: status/role change writes a Redis revocation key → all of the target user's active access tokens are immediately invalidated.

---

## 3. KYC — `/api/v1/kyc` (`kyc.controller.ts`)

| Method | Path | Roles | Body | Notes |
|--------|------|-------|------|-------|
| GET | `/kyc/me` | any authed | — | own `UserKyc` record |
| POST | `/kyc/me` | any authed | — | idempotent bootstrap → `NOT_STARTED` (201) |
| GET | `/kyc/me/documents` | any authed | — | own `KycDocument[]` (keys only) |
| POST | `/kyc/me/documents` | any authed | `ConfirmKycDocDto {docType, key}` | verifies `kyc/{me}/` prefix + object exists; → `SUBMITTED` (201) |
| GET | `/kyc/:userId/documents` | OPS_ADMIN, SUPER_ADMIN | — | reviewer document list |
| GET | `/kyc/:userId` | OPS_ADMIN, SUPER_ADMIN | — | reviewer KYC record |
| POST | `/kyc/:userId/review` | OPS_ADMIN, SUPER_ADMIN | `ReviewKycDto {decision:'APPROVED'\|'REJECTED', reason?}` | 200; review only allowed from `SUBMITTED`/`UNDER_REVIEW` else `KYC_NOT_REVIEWABLE` |

KYC files are **private**; read them via `POST /uploads/presign-get` (60s). Reject requires non-empty `reason` (`REJECTION_REASON_REQUIRED`). Each decision writes an immutable `kyc_reviews` audit row + emits `kyc.approved`/`kyc.rejected`.

---

## 4. Properties — `/api/v1/properties` + `/buildings` + `/floors` (`properties.controller.ts`)

### Properties
| Method | Path | Auth/Roles | Body/Query | Response |
|--------|------|-----------|------------|----------|
| GET | `/properties` | Public | `SearchPropertyDto` | `PropertyWithStats[]` + meta |
| GET | `/properties/my` | JWT | `page,limit` | own properties (incl. DRAFT) + meta |
| GET | `/properties/:id` | Public | — | `PropertyWithStats` |
| POST | `/properties` | PG_OWNER, SUPER_ADMIN, OPS_ADMIN | `CreatePropertyDto` | created property (status `DRAFT`, ownerId = caller) |
| PUT | `/properties/:id` | PG_OWNER, PROP_MANAGER, SUPER_ADMIN, OPS_ADMIN | `UpdatePropertyDto` | updated |
| POST | `/properties/:id/submit` | PG_OWNER | — | `DRAFT → PENDING_REVIEW` (200) |
| PUT | `/properties/:id/verify` | OPS_ADMIN, SUPER_ADMIN | — | `PENDING_REVIEW → ACTIVE` (200) |
| PUT | `/properties/:id/reject` | OPS_ADMIN, SUPER_ADMIN | `{reason}` | `→ REJECTED` (200) |
| DELETE | `/properties/:id` | PG_OWNER, SUPER_ADMIN | — | soft delete |
| GET | `/properties/:id/buildings` | JWT | — | `Building[]` (+ `images[]`) |
| POST | `/properties/:id/buildings` | PG_OWNER, PROP_MANAGER, SUPER_ADMIN, OPS_ADMIN | `CreateBuildingDto` | created Building |

**SearchPropertyDto (query):** `city?, propertyType?(enum), minPricePaisa?, maxPricePaisa?, lat?, lng?, radiusKm?(1–50), page?, limit?(1–100)`. Geo search active when `lat`+`lng` present.
**CreatePropertyDto:** `name(≤200), description?, propertyType(MALE_ONLY|FEMALE_ONLY|COLIVING|FAMILY|CORPORATE), addressLine1(≤255), addressLine2?, areaLocality(≤150), city, state, pincode(6), latitude?(-90..90), longitude?(-180..180), securityDepositPaisa?, noticePeriodDays?, foodIncluded?, foodDescription?, rules?: string[]`. `UpdatePropertyDto` = same shape.
**PropertyWithStats** response adds: `stats { totalBeds, occupiedBeds, reservedBeds, availableBeds, maintenanceBeds, occupancyRate }` (live from `beds`) and `media { coverImageUrl, coverImageKey, gallery[] }`.

### Buildings — `/api/v1/buildings` (JWT+Roles)
| PUT `/buildings/:id` | PG_OWNER, PROP_MANAGER, SUPER_ADMIN, OPS_ADMIN | `CreateBuildingDto` |
| DELETE `/buildings/:id` | PG_OWNER, SUPER_ADMIN |
| GET `/buildings/:id/floors` | any authed | → `Floor[]` |
| POST `/buildings/:id/floors` | PG_OWNER, PROP_MANAGER, SUPER_ADMIN, OPS_ADMIN | `CreateFloorDto` |

**CreateBuildingDto:** `name(≤100), description?, sortOrder?`. **CreateFloorDto:** `floorNumber(0–99), label?(≤50)`.

### Floors — `/api/v1/floors` (JWT+Roles)
| PUT `/floors/:id` | PG_OWNER, PROP_MANAGER, SUPER_ADMIN, OPS_ADMIN | `Partial<CreateFloorDto>` |

---

## 5. Inventory — Rooms / Beds / Waitlist

### Rooms — `/api/v1/floors/:floorId/rooms` (`rooms.controller.ts`, JWT+Roles)
| Method | Path | Roles | Body |
|--------|------|-------|------|
| POST | `/floors/:floorId/rooms` | PG_OWNER, PROP_MANAGER, SUPER_ADMIN, OPS_ADMIN | `CreateRoomDto` |
| GET | `/floors/:floorId/rooms` | PG_OWNER, PROP_MANAGER, SUPER_ADMIN, OPS_ADMIN (+ broader read set) | — → `Room[]` (+ `images[]`) |
| PUT | `/floors/:floorId/rooms/:id` | PG_OWNER, PROP_MANAGER, SUPER_ADMIN, OPS_ADMIN | `Partial<CreateRoomDto>` |
| DELETE | `/floors/:floorId/rooms/:id` | PG_OWNER, SUPER_ADMIN | — (blocked if occupants) |

**CreateRoomDto:** `roomNumber(≤20), roomType(SINGLE|DOUBLE|TRIPLE|QUAD|DORMITORY|STUDIO), furnishing(FULLY_FURNISHED|SEMI_FURNISHED|UNFURNISHED), attachedBathroom?, acAvailable?, balcony?, areaSqft?, description?`. Capacity derives from roomType (SINGLE 1 … DORMITORY 6).

### Beds — `/api/v1/rooms/:roomId/beds` and `/api/v1/beds` (`beds.controller.ts`)
| Method | Path | Auth/Roles | Body/Query |
|--------|------|-----------|------------|
| POST | `/rooms/:roomId/beds` | JWT+Roles: PG_OWNER, PROP_MANAGER, SUPER_ADMIN, OPS_ADMIN | `CreateBedDto` |
| GET | `/rooms/:roomId/beds` | Public | — → `Bed[]` |
| GET | `/beds/available` | Public | `propertyId(req), gender?, maxPricePaisa?, checkIn?` |
| PUT | `/beds/:id/status` | JWT+Roles (4 mgmt roles) | `UpdateBedStatusDto` |
| POST | `/beds/:id/transfer` | JWT+Roles (4 mgmt roles) | `TransferBedDto {targetBedId}` (200) |

**CreateBedDto:** `bedNumber(≤20), label?, pricePaisa(≥1), genderAllocation?(MALE|FEMALE|ANY), isPremium?, notes?`.
**UpdateBedStatusDto:** `status ∈ {AVAILABLE, MAINTENANCE, BLOCKED}` (note: cannot directly set OCCUPIED/RESERVED/VACATING_SOON — those are driven by booking/reservation flows), `reason?`, `blockedUntil?`. Blocking an `OCCUPIED` bed is rejected.

### Waitlist — `/api/v1/waitlist` (`waitlist.controller.ts`, JWT)
| GET `/waitlist` | JWT | `QueryWaitlistDto {status?, page?, limit?}` → entries + meta |
| POST `/waitlist` | JWT | `JoinWaitlistDto` (201) |
| DELETE `/waitlist/:id` | JWT | leave (200) |

**JoinWaitlistDto:** `propertyId(uuid), roomType?, genderPreference?, maxPricePaisa?, preferredMoveIn?(YYYY-MM-DD)`. **Waitlist status:** `WAITING|NOTIFIED|CONVERTED|EXPIRED|CANCELLED`.

---

## 6. Reservations — `/api/v1/reservations` (`reservation.controller.ts`, JWT)

| Method | Path | Body/Query | Notes |
|--------|------|-----------|-------|
| POST | `/reservations` | `CreateReservationDto {bedId, reservedFrom(YYYY-MM-DD)}` | 201; holds a bed (AVAILABLE→RESERVED) |
| GET | `/reservations` | `QueryReservationDto {tenantId?, bedId?, status?, page?, limit?}` | list + meta |
| GET | `/reservations/:id` | — | one |
| POST | `/reservations/:id/cancel` | — | 200; releases bed |

**TTL:** reservations expire after `BED_RESERVATION_TTL_HOURS` (default **2h**). A Redis lock (30s) prevents double-holding a bed. Status: `ACTIVE|CONVERTED|EXPIRED|CANCELLED`. A cron expires stale holds every 5 min.

---

## 7. Bookings — `/api/v1/bookings` (`booking.controller.ts`)

| Method | Path | Auth/Guard | Body | Effect |
|--------|------|-----------|------|--------|
| POST | `/bookings` | JWT (+ ownership of reservation) | `CreateBookingDto {reservationId, rentPaisa, securityDepositPaisa?, advancePaisa?, paymentMode?}` | **Convert-only:** ACTIVE reservation → `CONFIRMED` booking (201) |
| GET | `/bookings` | JWT | `QueryBookingDto {tenantId?, propertyId?, status?, fromDate?, toDate?, page?, limit?}` | list + meta (enriched: tenantName, bedLabel, roomNumber, propertyName…) |
| GET | `/bookings/:id` | JWT | — | one (enriched) |
| POST | `/bookings/:id/check-in` | JWT + OwnerAccessGuard | — | `CONFIRMED → CHECKED_IN` (200) |
| POST | `/bookings/:id/check-out` | JWT + OwnerAccessGuard | — | `CHECKED_IN → CHECKED_OUT` (200) |
| POST | `/bookings/:id/cancel` | JWT | `CancelBookingDto {reason(≤500)}` | `PENDING\|CONFIRMED → CANCELLED` (200) |
| POST | `/bookings/:id/notice` | JWT | `GiveNoticeDto {expectedMoveOutDate?}` | records notice on CHECKED_IN |
| POST | `/bookings/:id/no-show` | JWT+Roles+OwnerAccessGuard (4 mgmt roles) | `MarkNoShowDto {note?}` | `CONFIRMED → NO_SHOW` (200; only after check-in date passes) |

**PayGateway:** `RAZORPAY|CASHFREE|STRIPE|MANUAL|CASH|BANK_TRANSFER`. Every transition writes a `booking_history` row + emits the matching `booking.*` event. See `workflow-catalog.md` and the state machine in section 6 of that file.

---

## 8. Corporate — `/api/v1/corporate` (`corporate-booking.controller.ts`)

| Method | Path | Roles | Body |
|--------|------|-------|------|
| POST | `/corporate/accounts` | CORP_HR, SUPER_ADMIN, OPS_ADMIN | `CreateCorporateAccountDto` |
| GET | `/corporate/accounts/:id` | JWT | — |
| POST | `/corporate/agreements` | CORP_HR, PG_OWNER, SUPER_ADMIN, OPS_ADMIN | `CreateCorporateAgreementDto` |
| GET | `/corporate/agreements/:id` | JWT | — |
| POST | `/corporate/agreements/:id/assign-bed` | PG_OWNER, PROP_MANAGER, SUPER_ADMIN, OPS_ADMIN | `AssignCorporateBedDto` (200) |
| POST | `/corporate/agreements/:id/cancel` | PG_OWNER, PROP_MANAGER, SUPER_ADMIN, OPS_ADMIN | `CancelBookingDto` (200) |

**CreateCorporateAccountDto:** `companyName(≤200), hrContactUserId(uuid), billingEmail, gstin?, billingAddress?, creditLimitPaisa?`.
**CreateCorporateAgreementDto:** `corporateAccountId, propertyId, hrUserId, totalBedsRequested(≥1), checkInDate(YYYY-MM-DD), checkOutDate?, billingMode?('CORPORATE'|'INDIVIDUAL'), poNumber?`.
**AssignCorporateBedDto:** `employeeTenantId(uuid), bedId(uuid), rentPaisa(≥1), securityDepositPaisa?, advancePaisa?`.

---

## 9. Dashboard — `/api/v1/dashboard` (`dashboard.controller.ts`)
Roles: PG_OWNER, PROP_MANAGER, SUPER_ADMIN, OPS_ADMIN, FINANCE_ADMIN. Query: `DashboardScopeDto {propertyId?}`.

| GET `/dashboard/occupancy` | occupancy aggregate (beds by status, occupancy rate) |
| GET `/dashboard/bookings` | booking counts/funnel |
| GET `/dashboard/revenue` | revenue aggregate (paise) |

These return aggregate objects scoped to a property (or all properties the caller can see).

---

## 10. Media / Uploads — `/api/v1/uploads` + `/media` (`uploads.controller.ts`, JWT)

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/uploads/presign` (200) | `PresignDto {scope, entityId, contentType, sizeBytes}` | `{key, uploadUrl, expiresIn, scope}` |
| POST | `/uploads/confirm` (201) | `ConfirmUploadDto {entityType, entityId, key, role?, sortOrder?}` | `MediaView` |
| POST | `/uploads/presign-get` (200) | `PresignGetDto {key}` | `{url, expiresIn:60}` (deny-by-default; KYC self/admin) |
| GET | `/media?entityType=&entityId=` | — | `MediaView[]` |
| DELETE | `/media/:id` (200) | — | `{deleted:true}` (soft delete + object remove) |

**Scopes:** `property-cover, property-gallery, building, room, resident-avatar, owner-avatar, ticket, agreement, invoice, kyc`.
**MediaView:** `{id, entityType, entityId, role, key, url, mimeType, fileSize, sortOrder, createdAt}` (`url` null for private). Full upload pipeline + rules in `docs/storage-media-implementation.md`.

---

## 11. Admin Ops — `/api/v1/admin/ops` (`ops.controller.ts`) & Audit (`audit-trail.controller.ts`)
Roles: SUPER_ADMIN, OPS_ADMIN.

Read: `/admin/ops/deployment, /environment, /performance, /capacity, /jobs, /integrity, /outbox/analytics, /recovery, /redis, /outbox, /outbox/failed?limit=, /metrics, /alerts`.
Write: `POST /admin/ops/outbox/requeue/:id`, `POST /admin/ops/outbox/requeue-all` (200).
Audit: `GET /admin/ops/audit?entityType=&action=&limit=`.

These are operational/observability endpoints (deployment readiness, outbox relay health, job registry, Redis dependency checks) — not part of the resident-facing product. Frontend uses them only for the Operations/SuperAdmin observability screens.

---

## 12. Platform — `/health`, `/metrics` (`apps/api/src`)
- `GET /health` — liveness/readiness (Public).
- `GET /metrics` — Prometheus exposition (Public/internal).

---

## Endpoint count summary

| Module | Endpoints |
|--------|-----------|
| Auth | 6 |
| Users | 7 |
| KYC | 7 |
| Properties/Buildings/Floors | 15 |
| Rooms/Beds/Waitlist | 11 |
| Reservations | 4 |
| Bookings | 7 |
| Corporate | 6 |
| Dashboard | 3 |
| Media/Uploads | 5 |
| Admin Ops/Audit | 17 |
| Platform | 2 |
| **Total** | **~90** |
