# Route Architecture

**Platform:** NestPG  
**Status:** Architecture only — no implementation  
**Guards:** `AuthGuard` + `RoleGuard` on all authenticated routes

---

## Conventions

- All portals use Angular 20 standalone routing with lazy-loaded route groups.
- Auth routes are public (no guards).
- All other routes require `AuthGuard` at minimum.
- `RoleGuard` is applied per route group with `data: { roles: [...] }`.
- Redirect after login is determined by the user's role, not a hardcoded path.
- 404 and unauthorized pages are handled at the app shell level.

---

## 1. Admin Portal (`apps/admin`)

Base: served on a dedicated subdomain or path (e.g., `admin.nestpg.in` or `/admin`)

```
/
├── login                           # Public — AdminLoginPage
├── (shell)                         # AppShell — AuthGuard + role: [SUPER_ADMIN, OPS_ADMIN]
│   ├── dashboard                   # AdminDashboardPage — overview metrics
│   │
│   ├── users/
│   │   ├── (list)                  # UserListPage — paginated user table
│   │   └── :id                     # UserDetailPage — profile, KYC, status, role
│   │
│   ├── kyc/
│   │   ├── (list)                  # KycQueuePage — pending KYC reviews
│   │   └── :userId                 # KycReviewPage — approve / reject KYC
│   │
│   ├── properties/
│   │   ├── (list)                  # PropertyListPage — all properties, any status
│   │   └── :id                     # PropertyDetailPage — verify / reject
│   │
│   ├── corporate/
│   │   ├── accounts/
│   │   │   ├── (list)              # CorporateAccountListPage
│   │   │   ├── new                 # CorporateAccountCreatePage — SUPER_ADMIN only
│   │   │   └── :id                 # CorporateAccountDetailPage
│   │   └── agreements/
│   │       ├── (list)              # CorporateAgreementListPage
│   │       └── :id                 # CorporateAgreementDetailPage
│   │
│   ├── ops/                        # SUPER_ADMIN: full | OPS_ADMIN: read-only
│   │   ├── (overview)              # OpsOverviewPage — deployment, environment
│   │   ├── performance             # PerformancePage — DB / API metrics
│   │   ├── capacity                # CapacityPage
│   │   ├── jobs                    # JobsPage — scheduled jobs status
│   │   ├── integrity               # IntegrityPage — data integrity checks
│   │   ├── redis                   # RedisPage
│   │   ├── outbox/
│   │   │   ├── (list)              # OutboxPage — event outbox
│   │   │   ├── failed              # OutboxFailedPage — SUPER_ADMIN: requeue actions
│   │   │   └── analytics           # OutboxAnalyticsPage
│   │   ├── alerts                  # AlertsPage
│   │   ├── metrics                 # MetricsPage
│   │   ├── recovery                # RecoveryPage — SUPER_ADMIN only
│   │   └── audit                   # AuditLogPage
│   │
│   └── settings                    # AdminSettingsPage — SUPER_ADMIN only
│
└── **                              # → /login (unauthenticated) or /dashboard
```

---

## 2. Owner Portal (`apps/owner`)

Base: `owner.nestpg.in` or `/owner`

```
/
├── login                           # Public — OwnerLoginPage
├── register                        # Public — OwnerRegisterPage
├── verify                          # Public — OtpVerifyPage
│
├── (shell)                         # AppShell — AuthGuard + role: [OWNER]
│   ├── dashboard                   # OwnerDashboardPage — revenue, occupancy, alerts
│   │
│   ├── properties/
│   │   ├── (list)                  # PropertyListPage — owner's properties
│   │   ├── new                     # PropertyCreatePage
│   │   └── :propertyId/
│   │       ├── (overview)          # PropertyOverviewPage — status, submit for review
│   │       ├── buildings/
│   │       │   ├── new             # BuildingCreatePage
│   │       │   └── :buildingId/
│   │       │       ├── (detail)    # BuildingDetailPage
│   │       │       └── floors/
│   │       │           ├── new     # FloorCreatePage
│   │       │           └── :floorId/
│   │       │               ├── (detail)  # FloorDetailPage
│   │       │               └── rooms/
│   │       │                   ├── new   # RoomCreatePage
│   │       │                   └── :roomId/
│   │       │                       ├── (detail)  # RoomDetailPage
│   │       │                       └── beds/
│   │       │                           ├── new   # BedCreatePage
│   │       │                           └── :bedId  # BedDetailPage
│   │       └── corporate/
│   │           └── agreements      # PropertyAgreementsPage — corporate agreements for this property
│   │
│   ├── bookings/
│   │   ├── (list)                  # BookingListPage — all bookings across owned properties
│   │   └── :id                     # BookingDetailPage
│   │
│   ├── corporate/
│   │   └── agreements/
│   │       ├── (list)              # AgreementListPage
│   │       ├── new                 # AgreementCreatePage
│   │       └── :id                 # AgreementDetailPage — assign beds
│   │
│   ├── profile                     # OwnerProfilePage — update profile, KYC status
│   └── settings                    # OwnerSettingsPage
│
└── **                              # → /login
```

