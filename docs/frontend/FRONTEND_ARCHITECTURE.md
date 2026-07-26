# Frontend Architecture

**Platform:** NestPG  
**Stack:** Angular 20 · Nx Monorepo · NgRx Signals · Angular Material · Tailwind CSS  
**Status:** Foundation Phase (F1)

---

## 1. Overview

The frontend is structured as a single Nx monorepo under `nestpg-platform/`. It hosts four portal applications and a suite of shared libraries. All applications share one codebase, one build system, and one design language.

```
nestpg-platform/
├── apps/
│   ├── admin/              # SUPER_ADMIN + OPS_ADMIN portal
│   ├── owner/              # OWNER portal
│   ├── manager/            # PROPERTY_MANAGER portal
│   └── tenant/             # TENANT portal (PWA, Capacitor-ready)
│
├── shared/
│   ├── api/                # OpenAPI-generated SDK + interceptors
│   ├── auth/               # Auth state, guards, tokens
│   ├── ui/                 # Design system components
│   ├── layouts/            # Shell, sidebar, header, page wrappers
│   ├── models/             # Canonical TypeScript interfaces
│   └── utils/              # Pure functions, pipes, validators
│
├── docs/
│   ├── frontend/           # Architecture, design system, routes, permissions
│   ├── backend/            # Frozen — do not edit
│   └── decisions/          # ADRs
│
└── backend/                # Frozen — do not edit
```

---

## 2. Applications

Each app is an independent Angular 20 application with its own routing, lazy-loaded feature modules, and app-level state.

### 2.1 Admin Portal (`apps/admin`)

| Attribute | Value |
|-----------|-------|
| Roles | SUPER_ADMIN, OPS_ADMIN |
| Primary concerns | User management, KYC review, property verification, system health, ops dashboard |
| Auth entry | `/admin/login` |
| Base path | `/admin` |
| PWA | No |

### 2.2 Owner Portal (`apps/owner`)

| Attribute | Value |
|-----------|-------|
| Roles | OWNER |
| Primary concerns | Property CRUD, building/floor/room/bed management, revenue dashboard |
| Auth entry | `/owner/login` |
| Base path | `/owner` |
| PWA | No |

### 2.3 Manager Portal (`apps/manager`)

| Attribute | Value |
|-----------|-------|
| Roles | PROPERTY_MANAGER |
| Primary concerns | Occupancy management, bookings, check-in/out, waitlist, bed transfers |
| Auth entry | `/manager/login` |
| Base path | `/manager` |
| PWA | No |

### 2.4 Tenant Portal (`apps/tenant`)

| Attribute | Value |
|-----------|-------|
| Roles | TENANT |
| Primary concerns | Browse beds, join waitlist, reservations, active booking, KYC self-service |
| Auth entry | `/login` |
| Base path | `/` |
| PWA | Yes — Capacitor mobile target (Phase F4+) |

---

## 3. Shared Libraries

Libraries are consumed via Nx path aliases (`@nestpg/api`, `@nestpg/auth`, etc.). No app imports directly from another app.

### 3.1 `shared/api` → `@nestpg/api`

Wraps the OpenAPI-generated SDK. Exports typed service classes, HTTP interceptors, and error-handling utilities. Never contains business logic. See [OPENAPI_STRATEGY.md](./OPENAPI_STRATEGY.md).

### 3.2 `shared/auth` → `@nestpg/auth`

Authentication and authorization primitives: token storage, refresh logic, role-based guards, permission directives. Exposes a single `AuthStore` (NgRx Signal Store). Never imports from feature libraries.

### 3.3 `shared/ui` → `@nestpg/ui`

Design system component library. Dumb, presentational only. No HTTP, no state stores. Every component is documented in [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md).

### 3.4 `shared/layouts` → `@nestpg/layouts`

Shell components: `AppShellComponent`, `SidebarComponent`, `TopbarComponent`, `PageWrapperComponent`. Imports `@nestpg/ui` and `@nestpg/auth` (for role-aware nav). Does not import feature libraries.

### 3.5 `shared/models` → `@nestpg/models`

Canonical TypeScript interfaces and enums derived from the OpenAPI spec. Single source of truth for domain types across all apps and libraries. Zero runtime dependencies.

### 3.6 `shared/utils` → `@nestpg/utils`

Pure functions, Angular pipes, RxJS operators, and form validators. No Angular services with state. No HTTP.

---

## 4. Dependency Rules

