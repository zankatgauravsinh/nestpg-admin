# NestPG PMS — Frontend Architecture

> Architecture of record for `apps/web-admin`. Grounded in the existing code
> (Angular 22, standalone, zoneless, signals, Tailwind v4, Material M3) and the
> backend contract in `docs/backend/*`. This is the blueprint to build every
> remaining screen without re-architecting later. **No implementation here.**

## 1. Stack & non-negotiables

| Concern | Decision |
|---------|----------|
| Framework | Angular 22, **standalone components only** (no NgModules) |
| Change detection | **Zoneless** + `ChangeDetectionStrategy.OnPush` everywhere |
| Reactivity | **Signals** (`signal/computed/effect`), `toSignal`/`toObservable` at RxJS edges |
| Templates | Control flow `@if/@for/@switch/@let` (never `*ngIf`/`*ngFor`) |
| Styling | **Tailwind v4** utilities + design tokens in `theme.css` (`@theme inline`, `data-theme` dark variant). Component-scoped `styles:[...]` only for things Tailwind can't express |
| UI kit | Material M3 sparingly (overlays, CDK); house components are `os-*` |
| HTTP | `HttpClient` + functional interceptors; never `fetch` |
| Money | integer **paise** end-to-end; format only at the view via `InrPipe` |
| Dates | request `YYYY-MM-DD`; display via Angular `DatePipe` |
| Lazy loading | every route `loadComponent`; feature code never imported eagerly |

## 2. Folder structure (canonical)

```
src/app/
  core/                      # singletons, no UI
    api/        api.service.ts · api.types.ts · token.store.ts
    auth/       auth.service.ts · session.store.ts · auth.guard.ts · role.guard.ts
    data/       <domain>.service.ts  (SDK layer — one per backend module)
    http/       auth.interceptor.ts · unauthorized.interceptor.ts · api-error.ts
    models/     role.model.ts · nav-item.model.ts · *.model.ts (view models)
    navigation/ nav.config.ts
    theme/      theme.service.ts
  layout/                    # app chrome
    app-shell/ · sidebar/ · topbar/
  shared/                    # reusable, presentational
    components/  os-* (card, drawer-shell, modal, status-pill, metric-card, …)
    pipes/       inr.pipe.ts
    directives/  (future)
  features/                  # one folder per domain; lazy-loaded
    auth/ dashboard/ properties/ inventory/ residents/ bookings/
    finance/ operations/ analytics/ communication/ admin/ search/
  app.routes.ts · app.config.ts · app.component.ts
```

**Layering rule (enforced by convention):** `features → shared → core`. Features never import each other; cross-feature reuse goes through `shared` (presentational) or `core/data` (data). `core` never imports from `features`.

## 3. The three layers

1. **Core (singletons):** providedIn-root services — HTTP wrapper, SDK data services, auth/session stores, interceptors, theme, navigation config. No templates.
2. **Shared (presentational):** dumb `os-*` components driven by `input()`/`output()` and signals. No HTTP, no router navigation side-effects (links are fine).
3. **Features (smart):** route-level components that inject `core/data` services, hold page state in signals, and compose `shared` components. One feature folder per backend module.

## 4. App bootstrap (`app.config.ts`)

Providers (already partially in place — this is the target set):
- `provideZonelessChangeDetection()`
- `provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling(...))`
- `provideHttpClient(withInterceptors([authInterceptor, unauthorizedInterceptor]))`
- `provideAnimationsAsync()` (Material/CDK overlays)
- `APP_INITIALIZER` → `AuthService.bootstrap()` (silent `POST /auth/refresh` to restore session on reload before the first guarded route resolves)

## 5. Roles: backend (11) → frontend (3) mapping

The backend has 11 roles; the UI presents **three personas** for navigation/gating. This mapping is the single source of truth (`core/auth/role-map.ts`, to be formalized):

| FE persona | Backend roles mapped to it |
|------------|----------------------------|
| `SUPER_ADMIN` | SUPER_ADMIN, OPS_ADMIN, FINANCE_ADMIN |
| `OWNER` | PG_OWNER, CORP_HR |
| `MANAGER` | PROP_MANAGER, CARETAKER, HOUSEKEEPING, SECURITY |
| (no nav) | TENANT, GUEST — not admin-panel users |

> **Important:** route/nav gating uses the FE persona, but **the backend still enforces the real 11-role permissions** (see `permissions-matrix.md`). The FE persona is a UX convenience, never the security boundary. When an action's real backend role is narrower than the persona (e.g. only OPS_ADMIN can verify a property, not FINANCE_ADMIN), the component must additionally gate on the **raw backend role** carried in the JWT/session.

`SessionStore` must therefore expose both: `persona()` (3-value) for nav and `backendRole()` (11-value, from JWT `role`) for fine-grained action gating.

## 6. Data flow (request → view)

```
Component (signal state)
  → core/data/<Domain>Service.method()      (typed, returns Observable<DTO>)
    → ApiService.get/post/put/delete()      (adds /api/v1, unwraps {data})
      → HttpClient + authInterceptor (bearer) 
        → backend
  ← Observable<DTO>
  → toSignal(...) OR .subscribe()→signal.set()
  → template renders via @if/@for
```
Reads prefer `toSignal()` with `initialValue`. Writes use explicit `.subscribe()` with `loading`/`error` signals. List screens carry the `meta` pagination separately (use `ApiService.getPaged`).

## 7. Error handling strategy (summary; full in api-sdk-plan §6)

- **Transport/global:** `unauthorizedInterceptor` catches `401` → clears tokens → redirects to `/auth/login?returnUrl=...`. `429`/`5xx` surface a toast.
- **Per-request:** components map errors with `apiErrorMessage(err, fallback)` (already exists) into an `error` signal rendered inline. List loads use `catchError(() => of(empty))` to keep the shell rendered.
- **Envelope-aware:** backend errors are `{errors:[{code,message,field}]}`; `apiErrorMessage` extracts the first `message`. Known codes (e.g. `KYC_NOT_REVIEWABLE`, `BED_ALREADY_OCCUPIED`) map to friendly copy in a central `ERROR_COPY` table.
- **Never** show raw stack/JSON to users. Validation `field` errors bind to the offending form control.

## 8. Performance & quality rules
- Lazy `loadComponent` per route; shared chart libs lazy where heavy.
- `OnPush` + signals → no zone churn; avoid `effect()` for derived data (use `computed`).
- Batch reads (backend already avoids N+1); never fan out N requests in a loop in a template.
- Track-by always (`@for (x of list(); track x.id)`).
- Images: render `media.url` (public) or fetch a presigned GET (private); never hardcode CDN URLs.
- A11y: every `os-*` interactive control keyboard-operable; Material overlays for focus-trap.

## 9. What the architecture deliberately does NOT cover yet
Finance (Payments/Invoices), Communications, Tickets, and historical Analytics have **no backend** (`frontend-integration-guide.md` Part B). Their screens are built last, against typed mocks behind the same SDK interface, so swapping to real endpoints later is a one-file change. Architecture must keep these features isolated and mock-backed — see `build-sequence.md`.
