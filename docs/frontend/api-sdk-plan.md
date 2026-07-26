# NestPG PMS — API SDK Layer Plan

> The typed boundary between Angular and the backend. One service per backend
> module under `core/data/`, all routed through `ApiService`. Screens call the
> SDK; they never touch `HttpClient` or string URLs directly.

## 1. Foundation (exists)

- **`ApiService`** (`core/api/api.service.ts`) — thin wrapper over `HttpClient`:
  `get/getPaged/post/put/delete`, prepends `environment.apiBase` (`/api/v1`),
  unwraps the `{success,data,meta,errors}` envelope to `data`. `getPaged`
  returns the full envelope (for pagination `meta`).
- **`TokenStore`** — `accessToken`/`refreshToken` signals + localStorage.
- **Interceptors** — `authInterceptor` (bearer on `/api/v1` only — so presigned
  S3 PUTs stay unsigned), `unauthorizedInterceptor` (401 → login + returnUrl).
- **`apiErrorMessage`** — envelope-aware error → string.

## 2. SDK service shape (contract)

Every domain service is `@Injectable({providedIn:'root'})`, returns typed
`Observable<DTO>`, and contains **zero UI/state**. Pattern:

```ts
@Injectable({ providedIn: 'root' })
export class BookingSdk {
  private readonly api = inject(ApiService);
  list(q: BookingQuery): Observable<Paged<Booking>> { return this.api.getPaged('/bookings', q); }
  get(id: string): Observable<Booking> { return this.api.get(`/bookings/${id}`); }
  create(body: CreateBooking): Observable<Booking> { return this.api.post('/bookings', body); }
  checkIn(id: string): Observable<Booking> { return this.api.post(`/bookings/${id}/check-in`); }
  // …one method per endpoint in api-catalog.md
}
```

DTO interfaces live next to each service (`core/data/<domain>.types.ts`) and
**mirror the backend exactly** (paise, enums, nullable). Where the backend
response needs view shaping (e.g. property `media` flattening, booking enrichment
fields), expose a separate `*View` mapper — keep raw DTO and view model distinct.

## 3. Service ↔ backend module map

| SDK service (`core/data/`) | Backend module | Endpoints covered |
|----------------------------|----------------|-------------------|
| `auth.service.ts` [exists] | Auth | register, send-otp, verify-otp, login, refresh, logout |
| `users.service.ts` [exists] | Users | me, profile, list, get, status, role |
| `kyc.service.ts` [add] | KYC | me, documents, review, reviewer reads |
| `properties.service.ts` [exists] | Properties | search, my, get, create, update, submit, verify, reject, delete, buildings |
| `inventory.service.ts` [exists] | Rooms/Beds/Floors | floors, rooms, beds CRUD, bed status/transfer, available |
| `reservations.service.ts` [add] | Reservations | create, list, get, cancel |
| `bookings.service.ts` [exists] | Bookings | list, get, create, check-in/out, cancel, notice, no-show |
| `corporate.service.ts` [add] | Corporate | accounts, agreements, assign-bed, cancel |
| `waitlist.service.ts` [add] | Waitlist | list, join, leave |
| `dashboard.service.ts` [exists] | Dashboard | occupancy, bookings, revenue |
| `upload.service.ts` [exists] | Media | presign, putToStorage(progress), confirm, presign-get, list, remove |
| `ops.service.ts` [exists] | Admin Ops | deployment/jobs/outbox/metrics/audit… |
| `search.service.ts` [exists] | (composite) | fan-out over properties/users/bookings for global search |

**Mock-backed (no backend — keep behind identical interface):**
`payments.service.ts`, `invoices.service.ts`, `tickets.service.ts`,
`communications.service.ts`, `analytics-history.service.ts`. These return typed
mocks today; switching to real endpoints later changes only the service body.
Mark each with a `// MOCK: no backend (see frontend-integration-guide §B)` banner.

## 4. Pagination, filtering, sorting

- **Pagination:** server-side. Lists call `getPaged`, store `meta` in a signal,
  pass `page`/`limit` as query params. `os-pagination` binds `meta`.
- **Filtering:** pass backend-supported query params only (see api-catalog per
  endpoint). Unsupported filters (e.g. user name search) are **client-side over
  the current page** and flagged in code as a backend gap.
- **Sorting:** backend exposes **no `sort` param** → `os-table` sort is
  client-side on the loaded page only; do not promise global sort. Add a
  `// TODO: server sort when API supports it` where used.

## 5. Reactive read pattern (query params → data)

For detail screens keyed by route/query param, use the reactive pipeline (this
fixed the CRM no-data bug): `route.queryParamMap → switchMap(sdk.get) →
toSignal`. Never read a snapshot once. Writes refresh by re-triggering the source
(a `reload$` Subject merged into the stream) rather than mutating local arrays.

## 6. Error handling contract

| Layer | Mechanism |
|-------|-----------|
| 401 | `unauthorizedInterceptor` → clear tokens → `/auth/login?returnUrl=` |
| 403 | component shows "not permitted" inline; nav already hides the action |
| 422/413/415 (upload) | `os-image-upload` surfaces field-level message |
| 429 / 5xx | `ToastService.error(...)` global toast |
| 400 validation | `errors[].field` → bind to form control; first message inline |
| Known domain codes | central `ERROR_COPY` map (`BED_ALREADY_OCCUPIED`, `KYC_NOT_REVIEWABLE`, `BOOKING_NOT_CANCELLABLE`, `NOT_RESERVATION_OWNER`, …) → friendly copy |
| List load failure | `catchError(() => of(emptyPage))` + inline empty state, keep shell |

`apiErrorMessage(err, fallback)` remains the single extraction helper; `ERROR_COPY` is consulted first by `code`, then it falls back to the server `message`, then `fallback`.

## 7. Auth & token lifecycle

- **Login/verify** → store `accessToken` (refresh is an httpOnly cookie set by
  the backend; FE does not manage it beyond calling `/auth/refresh`).
- **Bootstrap** (`APP_INITIALIZER`) → silent `POST /auth/refresh`; on success set
  token + decode JWT (`sub, phone, role`) into `SessionStore` (both `persona()`
  and `backendRole()`); on failure leave unauthenticated.
- **Refresh on 401** (optional enhancement): a single-flight refresh in the
  interceptor before redirecting; if refresh fails, redirect to login.
- **Logout** → `POST /auth/logout` + `TokenStore.clear()` + `SessionStore.clear()`.

## 8. Money & date helpers
- `InrPipe` (paise → ₹) for display; `os-money-input` converts rupee↔paise at the form edge. **Never** divide by 100 ad hoc in templates.
- Dates: send `YYYY-MM-DD`; a `toApiDate(Date)` helper centralizes formatting.

## 9. Testing seam
Because every screen depends only on an SDK interface, screens are unit-testable by providing a stub SDK. Mock-backed services double as fixtures for the unbuilt-backend features.
