# NestPG PMS — Permissions Matrix

> Derived from `@Roles`, `@UseGuards`, `@Public`, and in-service ownership checks.
> Columns abbreviated: **SA**=SUPER_ADMIN, **OA**=OPS_ADMIN, **FA**=FINANCE_ADMIN,
> **OWN**=PG_OWNER, **MGR**=PROP_MANAGER, **HR**=CORP_HR, **TEN**=TENANT.
> ✅ allowed · 🔓 public (no auth) · 👤 self-only · 🏠 owner/manager-of-resource (ownership-checked) · — denied.

## Guards in play
- `JwtAuthGuard` — valid bearer required.
- `RolesGuard` — `@Roles(...)` allowlist.
- `SecurityThrottlerGuard` — Redis rate-limit on auth-sensitive routes.
- `OwnerAccessGuard` (`booking-access.guard.ts`) — caller must own/manage the booking's property (admins bypass).
- In-service ownership: properties/buildings/rooms/beds re-check `owner_id` or an active `property_manager_assignments` row; media re-checks via `MediaOwnershipService`.

## Endpoint × Role

| Endpoint | SA | OA | FA | OWN | MGR | HR | TEN |
|----------|----|----|----|----|-----|----|----|
| `POST /auth/*` (register/login/otp/refresh) | 🔓 | 🔓 | 🔓 | 🔓 | 🔓 | 🔓 | 🔓 |
| `POST /auth/logout` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GET /users/me`, `/me/profile`, `PUT /me/profile` | 👤 | 👤 | 👤 | 👤 | 👤 | 👤 | 👤 |
| `GET /users`, `/users/:id` | ✅ | ✅ | — | ✅ | ✅ | — | — |
| `PUT /users/:id/status` | ✅ | ✅ | — | — | — | — | — |
| `PUT /users/:id/role` | ✅ | — | — | — | — | — | — |
| `GET /kyc/me`, `POST /kyc/me`, `/me/documents` | 👤 | 👤 | 👤 | 👤 | 👤 | 👤 | 👤 |
| `GET /kyc/:userId`, `/:userId/documents` | ✅ | ✅ | — | — | — | — | — |
| `POST /kyc/:userId/review` | ✅ | ✅ | — | — | — | — | — |
| `GET /properties`, `/properties/:id` | 🔓 | 🔓 | 🔓 | 🔓 | 🔓 | 🔓 | 🔓 |
| `GET /properties/my` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (own) |
| `POST /properties` | ✅ | ✅ | — | ✅ | — | — | — |
| `PUT /properties/:id` | ✅ | ✅ | — | 🏠 | 🏠 | — | — |
| `POST /properties/:id/submit` | — | — | — | 🏠 | — | — | — |
| `PUT /properties/:id/verify`, `/reject` | ✅ | ✅ | — | — | — | — | — |
| `DELETE /properties/:id` | ✅ | — | — | 🏠 | — | — | — |
| `GET /properties/:id/buildings` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /properties/:id/buildings`, `PUT/DELETE /buildings/:id` | ✅ | ✅ | — | 🏠 | 🏠* | — | — |
| `*/floors`, `*/rooms` (create/update) | ✅ | ✅ | — | 🏠 | 🏠 | — | — |
| `DELETE buildings/rooms` | ✅ | — | — | 🏠 | — | — | — |
| `POST /rooms/:roomId/beds` | ✅ | ✅ | — | 🏠 | 🏠 | — | — |
| `GET /rooms/:roomId/beds`, `GET /beds/available` | 🔓 | 🔓 | 🔓 | 🔓 | 🔓 | 🔓 | 🔓 |
| `PUT /beds/:id/status`, `POST /beds/:id/transfer` | ✅ | ✅ | — | 🏠 | 🏠 | — | — |
| `GET/POST/DELETE /waitlist` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /reservations`, list, cancel | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (own) |
| `POST /bookings` (convert) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 👤 (own reservation) |
| `GET /bookings`, `/bookings/:id` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /bookings/:id/check-in`, `/check-out` | ✅ | ✅ | — | 🏠 | 🏠 | — | — |
| `POST /bookings/:id/cancel`, `/notice` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /bookings/:id/no-show` | ✅ | ✅ | — | 🏠 | 🏠 | — | — |
| `POST /corporate/accounts` | ✅ | ✅ | — | — | — | ✅ | — |
| `GET /corporate/accounts/:id`, `/agreements/:id` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /corporate/agreements` | ✅ | ✅ | — | ✅ | — | ✅ | — |
| `POST /corporate/agreements/:id/assign-bed`, `/cancel` | ✅ | ✅ | — | 🏠 | 🏠 | — | — |
| `GET /dashboard/*` | ✅ | ✅ | ✅ | ✅ | ✅ | — | — |
| `POST /uploads/presign`, `/confirm` | ✅ | ✅ | ✅ | 🏠 | 🏠 | 👤 | 👤 |
| `POST /uploads/presign-get` (KYC) | ✅ | ✅ | ✅(any private) | 👤 | 👤 | 👤 | 👤 |
| `GET /media`, `DELETE /media/:id` | ✅ | ✅ | ✅ | 🏠 | 🏠 | 👤 | 👤 |
| `GET/POST /admin/ops/*`, `/audit` | ✅ | ✅ | — | — | — | — | — |
| `GET /health`, `/metrics` | 🔓 | 🔓 | 🔓 | 🔓 | 🔓 | 🔓 | 🔓 |

\* PROP_MANAGER passes ownership checks only when an active `property_manager_assignments` row links them to the property.

## CRUD action matrix (resource → role capability)

| Resource | Read | Create | Update | Delete | Approve/Reject | Export |
|----------|------|--------|--------|--------|----------------|--------|
| User | SA/OA/OWN/MGR (others: self) | (via auth register) | self; status SA/OA; role SA | — (status→DELETED) | — | — |
| Property | public | OWN/SA/OA | OWN/MGR/SA/OA | OWN/SA | verify/reject SA/OA | — |
| Building/Floor/Room | authed/public | OWN/MGR/SA/OA | OWN/MGR/SA/OA | OWN/SA | — | — |
| Bed | public | OWN/MGR/SA/OA | status OWN/MGR/SA/OA | — | — | — |
| Reservation | owner/admin | any authed | — | cancel (owner) | — | — |
| Booking | authed | TEN (own res.)/admin | transitions OWN/MGR/SA/OA | cancel | no-show OWN/MGR/SA/OA | — |
| KYC | self; reviewers SA/OA | self submit | — | — | review SA/OA | — |
| Corporate | authed | HR/OWN/SA/OA | assign/cancel OWN/MGR/SA/OA | — | — | — |
| Media | authed | owner/self | — | owner/self | — | — |

## Notable authorization observations
- **No FINANCE_ADMIN-specific finance endpoints** exist beyond dashboard read + private-doc read; finance is otherwise unmodeled.
- **CARETAKER, HOUSEKEEPING, SECURITY, GUEST roles have effectively no dedicated endpoints** — they fall through to "authed" routes only.
- `GET /bookings` and `GET /reservations` are role-open to any authed user; **row-level scoping to the caller's own/managed data is enforced in the service query**, not the guard — verify when building tenant-facing views.
- Public read of `GET /beds/available` and `GET /rooms/:roomId/beds` exposes inventory without auth (intended for discovery).
