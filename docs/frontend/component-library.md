# NestPG PMS — Shared Component Library (`os-*`)

> The presentational kit every screen composes from. Existing components are
> marked **[built]**; the rest are the agreed contracts to add. All are
> standalone, OnPush, signal-input driven, theme-token styled. No data fetching.

## Conventions
- Selector prefix `os-`. Inputs via `input()`/`input.required()`, two-way via `model()`, events via `output()`.
- Presentational only: emit intent (`(action)`), never call services or navigate imperatively.
- Styling via Tailwind + tokens (`bg-panel`, `text-content`, `border-border`, `text-muted`, `accent`, …). Dark mode is automatic via `data-theme`.
- Every interactive component is keyboard accessible and exposes `disabled`/`loading` where relevant.

## 1. Primitives [built]
| Component | Purpose | Key API |
|-----------|---------|---------|
| `os-icon` | Material Symbols glyph | `name`, `size` |
| `os-card` | surface container | content projection |
| `os-status-pill` | colored status chip | `status`, `tone?` |
| `os-insight-chip` | metric chip w/ delta | `label`, `value`, `trend?` |
| `os-metric-card` | KPI card | `label`, `value`, `icon`, `trend?` |
| `os-entity-avatar` | image/initials avatar | `name`, `src?`, `size` |
| `os-empty-state` | empty placeholder + CTA | `icon`, `title`, `message`, projection |
| `os-loading-state` | skeleton/spinner | `rows?`, `variant?` |
| `os-search-input` | debounced search box | `value` (model), `placeholder` |
| `os-page-header` | title/eyebrow/actions | `eyebrow`, `title`, `subtitle`, actions projection |

## 2. Overlays [built + extend]
| Component | Purpose | Key API |
|-----------|---------|---------|
| `os-modal` [built] | centered dialog | `open`, `title`, `subtitle`, `(closed)`, footer projection |
| `os-drawer-shell` [built] | right-side drawer frame | `open`, `title`, `(closed)`, content/footer projection |
| `os-confirm` [add] | confirm/destructive dialog | `open`, `title`, `message`, `tone`, `(confirm)`/`(cancel)` |
| `os-toast` / `ToastService` [add] | transient notifications | service `show(msg,tone)`, host in AppShell |

**Drawer architecture** (detail/peek pattern, used pervasively): `os-drawer-shell` is the frame; each feature supplies a `*-detail-drawer` smart component that takes an `id` (or entity) input, fetches via its data service, and renders tabs. Standard layout: header (avatar + title + status pill + close), scrollable body (tabbed via `@switch`), sticky footer actions. One open drawer at a time per page; drawer state is a page-level `signal<{open, id}>`.

## 3. Data display [add — core for tables-heavy app]
| Component | Purpose | Key API |
|-----------|---------|---------|
| `os-table` | generic data table | `columns: ColumnDef[]`, `rows`, `loading`, `trackBy`, `(rowClick)`, density |
| `os-table-toolbar` | search + filters + actions slot | projection + `(search)` |
| `os-pagination` | pager bound to `PaginationMeta` | `meta`, `(pageChange)` |
| `os-filter-bar` | chip/select filter row | `filters: FilterDef[]`, `(change)` |
| `os-tabs` | underline tab strip | `tabs`, `active` (model) |
| `os-kv-list` | label/value grid (drawer bodies) | `items: {label,value}[]` |
| `os-timeline` | activity/history feed | `items: {ts,title,meta}[]` |

**Table architecture:** `os-table` is presentational and declarative.
```
ColumnDef = {
  key: string;                 // path into row
  header: string;
  width?: string;
  align?: 'left'|'right'|'center';
  cell?: TemplateRef;          // custom cell (pill, avatar, money, actions)
  sortable?: boolean;          // emits (sortChange) — server-side sort when backend supports it
}
```
Rules: server-side pagination via `meta` (never client-slice large lists); custom cells via projected `<ng-template>`; row actions in a trailing column; empty/loading delegated to `os-empty-state`/`os-loading-state`. Because the **backend exposes no `sort` param today** (see audit), `sortable` columns are visual-only / client-sort small pages until the API adds sorting — documented per table.

