# OpenAPI Strategy

**Platform:** NestPG  
**Source spec:** `docs/frontend/openapi.json`  
**Backend spec (frozen):** `backend/openapi.rc1.json`  
**Endpoint count:** 69  
**Schema count:** 28 (25 DTOs + PaginationMeta + ApiResponse + ApiError)

---

## 1. Source of Truth

`docs/frontend/openapi.json` is the canonical spec for the frontend SDK. It is a manually maintained copy of the backend spec, enriched with three utility schemas absent from the raw backend export:

| Added schema | Purpose |
|-------------|---------|
| `PaginationMeta` | `{ page, limit, total }` — standard paginated response wrapper |
| `ApiResponse` | `{ success, meta, errors }` — envelope for all backend responses |
| `ApiError` | `{ code, message, field }` — structured error item |

**Sync rule:** When the backend publishes a new `openapi.rc*.json`, a frontend maintainer must:
1. Copy the new spec to `docs/frontend/openapi.json`
2. Re-add the three utility schemas (or automate via a merge script)
3. Re-run SDK generation
4. Review the generated diff for breaking changes before committing

The frontend must never consume `backend/openapi.rc1.json` directly — the backend directory is frozen and should not be imported by build scripts.

---

## 2. SDK Generation Approach

### Tool

`@openapitools/openapi-generator-cli` — the official OpenAPI Generator, Node.js wrapper.

### Generator

`typescript-angular` generator with Angular `HttpClient` integration.

### Output location

```
shared/api/src/generated/
├── api/                  # One service class per tag group
│   ├── auth.service.ts
│   ├── bookings.service.ts
│   ├── properties.service.ts
│   └── ...
├── model/                # TypeScript interfaces for all schemas
│   ├── booking.ts
│   ├── register-dto.ts
│   └── ...
├── api.module.ts         # NgModule (kept for compatibility)
└── configuration.ts      # ApiConfiguration — base URL, auth token
```

### Generation command

```bash
npx openapi-generator-cli generate \
  -i docs/frontend/openapi.json \
  -g typescript-angular \
  -o shared/api/src/generated \
  --additional-properties=ngVersion=20,providedIn=root,fileNaming=kebab-case,enumPropertyNaming=SCREAMING_SNAKE_CASE
```

This command should be added to `package.json` as `"generate:api"`. It must be run from the monorepo root.

**Generated code is never manually edited.** Any customization lives in the wrapper layer (see §3).

---

## 3. Client Structure

The generated SDK is wrapped in `shared/api/src/lib/` — never consumed directly by apps.

```
shared/api/
└── src/
    ├── generated/              # Auto-generated — do not edit
    │   └── ...
    ├── lib/
    │   ├── api.config.ts       # Provides ApiConfiguration (reads environment)
    │   ├── interceptors/
    │   │   ├── auth.interceptor.ts      # Attaches Bearer token from AuthStore
    │   │   ├── refresh.interceptor.ts   # 401 → refresh → retry
    │   │   └── error.interceptor.ts     # Maps ApiError to structured AppError
    │   └── providers.ts        # provideApi() — registers interceptors + config
    └── index.ts                # Public exports
```

### `provideApi()`

Called in each app's `app.config.ts`:

```typescript
// Architecture only — not implementation
export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([authInterceptor, refreshInterceptor, errorInterceptor])),
    provideApi({ baseUrl: environment.apiUrl }),
    // ...
  ]
};
```

Apps consume generated services directly by injecting them — e.g., `BookingsService`, `PropertiesService`. No hand-written API service classes.

---

## 4. API Versioning Strategy

The current API is `v1` (all paths prefixed `/api/v1/`). The base URL prefix is absorbed into the `ApiConfiguration.basePath`, not repeated in every call.

### Version bump strategy

When the backend introduces `v2` endpoints:

1. Backend ships `openapi.rc2.json` with both `v1` and `v2` paths.
2. Frontend copies to `docs/frontend/openapi.json` and regenerates.
3. New `v2` services appear in `generated/api/`. Old `v1` services remain until removed.
4. Apps migrate feature by feature — no big-bang cutover.

There is no versioned folder structure in the SDK output — the generator produces one flat set of services. Version coexistence (if ever needed) is handled by maintaining two separate generation configs pointed at different base paths.

---

## 5. Error Handling Strategy

### 5.1 ApiError schema

The backend returns errors in this envelope:

```json
{
  "success": false,
  "errors": [
    { "code": "VALIDATION_FAILED", "message": "Phone number is invalid", "field": "phone" }
  ]
}
```

### 5.2 Error interceptor

`error.interceptor.ts` catches all non-2xx responses and normalizes them to an `AppError` type before propagating:

```typescript
// Architecture only
interface AppError {
  status: number;          // HTTP status code
  code: string;            // backend error code or 'NETWORK_ERROR' / 'UNKNOWN'
  message: string;         // human-readable
  field?: string;          // if field-specific
  raw?: ApiError[];        // original array from backend
}
```

### 5.3 Error propagation

- **Field errors** (`field` present): the form layer reads `AppError.field` and applies `setErrors()` to the matching `AbstractControl`.
- **Global errors** (no `field`): displayed as a toast notification or inline alert at the top of the form.
- **401 Unauthorized**: refresh interceptor attempts a silent token refresh. If refresh fails, user is redirected to login.
- **403 Forbidden**: toast "You don't have permission to perform this action." No retry.
- **404 Not Found**: on list pages — empty state. On detail pages — "Not found" page.
- **500 / network errors**: toast with retry option where applicable.

### 5.4 Error code catalogue

| Code | HTTP | Meaning | Frontend action |
|------|------|---------|-----------------|
| `VALIDATION_FAILED` | 400 | Input validation | Field-level inline error |
| `UNAUTHORIZED` | 401 | Missing / expired token | Refresh, then re-login |
| `FORBIDDEN` | 403 | Insufficient role/permission | Toast + stay on page |
| `NOT_FOUND` | 404 | Resource missing | Not-found UI |
| `CONFLICT` | 409 | Duplicate / state conflict | Toast with specific message |
| `UNPROCESSABLE` | 422 | Business rule violation | Toast with message |
| `INTERNAL` | 500 | Server error | Toast + log |
| `NETWORK_ERROR` | — | No response | Toast + retry button |

---

## 6. Monetary Values

All monetary fields (e.g., `rentPaisa`, `pricePaisa`, `securityDepositPaisa`) are stored as **integers in paise** (1 INR = 100 paise).

The API layer never converts these values. Conversion happens at the presentation layer:

- **Display:** `shared/utils` exports a `PaisePipe` (`{{ amount | paise }}` → `₹1,200`)
- **Input:** form components accept rupees; the form's submit handler multiplies by 100 before calling the service

This keeps the API layer a pure pass-through and the conversion logic centralized.
