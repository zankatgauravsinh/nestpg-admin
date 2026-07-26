# NestPG PMS — Route Map & Role-Based Navigation

> Canonical route tree, guards, lazy boundaries, and role gating. Grounded in
> `app.routes.ts` + `nav.config.ts`. FE personas: `SUPER_ADMIN | OWNER | MANAGER`
> (mapped from 11 backend roles — see `frontend-architecture.md §5`).

## 1. Top-level shell

```
/auth/**                         → AuthShell (no guard, public)
/**  (everything else)           → AppShell  [canActivate: authGuard]
```
- **`authGuard`** [exists] — unauthenticated → `/auth/login?returnUrl=<url>`; after login, redirect back.
- **`roleGuard`** [exists] — `data.roles: Role[]`; persona not in list → redirect `/dashboard` (or 403 screen).
- Both guards are functional (`CanActivateFn`) reading `SessionStore`.

## 2. Route tree (lazy `loadComponent` everywhere)

### Auth (public) — `AuthShell`
| Path | Screen |
|------|--------|
| `/auth/login` | Login (password or OTP) |
| `/auth/register` | Register → OTP |
| `/auth/forgot-password` | Forgot (send OTP, purpose PASSWORD_RESET) |
| `/auth/reset-password` | Reset |

### App (guarded) — `AppShell`
| Path | Screen | Persona gate (`roleGuard`) |
|------|--------|----------------------------|
| `/dashboard` | Role-aware dashboard | all |
| `/dashboard/owner` | Owner dashboard | SUPER_ADMIN, OWNER |
| `/dashboard/manager` | Manager dashboard | SUPER_ADMIN, MANAGER |
| `/search` | Global search | all |
| **Properties** | | |
| `/properties` | Portfolio hub | all |
| `/properties/new` | Create-property wizard | SUPER_ADMIN, OWNER |
| `/properties/workspace` | Property workspace (`?id=`) | all |
| `/properties/:id/inventory/new` | Add-inventory workspace | SUPER_ADMIN, OWNER, MANAGER |
| `/inventory` | Inventory board | all |
| **Residents** | | |
| `/residents` | Residents command center | all |
| `/residents/crm` | Resident CRM (`?id=`) | all |
| **Bookings** | | |
| `/bookings` | Bookings list (mode=all) | all |
| `/bookings/reservations` | Reservations | all |
| `/bookings/waitlist` | Waitlist | all |
| `/bookings/check-in` | Check-in (bookings list mode) | all |
| `/bookings/check-out` | Check-out (bookings list mode) | all |
| **Finance** ⚠️ mock | | |
| `/finance/payments` | Payments feed (from bookings) | all (data: OWNER/SA/FA) |
| `/finance/collections` | Collections | all |
| **Operations** | | |
| `/operations` | Operations center | all |
| `/operations/tickets` ⚠️ mock | Tickets board | all |
| `/operations/kyc` | KYC queue | SUPER_ADMIN (OPS_ADMIN) |
| **Analytics** | | |
| `/analytics/revenue` | Revenue analytics | SUPER_ADMIN, OWNER |
| `/analytics/occupancy` | Occupancy analytics | all |
| **Communication** ⚠️ mock | | |
| `/communication` | Comms hub | all |
| **Administration** | | |
| `/admin/users` | Users admin | SUPER_ADMIN, OWNER |
| `/admin/roles` | Roles admin | SUPER_ADMIN |
| `/admin/settings` | Settings | SUPER_ADMIN, OWNER |
| `**` | redirect → `/dashboard` | |

⚠️ mock = screen renders against mock SDK (no backend; see integration guide §B).

## 3. Route param conventions
- **Detail via query param** for peek/CRM screens kept inside a list context: `/residents/crm?id=`, `/properties/workspace?id=`. Reactive `queryParamMap` fetch (never snapshot).
- **Detail via path param** for owned sub-resources: `/properties/:id/inventory/new`.
- **List mode via `data`**: bookings reuses one component with `data:{mode}` for all/check-in/check-out (eyebrow/title in `data`).
- Use `withComponentInputBinding()` so route params/`data` bind to component `input()`s directly.

## 4. Navigation model (`nav.config.ts`)
Sidebar is data-driven: `NavItem { id, label, icon?, route?, isSection?, roles?, badge? }`. Sections render as group labels. `roles` (FE persona array) gates visibility — the **sidebar shows only what the persona may see**, but route guards remain the real gate (defense in depth). Badge counts (KYC queue, collections, tickets) come from a small `BadgeStore` refreshed after relevant mutations / on a timer.

Section order (fixed): Workspace · Properties · Residents · Bookings · Finance · Operations · Analytics · Communication · Administration.

## 5. Role → visible navigation (summary)
| Persona | Sees |
|---------|------|
| **SUPER_ADMIN** | everything (incl. Roles, all dashboards, KYC, ops) |
| **OWNER** | own dashboards, Properties, Residents, Bookings, Finance, Operations (no Roles), Analytics, Users/Settings |
| **MANAGER** | Manager dashboard, Properties (assigned), Inventory, Residents, Bookings, Operations, Occupancy analytics; **no** Admin section, no Revenue, no property create |

Action-level gating (beyond nav) uses `backendRole()` — e.g. property **verify/reject** shows only for OPS_ADMIN/SUPER_ADMIN even though the OWNER persona can see the property; KYC **review** only for OPS_ADMIN/SUPER_ADMIN.

## 6. Guard placement rules
- `authGuard` once at the `AppShell` parent (covers all children).
- `roleGuard` on individual routes via `data.roles` (persona list).
- Within a screen, hide/disable mutating controls the `backendRole()` can't perform; the backend still returns 403 as the hard stop.
- Deep-link safety: guarded route hit while logged-out → returnUrl round-trip preserves the destination (incl. query params).

## 7. Lazy-loading & code-split boundaries
Each route `loadComponent`s a single standalone component. Heavy shared deps (charts) are imported by the feature, not the shell, so they only load with their screens. Wizards (`/properties/new`, `/properties/:id/inventory/new`) are their own chunks. The AuthShell tree is fully separate from AppShell so unauthenticated bundles stay minimal.
