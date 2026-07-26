# Shared Library Blueprint

**Platform:** NestPG  
**Monorepo root:** `nestpg-platform/`  
**Import alias prefix:** `@nestpg/`

---

## Overview

All six libraries are **zero-business-logic** at definition time. They provide primitives, contracts, and infrastructure — not features. Business logic lives in apps.

```
shared/
├── api/        @nestpg/api       HTTP SDK wrapper
├── auth/       @nestpg/auth      Authentication & authorization
├── ui/         @nestpg/ui        Design system components
├── layouts/    @nestpg/layouts   Shell structure components
├── models/     @nestpg/models    Domain type contracts
└── utils/      @nestpg/utils     Pure helpers
```

Dependency direction (no cycles):

```
@nestpg/models   ← depended on by everything
@nestpg/utils    ← depended on by ui, auth
@nestpg/api      ← depends on models
@nestpg/auth     ← depends on api, models
@nestpg/ui       ← depends on models, utils
@nestpg/layouts  ← depends on ui, auth, models
apps/*           ← depends on all shared libs
```

---

## 1. `shared/api` → `@nestpg/api`

### Responsibility

Provides a typed HTTP client for every backend endpoint. Consumers never import `HttpClient` directly; they import services from this library.

### Public API

```typescript
// SDK (generated — do not edit)
export { AuthService }          from './generated/api/auth.service';
export { UsersService }         from './generated/api/users.service';
export { KycService }           from './generated/api/kyc.service';
export { PropertiesService }    from './generated/api/properties.service';
export { BuildingsService }     from './generated/api/buildings.service';
export { FloorsService }        from './generated/api/floors.service';
export { RoomsService }         from './generated/api/rooms.service';
export { BedsService }          from './generated/api/beds.service';
export { WaitlistService }      from './generated/api/waitlist.service';
export { ReservationsService }  from './generated/api/reservations.service';
export { BookingsService }      from './generated/api/bookings.service';
export { CorporateService }     from './generated/api/corporate.service';
export { DashboardService }     from './generated/api/dashboard.service';
export { AdminOpsService }      from './generated/api/admin-ops.service';

// Wrappers / infrastructure
export { provideApi }           from './lib/providers';
export { AppError }             from './lib/error.model';
export { ApiConfig }            from './lib/api.config';

// Models (re-exported from generated)
export * from './generated/model';
```

### Internal structure

```
shared/api/src/
├── generated/              # openapi-generator output — do not edit
│   ├── api/
│   └── model/
├── lib/
│   ├── api.config.ts       # ApiConfiguration factory
│   ├── error.model.ts      # AppError interface
│   ├── interceptors/
│   │   ├── auth.interceptor.ts
│   │   ├── refresh.interceptor.ts
│   │   └── error.interceptor.ts
│   └── providers.ts        # provideApi()
└── index.ts
```

### What it does NOT contain

- Business logic (filtering, transformation)
- Caching or retry logic beyond auth refresh
- Component code

---

## 2. `shared/auth` → `@nestpg/auth`

### Responsibility

Authentication state, token lifecycle, route guards, and role-based permission utilities.

### Public API

```typescript
export { AuthStore }          from './lib/auth.store';
export { UserStore }          from './lib/user.store';
export { authGuard }          from './lib/guards/auth.guard';
export { roleGuard }          from './lib/guards/role.guard';
export { kycGuard }           from './lib/guards/kyc.guard';
export { HasRoleDirective }   from './lib/directives/has-role.directive';
export { provideAuth }        from './lib/providers';
export { UserRole, UserStatus } from './lib/auth.models';
```

### Internal structure

```
shared/auth/src/
├── lib/
│   ├── auth.store.ts           # AuthState — tokens, expiry
│   ├── user.store.ts           # UserState — profile, kyc, role
│   ├── auth.models.ts          # UserRole enum, UserProfile interface
│   ├── token.service.ts        # localStorage read/write — no angular state
│   ├── guards/
│   │   ├── auth.guard.ts       # isAuthenticated check
│   │   ├── role.guard.ts       # role match from route data
│   │   └── kyc.guard.ts        # KYC approval gate (tenant flows)
│   ├── directives/
│   │   └── has-role.directive.ts  # *hasRole="['OWNER']" structural directive
│   └── providers.ts
└── index.ts
```

