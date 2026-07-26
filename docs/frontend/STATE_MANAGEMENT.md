# State Management Strategy

**Platform:** NestPG  
**Architecture:** Signals-first · NgRx Signal Store · RxJS at the boundary only

---

## 1. Philosophy

Angular 20 makes signals the primary reactive primitive. The state strategy follows three rules:

1. **Signals for state** — all stored state is a signal or derived from a signal. No BehaviorSubjects used as state containers.
2. **RxJS for effects** — HTTP calls, timers, WebSocket streams are RxJS. They are always converted to signals at the store boundary using `toSignal()` or `rxResource()`.
3. **Stores own state, components read it** — components do not hold business state. They receive signals from stores and dispatch actions (call store methods). Components are thin.

---

## 2. Technology Decisions

| Need | Tool | Rationale |
|------|------|-----------|
| Shared cross-app state (auth, user) | `@ngrx/signals` `signalStore()` | Typed, tree-shakable, Angular 20 native |
| Feature-local async data | Angular `resource()` / `rxResource()` | Built-in, no extra dep, integrates with signals |
| Complex async workflows (refresh, retry) | RxJS Observables → `toSignal()` | RxJS is best for sequences; signals consume the result |
| Component-local UI state | `signal()`, `computed()` | No store needed for ephemeral UI |
| Theme preference | `signal()` in a lightweight service | Simple, no NgRx overhead needed |
| Form state | Angular Reactive Forms | Signals don't replace forms |

---

## 3. Authentication State

**Location:** `shared/auth/src/lib/auth.store.ts`  
**Library:** `@nestpg/auth`

### Shape

```typescript
// Architecture — types only, not implementation

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;      // Unix ms
  isLoading: boolean;
  error: AppError | null;
}
```

### Computed selectors

```typescript
isAuthenticated: Signal<boolean>   // accessToken !== null && !isExpired
isExpired: Signal<boolean>         // Date.now() > expiresAt
```

### Store methods

```typescript
login(credentials: LoginDto): Promise<void>
refreshTokens(): Promise<void>
logout(): void
clearError(): void
```

### Token persistence

Tokens are persisted to `localStorage` (access + refresh). On app init, `AuthStore` reads `localStorage` and rehydrates. Expiry is checked on rehydration — expired access tokens trigger a silent refresh before the app shell loads.

### Token security notes

- Access token: short-lived (15 min, backend-configured)
- Refresh token: long-lived (7 days, backend-configured)
- Tokens are stored in `localStorage` (acceptable for this platform tier; `httpOnly` cookie upgrade is a future hardening task)
- `AuthStore` is provided at app root — one instance per application

---

## 4. User Profile State

**Location:** `shared/auth/src/lib/user.store.ts`  
**Library:** `@nestpg/auth`

### Shape

```typescript
interface UserState {
  profile: UserProfile | null;     // from GET /users/me
  kycStatus: KycStatus | null;     // from GET /kyc/me
  isLoading: boolean;
}

interface UserProfile {
  id: string;
  phone: string;
  email: string | null;
  role: UserRole;
  status: UserStatus;
  fullName: string | null;
  // ... remaining profile fields
}
```

### Computed selectors

```typescript
isProfileComplete: Signal<boolean>
role: Signal<UserRole | null>
hasRole: (roles: UserRole[]) => Signal<boolean>   // used by RoleGuard
```

### Loading strategy

`UserStore` is loaded once after successful authentication. It is not re-fetched on every navigation — only on explicit profile save or role change events.

---

## 5. Theme State

**Location:** `shared/ui/src/lib/theme.service.ts` (lightweight, not a signal store)

### Shape

```typescript
type Theme = 'light' | 'dark' | 'system';

// Exposed signals
currentTheme: Signal<Theme>
resolvedTheme: Signal<'light' | 'dark'>   // 'system' resolves via matchMedia
```

### Persistence

User preference stored in `localStorage` under key `nestpg_theme`. Default: `'system'`.