```
apps/*           → shared/*   ✅
shared/layouts   → shared/ui, shared/auth, shared/models  ✅
shared/auth      → shared/api, shared/models  ✅
shared/api       → shared/models  ✅
shared/ui        → shared/models, shared/utils  ✅
shared/models    → (nothing)  ✅

apps/*           → apps/*     ❌ never
shared/*         → apps/*     ❌ never
shared/models    → shared/api ❌ never (no circular)
```

Enforced via Nx project-graph lint rules (`@nx/enforce-module-boundaries`).

---

## 5. State Management

Architecture is **Signals-first**. NgRx Signal Store is the primary state container. RxJS is used only for async side effects (HTTP, WebSocket) and is always converted to signals at the store boundary.

| Scope | Technology | Location |
|-------|-----------|----------|
| Auth / session | NgRx Signal Store | `shared/auth` |
| Theme | Angular Signal | `shared/ui` or app root |
| Global user profile | NgRx Signal Store | `shared/auth` |
| Feature-local (e.g., booking form) | Component signals | App feature module |
| Server cache | Angular `resource` / `rxResource` | Feature service |

See [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) for full strategy.

---

## 6. Routing Strategy

Each app uses Angular 20 standalone routing with lazy-loaded route groups. Route guards come from `@nestpg/auth`.

```
Auth guard  →  Role guard  →  Feature route  →  Lazy-loaded component
```

Full route trees are documented in [ROUTES.md](./ROUTES.md).

---

## 7. API Integration

All API calls go through `@nestpg/api`, generated from `docs/frontend/openapi.json` (69 endpoints, OpenAPI 3.0). The SDK is regenerated on every backend release. No app ever calls `HttpClient` directly.

See [OPENAPI_STRATEGY.md](./OPENAPI_STRATEGY.md).

---

## 8. Styling

| Concern | Tool |
|---------|------|
| Component theming | Angular Material 3 custom theme |
| Utility classes | Tailwind CSS 4 |
| Typography | Inter (Google Fonts, self-hosted) |
| Icons | Lucide Angular |
| Charts | Apache ECharts (`ngx-echarts`) |
| Dark mode | CSS custom properties + `prefers-color-scheme` + manual toggle |

Design tokens are defined in [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md).

---

## 9. Build & Tooling

| Tool | Purpose |
|------|---------|
| Nx 20 | Monorepo orchestration, affected builds, task caching |
| Angular CLI (via Nx) | App scaffolding, schematics |
| ESBuild | Production bundling (via Angular 20 default) |
| Jest | Unit tests |
| Playwright | E2E tests |
| ESLint + `@nx/enforce-module-boundaries` | Lint + dependency rules |
| Prettier | Code formatting |
| `@openapitools/openapi-generator-cli` | SDK generation |

---

## 10. Folder Conventions

### App internals

```
apps/admin/
├── src/
│   ├── app/
│   │   ├── app.config.ts       # provideRouter, provideHttpClient, provideStore
│   │   ├── app.routes.ts       # Top-level lazy routes
│   │   └── features/
│   │       ├── users/
│   │       │   ├── users.routes.ts
│   │       │   ├── users.store.ts
│   │       │   ├── users-list/
│   │       │   └── user-detail/
│   │       └── ...
│   ├── assets/
│   └── environments/
└── project.json
```

### Shared library internals

```
shared/ui/
├── src/
│   ├── lib/
│   │   ├── button/
│   │   ├── badge/
│   │   ├── data-table/
│   │   └── ...
│   └── index.ts              # Public API — only export from here
└── project.json
```

All exports must go through `index.ts`. Internal implementation files are not part of the public API.

---

## 11. Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| Component files | `kebab-case.component.ts` | `user-detail.component.ts` |
| Store files | `kebab-case.store.ts` | `auth.store.ts` |
| Route files | `kebab-case.routes.ts` | `bookings.routes.ts` |
| Service files | `kebab-case.service.ts` | `booking-api.service.ts` |
| Model interfaces | `PascalCase` | `BookingResponse` |
| Enums | `SCREAMING_SNAKE_CASE` values | `BookingStatus.CHECKED_IN` |
| Signal Store features | `with` prefix | `withAuth()`, `withPagination()` |

---

## 12. Environment Configuration

```
apps/admin/src/environments/
├── environment.ts           # dev — API base: http://localhost:3000
└── environment.prod.ts      # prod — API base: https://api.nestpg.in
```

No secrets in environment files. All sensitive config via server-side injection or deployment environment variables.