### Guards

**`authGuard`** — redirects to `/login` if `AuthStore.isAuthenticated()` is false.

**`roleGuard`** — reads `route.data.roles: UserRole[]` and checks `UserStore.role()`. Redirects to `/unauthorized` if mismatch.

**`kycGuard`** — for Tenant Portal routes that require an approved KYC (e.g., creating a reservation). Redirects to `/kyc` if not approved.

### `HasRoleDirective`

Structural directive that removes the host element from the DOM if the current user's role is not in the allowed list. Used to hide navigation items, action buttons, etc.

---

## 3. `shared/ui` → `@nestpg/ui`

### Responsibility

The design system component library. All components are **presentational (dumb)** — they receive inputs and emit outputs. No HTTP, no stores, no routing.

### Public API (component catalogue)

```typescript
// Layout primitives
export { PageHeaderComponent }     // Title + subtitle + back + actions slot
export { SectionHeaderComponent }  // Section title + rule + optional action
export { CardComponent }           // Elevation-1 card wrapper

// Data display
export { DataTableComponent }      // Sortable, paginated, skeleton-aware table
export { StatusChipComponent }     // Typed status chips (booking, kyc, property, bed)
export { AvatarComponent }         // User avatar (initials fallback)
export { StatCardComponent }       // Dashboard stat tile (label + value + delta)

// Forms
export { FormFieldComponent }      // Label + input wrapper + error display
export { SearchInputComponent }    // Debounced search with clear
export { FilterBarComponent }      // Collapsible filter row

// Feedback
export { EmptyStateComponent }     // Icon + message + optional CTA
export { SkeletonComponent }       // Animated pulse skeleton
export { InlineErrorComponent }    // API error banner for forms

// Navigation
export { BreadcrumbComponent }     // Breadcrumb from array of items

// Overlays
export { ConfirmDialogComponent }  // Reusable destructive confirmation dialog

// Pipes (exported for use in any template)
export { PaisePipe }               // Integer paise → "₹1,200"
export { RelativeTimePipe }        // ISO date → "2 hours ago"
export { PhonePipe }               // Raw phone → "+91 98765 43210"
export { TruncatePipe }            // String truncation with ellipsis

// Theme
export { ThemeService }            // currentTheme signal, toggle()
export { provideTheme }            // app-level theme provider
```

### What it does NOT contain

- Route logic
- HTTP calls
- Store references
- Business-domain components (e.g., `BookingCardComponent` — that belongs in the feature)

### Theming

All components are styled using Angular Material M3 custom theme + Tailwind. They respond to `[data-theme]` on `<html>` automatically via CSS custom properties.

---

## 4. `shared/layouts` → `@nestpg/layouts`

### Responsibility

Application shell structure: the outer frame that wraps every authenticated page. Includes sidebar, topbar, and page wrapper. Role-aware navigation is built here.

### Public API

```typescript
export { AppShellComponent }        // Full shell: sidebar + topbar + router-outlet
export { SidebarComponent }         // Navigation sidebar (inputs: navItems, collapsed)
export { TopbarComponent }          // Logo + breadcrumb + notifications + avatar
export { PageWrapperComponent }     // Content padding + max-width container
export { AuthShellComponent }       // Minimal shell for login/register pages
export { NavItem }                  // Interface for sidebar nav configuration
export { provideNavItems }          // DI token for per-app nav config
```

### Per-app nav configuration

Each app provides its own nav item array via `provideNavItems()`. `SidebarComponent` consumes it. This avoids layouts importing app-specific constants.

```typescript
// In apps/admin/src/app/app.config.ts (architecture only)
providers: [
  provideNavItems(ADMIN_NAV_ITEMS)
]
```