### Application

On theme change, `[data-theme]` attribute on `<html>` is updated. CSS custom properties respond to this attribute (see DESIGN_SYSTEM.md §2). Angular Material's theme also responds via CSS class on `<body>`.

---

## 6. Global App State

A lightweight `AppStore` in each app holds cross-feature global state:

**Location:** `apps/{portal}/src/app/app.store.ts`

```typescript
interface AppState {
  sidebarCollapsed: boolean;
  pendingKycCount: number;      // admin only — badge on KYC nav item
  // ... portal-specific global counters
}
```

This store is minimal. It holds only state that is needed by the shell (sidebar, topbar) and cannot be derived from URL or feature stores.

---

## 7. Feature-Local State

Individual features (e.g., bookings list, property editor) manage their own state. Two patterns are used:

### Pattern A: `resource()` for read-only async data

For pages that fetch a list or detail record and display it:

```typescript
// Architecture — pattern only

// In a component or a lightweight feature service:
readonly bookings = rxResource({
  request: () => this.filters(),
  loader: ({ request }) => this.bookingsService.getBookings(request)
});

// In template:
@if (bookings.isLoading()) { <skeleton /> }
@else if (bookings.error()) { <error-state /> }
@else { <booking-list [data]="bookings.value()" /> }
```

### Pattern B: `signalStore()` for writable feature state

For pages that need optimistic updates, pagination, filtering, and mutation:

```typescript
// Architecture — store structure only

const BookingsStore = signalStore(
  withState<BookingsState>({ ... }),
  withComputed((store) => ({
    filteredBookings: computed(() => ...),
    totalPages: computed(() => ...)
  })),
  withMethods((store, bookingsService = inject(BookingsService)) => ({
    loadPage(page: number) { ... },
    checkIn(bookingId: string) { ... },
    checkOut(bookingId: string) { ... }
  }))
);
```

**Rule:** Use `resource()` first. Only reach for `signalStore()` when the feature needs multi-step mutation, optimistic UI, or state shared across multiple components in the same route.

---

## 8. State Boundaries

```
AuthStore (shared/auth)
  ↑ read by: all apps, RoleGuard, AppShell, UserMenu

UserStore (shared/auth)
  ↑ read by: all apps, ProfilePage, layout components

ThemeService (shared/ui)
  ↑ read by: all apps

AppStore (per-app)
  ↑ read by: AppShell, Sidebar, Topbar of that app

Feature stores / resources (per-feature)
  ↑ read by: components within that feature only
  ↑ never shared across features
```

Feature stores do not import other feature stores. Cross-feature communication happens only via URL (navigation) or through a shared global store (AppStore / UserStore).

---

## 9. Initialization Sequence

```
App bootstrap
  └── provideAuth()              # registers AuthStore, reads localStorage
      └── APP_INITIALIZER        # rehydrate tokens, refresh if expired
          └── authGuard resolves
              └── UserStore.load()   # fetch /users/me + /kyc/me
                  └── AppShell renders
                      └── Feature route loads
                          └── Feature resource/store initializes
```

`UserStore.load()` is called by a route resolver on the shell route, not in `APP_INITIALIZER`. This prevents blocking app paint for unauthenticated routes (login page loads instantly).

---

## 10. NgRx Signals Feature Compositions

Reusable store features (via `withX()` pattern) to reduce boilerplate:

| Feature | What it adds |
|---------|-------------|
| `withPagination()` | `page`, `limit`, `total` state + `nextPage()`, `prevPage()` |
| `withSearch()` | `query` signal + debounced search trigger |
| `withSort()` | `sortField`, `sortDir` + `setSort()` |
| `withLoading()` | `isLoading`, `error` state + `setLoading()`, `setError()` |
| `withSelectedItem()` | `selectedId` + `select()`, `deselect()` |

These are defined in `shared/utils` and composed into feature stores as needed. No feature store re-implements pagination or loading state from scratch.