## 4. Forms [add]
| Component | Purpose |
|-----------|---------|
| `os-field` | label + control + error wrapper (binds backend `field` errors) |
| `os-input` / `os-select` / `os-textarea` / `os-toggle` / `os-chip-select` | themed controls over Reactive Forms |
| `os-money-input` | rupee input ↔ paise model |
| `os-date-input` | `YYYY-MM-DD` model |
| `os-stepper` | multi-step wizard frame (property/inventory wizards) |

Forms use **Reactive Forms** (typed `FormGroup`). Validation mirrors backend DTO rules (phone `^[6-9]\d{9}$`, pincode 6 digits, required enums) so the user sees errors before submit; the backend remains authoritative. Server `errors[].field` maps onto the matching control.

## 5. Media [built + extend]
| Component | Purpose | Key API |
|-----------|---------|---------|
| `os-image-upload` [built] | presign→PUT→confirm uploader | `scope`, `entityType`, `entityId`, `role?`, `existing`, `(mediaChange)`/`(keysChange)` |
| `os-gallery` [add] | thumbnail grid + lightbox | `media: MediaItem[]` |
| `os-avatar-upload` [add] | single-image avatar variant | wraps `os-image-upload` (multiple=false, role=avatar) |
| `os-private-doc` [add] | KYC/doc viewer | `key` → calls `presign-get` → view/download |

**Upload architecture:** single source of truth is `UploadService` (`core/data/upload.service.ts`) + `os-image-upload`. No screen reimplements upload. Entity-bound surfaces use the component directly; create-before-id flows (wizards) collect `File[]` and call `UploadService` after the record exists. Private files (KYC, agreements) are never rendered by public URL — always via `os-private-doc` (60s presigned GET).

## 6. Charts [add]
| Component | Purpose | Key API |
|-----------|---------|---------|
| `os-bar-chart` [built] | bars (revenue/occupancy) | `data`, `labels`, `format?` |
| `os-donut` [built] | distribution (bed status) | `segments: {label,value,color}[]` |
| `os-line-chart` [add] | trends over time | `series`, `labels` |
| `os-sparkline` [add] | inline mini-trend | `points` |
| `os-stat-trend` [add] | KPI + sparkline combo | `value`, `delta`, `points` |

**Chart architecture:** keep charts **dependency-light and presentational** — existing `os-bar-chart`/`os-donut` are hand-rolled SVG, which is the preferred default (no heavy chart lib, theme-token colors, OnPush-friendly). Charts take already-shaped arrays; all aggregation/formatting happens in the feature/service, not the chart. Money series are paise → format axis labels via `InrPipe` logic passed as a `format` fn. If a richer lib is ever needed, isolate it behind these `os-*` wrappers so screens never import it directly.

## 7. Status & tone tokens
Central `STATUS_TONE` map (`shared/status.tokens.ts`) maps every backend enum value to a tone (`success|warning|danger|info|neutral`) so `os-status-pill` is consistent everywhere: e.g. Booking `CONFIRMED→info`, `CHECKED_IN→success`, `CANCELLED→danger`, `NO_SHOW→warning`; Bed `AVAILABLE→success`, `OCCUPIED→neutral`, `MAINTENANCE→warning`, `BLOCKED→danger`; KYC `APPROVED→success`, `REJECTED→danger`, `SUBMITTED→info`; Property `ACTIVE→success`, `DRAFT→neutral`, `PENDING_REVIEW→info`, `REJECTED→danger`.

## Build priority for components
1. (exists) primitives, modal, drawer-shell, metric/insight, charts, image-upload.
2. **`os-table` + `os-pagination` + `os-filter-bar`** — unblock every list screen.
3. `os-toast`/`ToastService`, `os-confirm` — unblock all mutations.
4. Form kit (`os-field`/`os-input`/…`os-money-input`) — unblock all create/edit.
5. `os-private-doc`, `os-gallery`, `os-avatar-upload` — KYC/media polish.
6. `os-line-chart`/`os-sparkline` — analytics polish.
