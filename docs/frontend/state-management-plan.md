# NestPG PMS — State Management Plan (Signals)

> No NgRx/Redux. State is **signals**, scoped as tightly as possible. This
> defines where each kind of state lives and the patterns to use, so screens
> stay consistent.

## 1. State tiers

| Tier | Lives in | Lifetime | Examples |
|------|----------|----------|----------|
| **Global app state** | root `@Injectable` stores (signals) | app session | auth tokens, current user/persona, theme |
| **Shared cache (light)** | root data-facade signals (opt-in) | app session, invalidatable | properties list, current property, nav badges |
| **Feature/page state** | the route component's signals | route lifetime | filters, pagination, selected row, drawer open |
| **Local UI state** | leaf component signals | component lifetime | hover, expanded, form dirty |

Default to the **lowest tier that works**. Promote to a root store only when ≥2 unrelated screens need the same live value.

## 2. Global stores (root singletons)

- **`TokenStore`** [exists] — `accessToken`/`refreshToken` signals + persistence.
- **`SessionStore`** [exists, extend] — `user`, `persona()` (3-value, for nav),
  `backendRole()` (11-value, for action gating), `isAuthenticated`, `can(roles)`.
- **`ThemeService`** [exists] — `mode` signal → `data-theme`.
- **`ToastService`** [add] — `messages` signal (queue); `show/error/success`.

Stores expose **readonly signals** (`.asReadonly()`) + explicit mutator methods.
Never expose a writable signal directly.

## 3. Read state pattern (server data → view)

```ts
// page component
private readonly sdk = inject(BookingSdk);
readonly filters = signal<BookingQuery>({ page: 1, limit: 20 });
private readonly reload$ = new Subject<void>();

private readonly result = toSignal(
  merge(toObservable(this.filters), this.reload$.pipe(map(() => this.filters()))).pipe(
    switchMap(q => this.sdk.list(q).pipe(catchError(() => of(EMPTY_PAGE)))),
  ),
  { initialValue: EMPTY_PAGE },
);
readonly rows = computed(() => this.result().data);
readonly meta = computed(() => this.result().meta);
readonly loading = signal(false);   // toggled around explicit writes
```

- **Reads:** `toSignal()` with `initialValue`; derive view slices with `computed`.
- **Re-query** by updating a source signal (`filters.set(...)`) or firing `reload$` — never by hand-patching arrays.
- **Detail-by-param:** `route.queryParamMap → switchMap(sdk.get) → toSignal` (reactive, fixes stale-snapshot bugs).

## 4. Write state pattern (mutations)

```ts
readonly saving = signal(false);
readonly error = signal<string|null>(null);

submit() {
  this.saving.set(true); this.error.set(null);
  this.sdk.create(body).subscribe({
    next: () => { this.saving.set(false); this.toast.success('Saved'); this.reload$.next(); },
    error: e => { this.saving.set(false); this.error.set(apiErrorMessage(e, 'Could not save')); },
  });
}
```
After a successful mutation: **refetch** (fire `reload$`) rather than optimistically mutating local state, unless latency demands optimism (then reconcile on response).

## 5. Derived state
Use `computed()` for anything derivable (filtered/sorted page, totals, badge counts, permission flags). **Avoid `effect()` for data** — reserve `effect()` for genuine side effects (persisting to localStorage, imperative DOM/overlay, analytics). An `effect` that calls `.set()` on another signal is a smell → make it `computed`.

## 6. Drawer / overlay state
Page-level signal: `readonly drawer = signal<{open:boolean; id?:string}>({open:false})`. The detail drawer component takes `id` as input and runs its own reactive fetch. One drawer open per page. Closing sets `{open:false}`; the `id` reactive fetch short-circuits when closed.

## 7. Forms
Reactive Forms hold their own state; mirror it into signals only when the template needs derived reactivity (e.g. live preview in the property wizard). Wizard step index is a `signal<number>`; collected files for deferred upload are a plain array + a `previews` signal.

## 8. Cross-screen invalidation
When a mutation in screen A should refresh screen B (e.g. creating a property → portfolio list), prefer **refetch on navigation** (screens reload their own data on entry) over a shared cache. Only introduce a shared invalidatable facade (e.g. `PropertiesFacade` with a `version` signal bumped on writes) if refetch-on-entry proves insufficient. Keep nav badge counts in a small root `BadgeStore` refreshed on a timer / after relevant mutations.

## 9. Persistence
Only `TokenStore` (tokens) and `ThemeService` (mode) persist to localStorage. Draft-heavy wizards (property/inventory) may persist a serializable draft to localStorage keyed by entity — **never persist `File` objects** (they don't serialize; previews are regenerated).

## 10. Anti-patterns (forbidden)
- Mutating an array signal in place (`arr().push()`) — always replace (`arr.update(l => [...l, x])`).
- Reading `route.snapshot` for values that change without navigation.
- `effect()` that writes signals (use `computed`).
- Storing server data in component fields instead of signals (breaks OnPush).
- Global store for state only one screen uses.
