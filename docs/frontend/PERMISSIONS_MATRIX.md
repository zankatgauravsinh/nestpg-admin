# Permissions Matrix

**Platform:** NestPG  
**Source of truth:** `docs/frontend/openapi.json` (69 endpoints)  
**Last reviewed:** 2026-06-06

---

## Roles

| Role | Portal | Description |
|------|--------|-------------|
| `SUPER_ADMIN` | Admin | Full platform access. Can manage users, properties, KYC, and system ops. |
| `OPS_ADMIN` | Admin | Operations access. Read-only on business data, full access on system health endpoints. |
| `OWNER` | Owner | Manages their own properties, buildings, floors, rooms, beds. Views own revenue. |
| `PROPERTY_MANAGER` | Manager | Assigned to properties by OWNER. Manages occupancy, bookings, check-in/out. |
| `TENANT` | Tenant | Self-service: KYC, waitlist, reservations, active booking management. |

---

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Full access |
| 👁 | Read-only |
| ✏️ | Own records only |
| ❌ | No access |
| 🔒 | Backend-enforced (not just UI-hidden) |

---

## 1. Authentication (`/api/v1/auth/*`)

| Endpoint | SUPER_ADMIN | OPS_ADMIN | OWNER | PROPERTY_MANAGER | TENANT |
|----------|-------------|-----------|-------|-----------------|--------|
| `POST /auth/register` | ❌ (admin-created) | ❌ | ✅ | ✅ | ✅ |
| `POST /auth/login` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /auth/verify-otp` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /auth/send-otp` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /auth/refresh` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `POST /auth/logout` | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 2. KYC (`/api/v1/kyc/*`)

| Endpoint | SUPER_ADMIN | OPS_ADMIN | OWNER | PROPERTY_MANAGER | TENANT |
|----------|-------------|-----------|-------|-----------------|--------|
| `GET /kyc/me` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GET /kyc/{userId}` | ✅ | 👁 | ❌ | ❌ | ❌ |
| `PATCH /kyc/{userId}/review` | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 3. Users (`/api/v1/users/*`)

| Endpoint | SUPER_ADMIN | OPS_ADMIN | OWNER | PROPERTY_MANAGER | TENANT |
|----------|-------------|-----------|-------|-----------------|--------|
| `GET /users/me` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `PATCH /users/me/profile` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `GET /users` | ✅ | 👁 | ❌ | ❌ | ❌ |
| `GET /users/{id}` | ✅ | 👁 | ❌ | ❌ | ❌ |
| `PATCH /users/{id}/status` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `PATCH /users/{id}/role` | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 4. Properties (`/api/v1/properties/*`)

| Endpoint | SUPER_ADMIN | OPS_ADMIN | OWNER | PROPERTY_MANAGER | TENANT |
|----------|-------------|-----------|-------|-----------------|--------|
| `GET /properties` | ✅ | 👁 | 👁 (all verified) | 👁 (assigned) | 👁 (verified only) |
| `POST /properties` | ✅ | ❌ | ✅ | ❌ | ❌ |
| `GET /properties/my` | ❌ | ❌ | ✅ | ❌ | ❌ |
| `GET /properties/{id}` | ✅ | 👁 | ✏️ | 👁 (assigned) | 👁 |
| `PATCH /properties/{id}` | ✅ | ❌ | ✏️ | ❌ | ❌ |
| `DELETE /properties/{id}` | ✅ | ❌ | ✏️ | ❌ | ❌ |
| `POST /properties/{id}/submit` | ❌ | ❌ | ✏️ | ❌ | ❌ |
| `POST /properties/{id}/verify` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `POST /properties/{id}/reject` | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 5. Buildings (`/api/v1/buildings/*` + `properties/{id}/buildings`)

| Endpoint | SUPER_ADMIN | OPS_ADMIN | OWNER | PROPERTY_MANAGER | TENANT |
|----------|-------------|-----------|-------|-----------------|--------|
| `POST /properties/{id}/buildings` | ✅ | ❌ | ✏️ | ❌ | ❌ |
| `GET /buildings/{id}` | ✅ | 👁 | ✏️ | 👁 | ❌ |
| `PATCH /buildings/{id}` | ✅ | ❌ | ✏️ | ❌ | ❌ |
| `DELETE /buildings/{id}` | ✅ | ❌ | ✏️ | ❌ | ❌ |

---

## 6. Floors (`/api/v1/floors/*` + `buildings/{id}/floors`)

| Endpoint | SUPER_ADMIN | OPS_ADMIN | OWNER | PROPERTY_MANAGER | TENANT |
|----------|-------------|-----------|-------|-----------------|--------|
| `POST /buildings/{id}/floors` | ✅ | ❌ | ✏️ | ❌ | ❌ |
| `GET /floors/{id}` | ✅ | 👁 | ✏️ | 👁 | ❌ |
| `PATCH /floors/{id}` | ✅ | ❌ | ✏️ | ❌ | ❌ |
| `DELETE /floors/{id}` | ✅ | ❌ | ✏️ | ❌ | ❌ |

---

## 7. Rooms (`/api/v1/floors/{floorId}/rooms/*`)

| Endpoint | SUPER_ADMIN | OPS_ADMIN | OWNER | PROPERTY_MANAGER | TENANT |
|----------|-------------|-----------|-------|-----------------|--------|
| `POST /floors/{floorId}/rooms` | ✅ | ❌ | ✏️ | ❌ | ❌ |
| `GET /floors/{floorId}/rooms/{id}` | ✅ | 👁 | ✏️ | 👁 | ❌ |
| `PATCH /floors/{floorId}/rooms/{id}` | ✅ | ❌ | ✏️ | ❌ | ❌ |
| `DELETE /floors/{floorId}/rooms/{id}` | ✅ | ❌ | ✏️ | ❌ | ❌ |

---

## 8. Beds (`/api/v1/beds/*` + `rooms/{roomId}/beds`)

| Endpoint | SUPER_ADMIN | OPS_ADMIN | OWNER | PROPERTY_MANAGER | TENANT |
|----------|-------------|-----------|-------|-----------------|--------|
| `POST /rooms/{roomId}/beds` | ✅ | ❌ | ✏️ | ❌ | ❌ |
| `GET /beds/available` | ✅ | 👁 | 👁 | ✅ | ✅ |
| `PATCH /beds/{id}/status` | ✅ | ❌ | ✏️ | ✅ (assigned property) | ❌ |
| `POST /beds/{id}/transfer` | ✅ | ❌ | ✏️ | ✅ (assigned property) | ❌ |

---

## 9. Waitlist (`/api/v1/waitlist/*`)

| Endpoint | SUPER_ADMIN | OPS_ADMIN | OWNER | PROPERTY_MANAGER | TENANT |
|----------|-------------|-----------|-------|-----------------|--------|
| `POST /waitlist` | ❌ | ❌ | ❌ | ❌ | ✅ |
| `GET /waitlist` | ✅ | 👁 | ✏️ (own properties) | ✅ (assigned) | ✏️ (own) |
| `DELETE /waitlist/{id}` | ✅ | ❌ | ❌ | ❌ | ✏️ (own) |

---

## 10. Reservations (`/api/v1/reservations/*`)

| Endpoint | SUPER_ADMIN | OPS_ADMIN | OWNER | PROPERTY_MANAGER | TENANT |
|----------|-------------|-----------|-------|-----------------|--------|
| `POST /reservations` | ❌ | ❌ | ❌ | ✅ | ✅ |
| `GET /reservations` | ✅ | 👁 | ✏️ | ✅ (assigned) | ✏️ (own) |
| `GET /reservations/{id}` | ✅ | 👁 | ✏️ | ✅ | ✏️ (own) |
| `DELETE /reservations/{id}/cancel` | ✅ | ❌ | ❌ | ✅ | ✏️ (own) |

---

## 11. Bookings (`/api/v1/bookings/*`)

| Endpoint | SUPER_ADMIN | OPS_ADMIN | OWNER | PROPERTY_MANAGER | TENANT |
|----------|-------------|-----------|-------|-----------------|--------|
| `POST /bookings` | ✅ | ❌ | ❌ | ✅ | ❌ |
| `GET /bookings` | ✅ | 👁 | ✏️ (own properties) | ✅ (assigned) | ✏️ (own) |
| `GET /bookings/{id}` | ✅ | 👁 | ✏️ | ✅ | ✏️ (own) |
| `POST /bookings/{id}/check-in` | ✅ | ❌ | ❌ | ✅ | ❌ |
| `POST /bookings/{id}/check-out` | ✅ | ❌ | ❌ | ✅ | ❌ |
| `POST /bookings/{id}/cancel` | ✅ | ❌ | ❌ | ✅ | ✏️ (own, pre-checkin) |
| `POST /bookings/{id}/notice` | ✅ | ❌ | ❌ | ✅ | ✏️ (own, active) |
| `POST /bookings/{id}/no-show` | ✅ | ❌ | ❌ | ✅ | ❌ |

---

## 12. Corporate (`/api/v1/corporate/*`)

| Endpoint | SUPER_ADMIN | OPS_ADMIN | OWNER | PROPERTY_MANAGER | TENANT |
|----------|-------------|-----------|-------|-----------------|--------|
| `POST /corporate/accounts` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `GET /corporate/accounts` | ✅ | 👁 | ❌ | ❌ | ❌ |
| `GET /corporate/accounts/{id}` | ✅ | 👁 | ❌ | ❌ | ❌ |
| `POST /corporate/agreements` | ✅ | ❌ | ✏️ | ❌ | ❌ |
| `GET /corporate/agreements` | ✅ | 👁 | ✏️ | 👁 (assigned) | ❌ |
| `GET /corporate/agreements/{id}` | ✅ | 👁 | ✏️ | 👁 | ❌ |
| `POST /corporate/agreements/{id}/assign-bed` | ✅ | ❌ | ✏️ | ✅ (assigned) | ❌ |
| `POST /corporate/agreements/{id}/cancel` | ✅ | ❌ | ✏️ | ❌ | ❌ |

---

## 13. Dashboard (`/api/v1/dashboard/*`)

| Endpoint | SUPER_ADMIN | OPS_ADMIN | OWNER | PROPERTY_MANAGER | TENANT |
|----------|-------------|-----------|-------|-----------------|--------|
| `GET /dashboard/occupancy` | ✅ (all) | 👁 (all) | ✏️ (own) | ✅ (assigned) | ❌ |
| `GET /dashboard/bookings` | ✅ (all) | 👁 (all) | ✏️ (own) | ✅ (assigned) | ❌ |
| `GET /dashboard/revenue` | ✅ (all) | 👁 (all) | ✏️ (own) | ❌ | ❌ |

---

## 14. Admin Ops (`/api/v1/admin/ops/*`)

| Endpoint | SUPER_ADMIN | OPS_ADMIN | OWNER | PROPERTY_MANAGER | TENANT |
|----------|-------------|-----------|-------|-----------------|--------|
| `GET /admin/ops/deployment` | ✅ | 👁 | ❌ | ❌ | ❌ |
| `GET /admin/ops/environment` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `GET /admin/ops/performance` | ✅ | 👁 | ❌ | ❌ | ❌ |
| `GET /admin/ops/capacity` | ✅ | 👁 | ❌ | ❌ | ❌ |
| `GET /admin/ops/jobs` | ✅ | 👁 | ❌ | ❌ | ❌ |
| `GET /admin/ops/integrity` | ✅ | 👁 | ❌ | ❌ | ❌ |
| `GET /admin/ops/outbox/analytics` | ✅ | 👁 | ❌ | ❌ | ❌ |
| `POST /admin/ops/recovery` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `GET /admin/ops/redis` | ✅ | 👁 | ❌ | ❌ | ❌ |
| `GET /admin/ops/outbox` | ✅ | 👁 | ❌ | ❌ | ❌ |
| `GET /admin/ops/outbox/failed` | ✅ | 👁 | ❌ | ❌ | ❌ |
| `GET /admin/ops/metrics` | ✅ | 👁 | ❌ | ❌ | ❌ |
| `GET /admin/ops/alerts` | ✅ | 👁 | ❌ | ❌ | ❌ |
| `POST /admin/ops/outbox/requeue/{id}` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `POST /admin/ops/outbox/requeue-all` | ✅ | ❌ | ❌ | ❌ | ❌ |
| `GET /admin/ops/audit` | ✅ | 👁 | ❌ | ❌ | ❌ |

---

## 15. Frontend Guard Strategy

Each route guard checks two things in order:

1. **`AuthGuard`** — is the user authenticated (valid JWT)?
2. **`RoleGuard`** — does the user's role match the required roles for this route?

Guards live in `shared/auth`. Business logic for access decisions is NOT duplicated in components. Components receive pre-filtered data from stores; they do not re-check permissions.

```typescript
// Route guard example (not implementation — architecture only)
{
  path: 'users',
  canActivate: [AuthGuard, RoleGuard],
  data: { roles: ['SUPER_ADMIN', 'OPS_ADMIN'] },
  loadComponent: () => import('./users-list/users-list.component')
}
```

**Note:** All access rules above reflect backend enforcement. The frontend enforces them for UX (hiding controls, redirecting routes) but never assumes the frontend is the last line of defense.