### What it does NOT contain

- Page-level content components
- Feature logic
- Direct API calls

---

## 5. `shared/models` → `@nestpg/models`

### Responsibility

Canonical TypeScript types for the entire platform. Single source of truth — apps and libraries all import types from here, never from the generated SDK models directly (the SDK models are re-exported through `@nestpg/api`; `@nestpg/models` holds hand-curated domain types and enums that are richer than the raw generated DTOs).

### Public API

```typescript
// Enums
export { UserRole }          // SUPER_ADMIN | OPS_ADMIN | OWNER | PROPERTY_MANAGER | TENANT
export { UserStatus }        // ACTIVE | SUSPENDED | PENDING_VERIFICATION
export { KycStatus }         // PENDING | SUBMITTED | APPROVED | REJECTED
export { PropertyStatus }    // DRAFT | PENDING_REVIEW | VERIFIED | REJECTED
export { PropertyType }      // PG | HOSTEL | COLIVING | ...
export { RoomType }          // SINGLE | DOUBLE | TRIPLE | DORMITORY
export { BedStatus }         // AVAILABLE | OCCUPIED | RESERVED | BLOCKED | MAINTENANCE
export { BookingStatus }     // RESERVED | CHECKED_IN | CHECKED_OUT | CANCELLED | NO_SHOW | NOTICE_GIVEN
export { Gender }            // MALE | FEMALE | ANY
export { PaymentMode }       // CASH | UPI | BANK_TRANSFER

// Domain interfaces (enriched, not raw DTOs)
export { UserProfile }
export { KycRecord }
export { Property }
export { Building }
export { Floor }
export { Room }
export { Bed }
export { WaitlistEntry }
export { Reservation }
export { Booking }
export { CorporateAccount }
export { CorporateAgreement }

// Pagination
export { PaginatedResponse<T> }
export { PaginationParams }

// Common
export { AppError }          // re-exported from @nestpg/api
```

### Zero runtime dependencies

This library has no Angular, no RxJS, no HTTP. Pure TypeScript interfaces and enums. It can be imported anywhere, including future Node.js scripts or SSR contexts.

---

## 6. `shared/utils` → `@nestpg/utils`

### Responsibility

Pure, stateless helper functions, Angular pipes, RxJS operators, and form validators. Nothing that has side effects or holds state.

### Public API

```typescript
// Currency
export { toPaise }              // rupees (number) → paise (integer)
export { toRupees }             // paise (integer) → rupees (number)
export { formatCurrency }       // paise → "₹1,200"

// Dates
export { formatDate }           // ISO string → "12 Jan 2025"
export { formatRelative }       // ISO string → "2 hours ago"
export { daysBetween }          // (dateA, dateB) → number

// Phone
export { formatPhone }          // "+919876543210" → "+91 98765 43210"
export { normalizePhone }       // any format → E.164

// Strings
export { truncate }             // (str, maxLen) → "Hello wo..."
export { initials }             // "Gaurav Sharma" → "GS"
export { slugify }              // "Sunrise PG" → "sunrise-pg"

// Angular Pipes
export { PaisePipe }
export { RelativeTimePipe }
export { PhonePipe }
export { TruncatePipe }

// RxJS operators
export { debounceSearch }       // debounceTime(300) + distinctUntilChanged + filter(≥2 chars)
export { tapOnce }              // side effect on first emission only

// Validators
export { phoneValidator }       // AbstractControl → ValidationErrors | null
export { pinCodeValidator }
export { gstinValidator }
export { futureDateValidator }
export { dateRangeValidator }   // (start, end) → ValidatorFn

// NgRx Signals compositions
export { withPagination }
export { withSearch }
export { withSort }
export { withLoading }
export { withSelectedItem }
```

### What it does NOT contain

- HTTP calls
- Angular services with injected state
- Domain-specific logic
- Any import from `@nestpg/api` or `@nestpg/auth`