---

## 3. Manager Portal (`apps/manager`)

Base: `manager.nestpg.in` or `/manager`

```
/
├── login                           # Public — ManagerLoginPage
├── verify                          # Public — OtpVerifyPage
│
├── (shell)                         # AppShell — AuthGuard + role: [PROPERTY_MANAGER]
│   ├── dashboard                   # ManagerDashboardPage — assigned property stats
│   │
│   ├── occupancy                   # OccupancyPage — live bed map, status overview
│   │
│   ├── bookings/
│   │   ├── (list)                  # BookingListPage — all bookings for assigned properties
│   │   └── :id/
│   │       ├── (detail)            # BookingDetailPage
│   │       ├── check-in            # CheckInPage
│   │       ├── check-out           # CheckOutPage
│   │       └── notice              # GiveNoticePage
│   │
│   ├── reservations/
│   │   ├── (list)                  # ReservationListPage
│   │   └── :id                     # ReservationDetailPage — confirm / cancel
│   │
│   ├── beds/
│   │   ├── available               # AvailableBedsPage — real-time availability
│   │   └── :id/
│   │       ├── status              # BedStatusPage — block / unblock
│   │       └── transfer            # BedTransferPage
│   │
│   ├── waitlist/
│   │   ├── (list)                  # WaitlistPage — all waitlist entries
│   │   └── :id                     # WaitlistDetailPage
│   │
│   ├── corporate/
│   │   └── agreements/
│   │       ├── (list)              # AgreementListPage — assigned properties only
│   │       └── :id                 # AgreementDetailPage — assign beds to employees
│   │
│   ├── profile                     # ManagerProfilePage
│   └── settings                    # ManagerSettingsPage
│
└── **                              # → /login
```

---

## 4. Tenant Portal (`apps/tenant`)

Base: `nestpg.in` or `/`  
PWA-enabled. Capacitor mobile target (Phase F4+).

```
/
├── login                           # Public — TenantLoginPage
├── register                        # Public — TenantRegisterPage
├── verify                          # Public — OtpVerifyPage
│
├── (shell)                         # AppShell — AuthGuard + role: [TENANT]
│   ├── home                        # HomePage — active booking summary or browse CTA
│   │
│   ├── search                      # BedSearchPage — browse available beds, filter
│   │   └── :bedId                  # BedDetailPage — bed info, reserve action
│   │
│   ├── waitlist/
│   │   ├── (list)                  # MyWaitlistPage — own waitlist entries
│   │   ├── new                     # JoinWaitlistPage
│   │   └── :id                     # WaitlistDetailPage — status, cancel
│   │
│   ├── reservations/
│   │   ├── (list)                  # MyReservationsPage
│   │   └── :id                     # ReservationDetailPage — status, cancel
│   │
│   ├── booking/
│   │   └── (active)                # ActiveBookingPage — current booking, notice action
│   │       └── history             # BookingHistoryPage — past bookings
│   │
│   ├── kyc/
│   │   ├── (status)                # KycStatusPage — current KYC status
│   │   └── submit                  # KycSubmitPage — upload documents
│   │
│   ├── profile                     # TenantProfilePage — update profile
│   └── settings                    # TenantSettingsPage — notifications, theme
│
└── **                              # → /home (authenticated) or /login
```

---

## 5. Shared Auth Flow (all portals)

```
POST /auth/register
  └── POST /auth/send-otp (phone)
      └── POST /auth/verify-otp
          └── → portal dashboard

POST /auth/login (phone + password)
  └── → portal dashboard

POST /auth/refresh (silent, interceptor-driven)
  └── → retry original request

POST /auth/logout
  └── → /login, clear tokens
```

OTP verification page is shared by registration and "forgot password" flows. The `purpose` field on `VerifyOtpDto` (`REGISTRATION` | `LOGIN` | `PASSWORD_RESET`) determines behavior.

---

## 6. Post-Login Redirect Logic

```
SUPER_ADMIN   → /admin/dashboard
OPS_ADMIN     → /admin/ops
OWNER         → /owner/dashboard
PROPERTY_MGR  → /manager/dashboard
TENANT        → /home
```

If a user lands on the wrong portal for their role (e.g., a TENANT hits the admin app), they are redirected to their correct portal URL.
