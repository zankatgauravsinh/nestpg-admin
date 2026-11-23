# ADM-D.0 — Admin Deposit Operations Console: audit + implementation specification

Read-only audit of the Angular Admin app and the backend deposit/dispute contract, and the
specification for the console that lets operators act on deposit disputes. Every contract below was
verified in code on 2026-10-11 (backend working tree on `release/1.0`, uncommitted; see §1). Nothing
was implemented, run, or changed besides this file.

Conventions: **SUPER** = SUPER_ADMIN, **OPS** = OPS_ADMIN, **FINANCE** = FINANCE_ADMIN.
`OPERATIONS` = `DEPOSIT_DISPUTE_OPERATIONS`, `RESOLUTION` = `DEPOSIT_DISPUTE_RESOLUTION`.

---

## 1. Current repository state

| Repo | Branch | State |
|---|---|---|
| `nestpg-backend` | `release/1.0` | **106 uncommitted paths** (51 modified, 55 untracked) since commit `0cf8124` (2026-09-28). Includes every M-C.4 source file and migrations **V3_037–V3_045 (untracked)**. |
| `nestpg-admin` | `release/1.0` | Clean at `f1540d8` (A1–A4). |
| `mobile` | — | **Not under version control** (no `.git`, no parent repo). |

- Migrations: 45 files, 45 rows in `migrations`, latest `V3045DepositDisputeEffectExecution1748000000450`, correctly ordered.
- **Operational prerequisite (not part of this milestone):** commit the backend so the admin console is built against a committed contract; put `mobile` under version control.
- Relevant docs: `mobile/docs/MC4_0_DEPOSIT_DISPUTE_FOUNDATION.md` (§22–§27), `MC4_4_DEPOSIT_DISPUTE_PARTY_UX.md`, `M-C.4.5_DEPOSIT_DISPUTE_FINAL_AUDIT.md`, `ADMIN_FUNCTIONALITY_AUDIT.md`, `A1`–`A4` audits.

### 1.1 Admin app as it stands (verified)

| Area | Finding | Consequence for ADM-D |
|---|---|---|
| Stack | Angular 22 standalone + signals, OnPush, Tailwind, Material Symbols icons; tests on `@angular/build:unit-test` (Vitest) with `HttpTestingController`; **no Storybook**, **no `lint` target**, no CI. | Follow the same; no Storybook deliverable. |
| Auth (A1) | `/admin/auth/login|refresh|logout`; `unauthorizedInterceptor` refreshes on 401 then ends the session. | Reuse unchanged. |
| Capabilities (A3) | `SessionStore.capabilities` = the list from `GET /users/me`, cast **without filtering**; `hasCapability`, `capabilityGuard` (route `data.capabilities`), nav items gated by `capabilities`. | The two dispute capabilities already reach the client at runtime. The TypeScript `Capability` union (`core/models/capability.model.ts`) **lacks** `DEPOSIT_DISPUTE_OPERATIONS` and `DEPOSIT_DISPUTE_RESOLUTION`; ADM-D.1 must add these two backend names (vocabulary extension per A3's own rule, not an architecture change). |
| API layer | `ApiService.get/getPaged/post`; envelope unwrap. | Reuse. |
| Errors | `apiErrorMessage()` reads only `errors[0].message` and humanizes a small map; it never reads `code` or **`details`**. 14 data-service sites still `catchError(() => of([]))`. | ADM-D.1 needs a small new helper that returns `{status, code, detail, details}` (see §10). The new data service must **not** swallow errors. |
| Patterns | A2 `property-review.component.ts`: distinct loading / error / empty states, inline two-step confirmations (`Confirm …` / `Cancel`), reason field with counter, `data-testid`s, pages computed from `meta.total`. | Template for queue and detail. |
| Shared UI | `os-drawer`, `os-modal` (no `role="dialog"`/focus handling found), `os-status-pill`, `os-page-header`, `os-empty-state`, `os-loading-state`. | Use inline confirmations for financial actions (accessible, matches A2); do not depend on `os-modal` semantics. |
| Navigation | `NAV_CONFIG` sections incl. **Finance** (Overview, Payments, Invoices, Collections). | Add one Finance item (§9 Q4). |
| Bookings | `/bookings` list with a booking drawer; data via `GET /bookings`. | Add a "Deposit history" link in the drawer (read-only). |

---

## 2. Verified backend endpoint matrix

All routes are under `/api/v1`, Bearer JWT (`JwtAuthGuard`), envelope `{success, data, meta, errors}`.
Errors: `errors[0] = {code, message, field?, details?}` from `AllExceptionsFilter`. A bare
`new XException('CODE')` yields `code` = reason phrase ("Bad Request", "Forbidden", …) and
`message` = `CODE`; a structured `{error, message, details}` yields `code` = `message` = `CODE` plus
`details`. **The domain code is always in `message`.** Some codes carry a suffix after `:`
(e.g. `DISPUTE_RESOLUTION_INVALID:EFFECT_REQUIRES_UPHELD`).

| # | Method + path | Roles gate (controller) | Service gate | Request | Response `data` | Money side effect | Idempotency / concurrency | Direct UI use |
|---|---|---|---|---|---|---|---|---|
| A1 | `GET /admin/deposit-disputes` | OPERATIONAL_READ | — | query `status?` (OPEN/RESOLVED/WITHDRAWN), `targetType?`, `propertyId?` (uuid), `bookingId?` (uuid), `page?` ≥1, `limit?` 1–100 (default 20) | array of dispute rows (§5.2); `meta {page, limit, total}` (no `totalPages`) | none | read; ordered **OPEN first**, then `created_at DESC, id DESC` | Yes |
| A2 | `GET /admin/deposit-disputes/:id` | OPERATIONAL_READ | — | uuid | dispute row + `supersededByDisputeId` + `targetFacts` + full `events` (§6) | none | read | Yes |
| B1 | `POST /admin/deposit-disputes` | OPERATIONS | OPERATIONS | `{bookingId, targetType, offlineEventId?, settlementId?, deductionId?, refundId?, reason (1–1000), supersedesDisputeId?}` — exactly the ids the type requires | party-style view (`DepositDisputeView`) of the new case, `openedSide: ADMIN` | **Starts a refund-execution freeze** on the booking (any OPEN case); OFFLINE_COLLECTION also freezes settlement finalize | lock B→target; one OPEN case per target family (partial uniques); lifetime cap **2 per side per family, incl. ADMIN**; not idempotent (retry → `DISPUTE_ALREADY_OPEN` with `details.disputeId`) | Yes (with confirmation) |
| B2 | `POST /admin/deposit-disputes/:id/notes` | OPERATIONS | OPERATIONS | `{note (1–1000)}` | `{disputeId, eventId}` | none | B→D lock; OPEN only; **not idempotent** (a retry appends a second note) | Yes |
| B3 | `POST /admin/deposit-disputes/:id/resolve` | RESOLUTION | RESOLUTION | `{finding, effect, resolutionReason (1–1000), resolutionVersion?}` — `resolutionVersion` required and must equal `dispute-resolution-v1` for a non-NONE effect | resolution view: `{id, bookingId, targetType, status, finding, effect, effectExecuted, effectExecutedAt, effectExecutionRef, resolutionReason, resolutionVersion, resolvedBy, resolvedAt, supersedesDisputeId}` | **None.** Lifts the freeze held by this case. NONE is marked executed at resolution (`effectExecuted: true`). | B→D→target locks; status-guarded `OPEN→RESOLVED` (a retry after success → 409 `DISPUTE_NOT_OPEN`, `details.status = RESOLVED`); target re-validated, incl. effect preconditions (§7.2) | Yes (with confirmation) |
| B4 | `POST /admin/deposit-disputes/:id/execute-effect` | RESOLUTION | RESOLUTION | **empty body** (`ExecuteDepositDisputeEffectDto {}`; any key → 400 "property … should not exist") | resolution view (as B3) with `effectExecuted: true`, `effectExecutionRef` | **Yes.** OFFLINE_REFUND_CONFIRMED → settlement `PENDING→REFUNDED` (existing seam); SETTLEMENT_SUPERSEDED → a new linked settlement (original untouched); no gateway call | one transaction, B→D→S; **idempotent** (executed → returns the recorded result); refused while **another** case on the booking is OPEN (`DISPUTE_EFFECT_BLOCKED_BY_OPEN_CASE`); refusals with a `DISPUTE_EFFECT_*` code append an `EFFECT_EXECUTION_FAILED` event | Yes (with confirmation) |
| B5 | `POST /admin/deposit-disputes/:id/withdraw` | OPERATIONS | OPERATIONS; case must be **ADMIN-opened**; caller is the opener **or** holds RESOLUTION | none | party-style view, `status: WITHDRAWN` | Lifts the freeze held by this case | B→D; OPEN only (else 400 `DISPUTE_NOT_OPEN`) | Yes (with confirmation) |
| C1 | `GET /admin/bookings/:id/deposit-history` | OPERATIONAL_READ | — | uuid | `{booking, deposit, offlineEvents[], settlements[], refunds[], bookingHistory[], disputes[]}` (§6.3); reads soft-deleted bookings | none | read | Yes |
| D1 | `POST /payments/ops/reconcile-deposit-refunds` | JwtAuthGuard only | `FINANCIAL_OPERATIONS` (SUPER, OPS, FINANCE) → else 403 "Only finance/admin can trigger refund reconciliation." | query `limit?` (1–1000) | `{scanned, issued, completed, failed, frozen, exceptions: [{settlementId, bookingId, code}]}` | **Yes — it runs the refund worker** (same engine as the `*/5 * * * *` cron) and can issue gateway refunds | per-settlement transactions; reconcile-before-issue | **Not as a read.** See §8. |
| D2 | `GET /bookings/:id` | JwtAuthGuard; admins via OPERATIONAL_READ in service | — | uuid | enriched booking incl. `tenantName`, `propertyName`, `securityDepositSettlement`, `depositRefund {rail, state, amountPaisa, completedAt}` | none | read; **404 for soft-deleted bookings** | Yes (context + derived refund state) |

Not available to admins: `GET /bookings/:id/deposit/disputes[/eligibility]` and the party write routes
(party side required → 403 `ACCESS_DENIED`). There is **no admin eligibility preview**; an admin open is
validated only on submit. There is **no endpoint listing refund exceptions** (§8).

---

## 3. Route-to-capability matrix (verified)

Backend `ROLE_CAPABILITIES` (`libs/users/src/enums/capabilities.ts`):
SUPER → OPERATIONAL_READ, OPERATIONS, RESOLUTION, FINANCIAL_OPERATIONS, USER_OPERATIONS, …;
OPS → OPERATIONAL_READ, OPERATIONS, FINANCIAL_OPERATIONS, USER_OPERATIONS (no RESOLUTION);
FINANCE → OPERATIONAL_READ, **OPERATIONS**, RESOLUTION, FINANCIAL_OPERATIONS (no USER_OPERATIONS).

| Action | Route | SUPER | OPS | FINANCE | Owner / Manager / Resident |
|---|---|---|---|---|---|
| Queue / detail | A1, A2 | ✓ | ✓ | ✓ | 403 |
| Booking deposit history | C1 | ✓ | ✓ | ✓ | 403 |
| Booking context + derived refund state | D2 | ✓ | ✓ | ✓ | own scope only |
| Add internal note (OPEN only) | B2 | ✓ | ✓ | ✓ | 403 |
| Open an ADMIN case | B1 | ✓ | ✓ | ✓ | 403 |
| Withdraw an ADMIN case (OPEN only) | B5 | ✓ any admin case | **own cases only** | ✓ any admin case | 403 |
| Withdraw a party case | B5 | ✗ `DISPUTE_NOT_ADMIN_OPENED` | ✗ | ✗ | (party route) |
| Withdraw a RESOLVED case | B5 | ✗ `DISPUTE_NOT_OPEN` | ✗ | ✗ | — |
| Resolve | B3 | ✓ | ✗ 403 | ✓ | 403 |
| Execute effect | B4 | ✓ | ✗ 403 | ✓ | 403 |
| Execute while another case is OPEN | B4 | ✗ 409 `DISPUTE_EFFECT_BLOCKED_BY_OPEN_CASE` | — | ✗ 409 | — |
| Run refund reconciliation | D1 | ✓ | ✓ | ✓ | 403 |
| Resolve actor ids to names | `GET /users/:id` (USER_OPERATIONS) | ✓ | ✓ | **✗** | — |

Notes: SUPER and FINANCE have identical dispute powers; no SUPER override exists. The earlier
assumption that FINANCE lacks OPERATIONS is wrong: FINANCE holds both. (The backend docstrings on the
two capabilities still say "No route uses this yet" — stale comments, deferred.)

---

## 4. Navigation and routes (proposed)

| Route | Component | Guard data |
|---|---|---|
| `/finance/deposit-disputes` | queue | `capabilities: ['OPERATIONAL_READ']` |
| `/finance/deposit-disputes/:id` | detail | `capabilities: ['OPERATIONAL_READ']` |
| `/finance/deposits/:bookingId` | booking deposit history | `capabilities: ['OPERATIONAL_READ']` |

- Nav: one item in the existing **Finance** section, "Deposit disputes", icon `gavel`, `capabilities: ['OPERATIONAL_READ']`.
- Entry points: nav item; booking drawer link "Deposit history" → `/finance/deposits/:bookingId`; deep links `?bookingId=` / `?propertyId=` on the queue.
- Action controls are gated per §3 with `session.hasCapability(...)` (presentation only; the server decides).

---

## 5. Queue specification

### 5.1 Filters (backend-supported only)
- **Status** segmented control: Open (default) · Resolved · Withdrawn · All (omits `status`).
- **Target type** select: all four types.
- **Booking / property**: accepted from route query params (`bookingId`, `propertyId`) and shown as removable chips. **No free-text search and no property picker in v1** — the backend has neither a text search nor names in the list projection.
- Pagination: `page`/`limit=20`; pages = `ceil(meta.total / 20)` (A2 convention).
- Sorting: server order only (OPEN first, newest first). No client re-sort.

### 5.2 Row (fields from the list projection)
`bookingNumber` · `bookingStatus` · status pill (`status`) · target type label · opened by **side**
(`openedSide`: Resident / Property / NestPG admin) · `createdAt` · outcome when RESOLVED (`finding` +
`effect` + **effect state**: "Applied" when `effectExecuted`, "Recorded — not applied" when false).
A row opens the detail.

Not shown (not in projection): property name, resident name, owner name, per-row freeze state.
A static help line states the backend rule: "An open case pauses deposit refund execution for its
booking." (documentation, not computed).

### 5.3 States
Loading · error ("could not be loaded" + retry; never rendered as empty) · empty per filter
("No open deposit disputes") · manual **Refresh** button (no polling).

---

## 6. Detail specification

Data: A2 (detail) + C1 (deposit history for `bookingId`) + D2 (booking context; on 404, show
"Booking not available (it may be deleted)" and continue — the dispute detail still renders).

### 6.1 Sections
1. **Identity + status:** status pill, target type, `createdAt`, opened side, `openedBy` (id; see 6.4), `bookingNumber`, `bookingStatus`.
2. **Booking context (D2):** `tenantName`, `propertyName`, room/bed labels, booking status; link to deposit history.
3. **Target facts (`targetFacts`):** by type —
   - offline event: type, status, amount, method, event date, recorded/confirmed/rejected/withdrawn by + at, rejection reason, settlement id (**no `note`** — not projected);
   - settlement: status, deposit / total deductions / refundable, settled by/at, `automatic`, refund exception code/at (currently always empty, §8), supersession links, deduction lines (amount, reason, category, created by/at);
   - deduction: the disputed line highlighted;
   - refund: number, status, amount, gateway payment id, gateway refund id, processed at, transaction log (`id, kind, gatewayRef, createdAt` only).
4. **Statements:** the opener's `reason` and every `COUNTER_STATEMENT` (side + text + time).
5. **Internal notes:** `NOTE_ADDED` events (admin only), newest last, with the add-note form (OPEN only).
6. **Full history timeline:** every event — OPENED, COUNTER_STATEMENT, NOTE_ADDED, FREEZE_BLOCKED, WITHDRAWN, RESOLVED, EFFECT_EXECUTED, EFFECT_EXECUTION_FAILED — with actor side, actor id (null for SYSTEM), time, and **only these metadata keys**: FREEZE_BLOCKED `chokepoint`; RESOLVED `finding`, `effect`; EFFECT_EXECUTED `effect`, `executionRef`, `refundablePaisa`, `newStatus`, `keptDeductions`, `removedDeductions`, `supersededSettlementId`, `newSettlementId`; EFFECT_EXECUTION_FAILED `code`; OPENED `supersedesDisputeId`. Unknown keys are not rendered.
7. **Resolution:** finding, effect, resolution reason, version, resolved by/at.
8. **Effect execution:** `effectExecuted` (null while OPEN/WITHDRAWN), `effectExecutedAt`, `effectExecutionRef` (link to the settlement in deposit history), last `EFFECT_EXECUTION_FAILED` code if any.
9. **Relationships:** `supersedesDisputeId` / `supersededByDisputeId` links; superseding settlement links from target facts.
10. **Actions panel** (§6.2).

### 6.2 Actions (presentation gating; server re-checks)
| Action | Shown when |
|---|---|
| Add note | `status = OPEN` and OPERATIONS |
| Withdraw | `status = OPEN`, `openedSide = ADMIN`, and (`openedBy = me` or RESOLUTION) |
| Resolve | `status = OPEN` and RESOLUTION |
| Apply outcome (execute) | `status = RESOLVED`, `effectExecuted = false`, RESOLUTION |
| Open reconsideration | `status = RESOLVED`, no `supersededByDisputeId`, `supersedesDisputeId` null, OPERATIONS (pre-fills the open form with the same target + `supersedesDisputeId`) |

### 6.3 Booking deposit history page (C1)
Read-only sections: booking (incl. cancellation reason), deposit, offline events (no note), settlements
chain (root → superseders, marking the live tail: the one with no superseder), refunds with transaction
log, booking history (render `fromStatus → toStatus`, `changedBy`, `reason`, `createdAt`; **not** the
raw `metadata` object), disputes (links). Plus the booking's derived `depositRefund` from D2 (rail, state,
amount) — this is where `ON_HOLD` is visible today. An "Open admin case" action (OPERATIONS) lets the
operator choose a target from this page's own rows (offline event / settlement / deduction / refund ids);
the server validates eligibility.

### 6.4 Names
`GET /users/:id` is unavailable to FINANCE, so v1 shows actor **side + short id** everywhere and the
resident/property names from D2. Name resolution for actors is deferred.

---

## 7. Resolution and effect workflow

### 7.1 Valid combinations (backend `validateDepositDisputeDecision` + `DEPOSIT_DISPUTE_ALLOWED_EFFECTS`)
| Target type | NONE | OFFLINE_REFUND_CONFIRMED | SETTLEMENT_SUPERSEDED |
|---|---|---|---|
| OFFLINE_COLLECTION | any finding | ✗ `EFFECT_NOT_ALLOWED_FOR_TARGET` | UPHELD only, but **never derivable** for this type → 409 `DISPUTE_EFFECT_NOT_DERIVABLE` |
| OFFLINE_REFUND | any finding | ✗ | ✗ |
| SETTLEMENT | any finding | UPHELD only; settlement PENDING; deposit collected offline | UPHELD only; derivable only for a **deduction-line** case or a **TENANT-opened whole** case; settlement not REFUNDED; no PROCESSING/SUCCESS deposit refund; no WAITING offline refund |
| ONLINE_REFUND | any finding | ✗ | ✗ |

Non-NONE + non-UPHELD → `EFFECT_REQUIRES_UPHELD`. Non-NONE needs `resolutionVersion = dispute-resolution-v1`.

### 7.2 Resolve form
- Finding: radio UPHELD / DISMISSED / INCONCLUSIVE.
- Effect: radio limited to the target type's allowed effects (table 7.1, mirrored from the backend constant for presentation; the server remains authoritative). Non-NONE disabled unless UPHELD. For SETTLEMENT_SUPERSEDED, an informational line states the backend derivation rule ("removes the disputed line" for a line case; "removes every deduction" for a resident whole-settlement case; otherwise "not available"). **No amounts are computed in the client.**
- Resolution reason: required, trimmed, 1–1000 chars, counter. **This text is shown to both parties** (party projection) — the label says so.
- Acknowledgement (non-NONE only): checkbox "I have checked the target facts and approve this outcome" → sends `resolutionVersion: 'dispute-resolution-v1'` (client constant, the acknowledgement-copy version).
- Confirm step (inline, A2 style) summarising finding + effect + "This records the decision only. No money moves until the outcome is applied."
- After success: refetch A2 + C1. If effect = NONE → "Resolved. No change to the deposit." If non-NONE → banner "Outcome recorded — not yet applied" with the Apply action.

### 7.3 Apply outcome (execute)
- Separate action, separate confirmation; **empty request body**.
- Confirmation text by effect, from facts already on screen (no computed figures):
  OFFLINE_REFUND_CONFIRMED → "Marks this settlement as refunded (returned offline). No gateway refund is made."
  SETTLEMENT_SUPERSEDED → "Creates a revised settlement under the rule above. The current settlement is kept unchanged as history. Any refund then follows the usual rail."
- On success: refetch A2 + C1; show `effectExecutionRef` linked to the new/flipped settlement in deposit history.
- Never auto-retry. A repeat click on an executed case returns the recorded result (safe).
- There is **no generic refund button** and no amount input anywhere.

---

## 8. Freeze and conflict handling

Authoritative rule (`deposit-dispute-freeze.ts`): any OPEN case of any type on a booking freezes
refund execution (worker, offline record, offline confirm); an OPEN OFFLINE_COLLECTION case also freezes
settlement finalize. Resolution/withdrawal lifts it by status. Execution (B4) consults the same predicate
and refuses while **another** case is OPEN.

| Situation | Backend answer | UI behaviour |
|---|---|---|
| Blocked by another open case | 409 `DISPUTE_EFFECT_BLOCKED_BY_OPEN_CASE`, `details {disputeId, blockingDisputeId, blockingTargetType}` | "This outcome can't be applied while another dispute on this booking is open." + link to `blockingDisputeId`; refetch detail (a new EFFECT_EXECUTION_FAILED row appears); no retry loop; no auto-action on the other case |
| Stale queue (case changed elsewhere) | detail shows current state | always refetch detail on open; actions use detail state, never the row |
| Already resolved | 409 `DISPUTE_NOT_OPEN`, `details.status` | "Already resolved by someone else." refetch |
| Already withdrawn | 400/409 `DISPUTE_NOT_OPEN` | "This case was withdrawn." refetch |
| Target changed / gone | 409 `DISPUTE_TARGET_CHANGED` / `DISPUTE_TARGET_GONE` | "The disputed item changed since the case was opened (e.g. the settlement was revised)." refetch; operator decides (resolve NONE, or open a new case) |
| Effect already executed | 200 with recorded result, or 409 `DISPUTE_EFFECT_ALREADY_EXECUTED` | treat as success after refetch |
| Another case opened concurrently | at resolve: none (resolve does not check siblings); at execute: BLOCKED (row 1) | as row 1 |
| Network failure after a mutation | unknown outcome | never retry automatically; refetch A2 and compare: resolve → `status`; execute → `effectExecuted`; withdraw → `status`; note → presence of the text in events; open → query A1 by `bookingId` and `status=OPEN`. Offer the action again only if the state shows it did not happen. |

---

## 9. Refund exception audit (verified)

| Question | Finding |
|---|---|
| Persisted? | **No.** `deposit_settlements.refund_exception_code/at` exist (V3_044) but **no code writes them** (grep: only the admin read selects them). |
| Returned in an operation response? | Yes — `exceptions[]` of D1 and of the cron pass; codes `DEPOSIT_PAYMENT_UNRESOLVED`, `DEPOSIT_PAYMENT_AMBIGUOUS`, `DEPOSIT_GATEWAY_RECONCILE_INCOMPLETE`, `DEPOSIT_GATEWAY_REFUND_UNMATCHED`, `DEPOSIT_PAYMENT_REFUND_SHORTFALL`. Gateway unavailable/uncertain/refused are counted in `failed` with no detail. |
| Logs? | Yes — `M-C.3.4 deposit refund ON HOLD: settlement=… booking=… reason=…` (error level), every 5 minutes while it persists. |
| Read-time visibility? | Partial — `GET /bookings/:id` derives `depositRefund.state = ON_HOLD` when the deposit payment cannot be attributed (none or several matching) or the payment lacks headroom. Gateway-dependent causes (`RECONCILE_INCOMPLETE`, `REFUND_UNMATCHED`) are **not** derivable on read. No list endpoint filters by refund state. |
| Recoverable? | Yes, by reconciliation (cron or D1) once the cause is fixed; unresolved/ambiguous payments are open decision **Q-1** (no product path today). |
| Safe to expose to admins? | Codes and ids — yes. D1 itself is a money-moving action. |

**Option A (recommended for ADM-D.1):** no persistent queue. Per-booking visibility through D2's derived
`depositRefund` on the deposit history page and dispute detail ("On hold — needs support"), with the
help text "Refunds are retried automatically every 5 minutes; gateway-side holds are visible only in
operational logs." D1 is **not** exposed (the cron already runs it every 5 minutes; a UI button would add
a money-moving action for OPS/FINANCE/SUPER with little benefit). Trade-off: gateway-side holds stay
invisible in the UI; no cross-booking list.

**Option B (separate milestone ADM-D.2, needs approval):** in `refundOneDepositSettlement`, inside the
existing settlement-locked transaction, write `refund_exception_code/at` on an `EXCEPTION` outcome and
clear them on any progress (issued / adopted / completed / in-flight / frozen); add one read-only admin
list endpoint over the live settlements with a non-null code (OPERATIONAL_READ); add a queue screen.
Safety: non-money columns only, written under the lock the worker already holds, no change to what is
issued; the M-C.4.3/4.5 byte-identity tests snapshot the settlement immediately before execution, so they
are unaffected, but the E2E column invariants (mc3-4 online) must be updated; the endpoint and its
response shape are a new contract and must be specified before implementation.

---

## 10. Product decisions and recommendations

| # | Question | Existing behaviour | Options | Recommendation |
|---|---|---|---|---|
| Q1 | Persistent refund-exception visibility in the first release? | Not persisted; response/log only; partial read-time `ON_HOLD` | A: per-booking only (no backend). B: worker writer + list endpoint + screen | **A for ADM-D.1; B as ADM-D.2** after approval |
| Q2 | Resolve and execute as one or two actions? | Two backend calls; NONE needs no execute | one combined flow vs. two actions | **Two separate actions**, each with its own confirmation; the detail shows "recorded — not applied" in between |
| Q3 | Four-eyes resolution? | **Not enforced.** One SUPER/FINANCE admin can resolve and execute; both actors are recorded (`resolved_by`, EFFECT_EXECUTED `actor_id`) | (a) accept single-actor for v1; (b) backend rule: refuse execute when `actor = resolved_by` (new code) or a separate approval verb | **(a) for ADM-D.1**, decision recorded; (b) is a backend milestone. Hiding the button for the resolver would not be enforcement and is not proposed |
| Q4 | Navigation | Finance section exists | Finance vs Operations | **Finance → "Deposit disputes"** (money outcome; FINANCE resolves); OPS sees it via OPERATIONAL_READ |
| Q5 | Withdrawal | Admin route: ADMIN-opened + OPEN + (opener or RESOLUTION) | — | As backend (§3). Party cases are never withdrawn by admins; they are resolved. No reason field exists on withdraw; recommend (not enforce) a note first |
| Q6 | Auditability | `deposit_dispute_events` (append-only, actor id + side + metadata); `resolved_by/at`; superseding settlement `created_by/settled_by` | — | Confirmation for open, withdraw, resolve, execute; reason required by API for open and resolve; note text is its own record. No new audit table |
| Q7 | Reconsideration from the console | B1 accepts `supersedesDisputeId` | include / defer | **Include** (same form, no backend work) |

---

## 11. Error-code-to-UI-copy matrix

Retry = safe to resubmit the same request. Refresh = refetch detail/queue. Op = operator intervention.

| Code (in `message`) | Route(s) | HTTP | Meaning | Admin copy | Retry | Refresh | Op |
|---|---|---|---|---|---|---|---|
| (401) | all | 401 | session expired | handled by interceptor (refresh → login) | — | — | — |
| `Forbidden resource` | all (RolesGuard) | 403 | role lacks the route capability | "Your role can't do this." | No | No | No |
| `ACCESS_DENIED` | B1–B5 (service) | 403 | capability check in service | "Your role can't do this." | No | No | No |
| `DISPUTE_NOT_OPENER` | B5 | 403 | OPS withdrawing another admin's case | "Only the admin who opened this case, or a finance/super admin, can withdraw it." | No | No | Yes |
| `DISPUTE_NOT_ADMIN_OPENED` | B5 | 403 | party case | "Cases raised by a resident or property can't be withdrawn here. Resolve the case instead." | No | No | Yes |
| `DEPOSIT_DISPUTE_NOT_FOUND` | A2, B2–B5 | 404 | unknown id | "This dispute doesn't exist." | No | Queue | No |
| `BOOKING_NOT_FOUND` | B1, C1, D2 | 404 | unknown / deleted booking | "Booking not found." (D2: degrade, see §6) | No | No | No |
| `OFFLINE_EVENT_NOT_FOUND` / `SETTLEMENT_NOT_FOUND` / `DEDUCTION_NOT_FOUND` / `REFUND_NOT_FOUND` | B1 | 404 | target id not on this booking | "That item isn't part of this booking's deposit." | No | History | No |
| validation (`Bad Request` + class-validator text) | all writes | 400 | DTO shape / length / unknown key | show field message; for execute: "Unexpected request." | No | No | No |
| `Validation failed: "…" is not a valid UUID v4` | :id routes | 400 | bad id in URL | "Invalid link." | No | No | No |
| `DISPUTE_REASON_REQUIRED` / `DISPUTE_NOTE_REQUIRED` | B1 / B2 | 400 | whitespace-only text | "Enter a reason." / "Enter a note." | after fix | No | No |
| `NO_DEPOSIT_DUE` | B1 | 400 | booking has no deposit | "This booking has no security deposit." | No | No | No |
| `DISPUTE_TARGET_INVALID:<detail>` | B1 | 400 | wrong id set for the type | "The selected item doesn't match the case type." | No | No | No |
| `DISPUTE_TARGET_INELIGIBLE:<reason>` | B1 | 400 | `NOT_CONFIRMED`, `EVENT_TYPE`, `NO_SETTLEMENT`, `SETTLEMENT_REFUNDED`, `SETTLEMENT_SUPERSEDED`, `REFUND_IN_FLIGHT` | per reason, e.g. "Only confirmed records can be disputed." / "Already refunded — open a case on the refund instead." / "This settlement was revised; use the current one." / "The refund is still in progress." | No | History | Maybe |
| `DISPUTE_ALREADY_OPEN` (`details.disputeId`) | B1 | 409 | a case is open on this item | "A case is already open on this item." + link | No | No | No |
| `DISPUTE_LIFETIME_CAP_REACHED` (`details {cap, side}`) | B1 | 409 | admin side used its 2 cases on this item | "NestPG admins have already opened the maximum number of cases on this item." | No | No | Yes |
| `DISPUTE_PARENT_NOT_RESOLVED` / `DISPUTE_CHAIN_LIMIT` / `DISPUTE_ALREADY_SUPERSEDED` / `DISPUTE_SUPERSEDE_TARGET_MISMATCH` | B1 (reconsideration) | 409/409/409/400 | reconsideration rules | "Only a resolved case can be reconsidered." / "This case is already a reconsideration." / "A reconsideration already exists." + link / "A reconsideration must be about the same item." | No | Yes | No |
| `DISPUTE_NOT_OPEN` (`details.status` on resolve) | B2, B3, B5 | 400 / 409 | case no longer OPEN | "This case is no longer open (now {status})." | No | Yes | No |
| `DISPUTE_RESOLUTION_INVALID:<tokens>` | B3 | 400 | `INVALID_FINDING`, `INVALID_EFFECT`, `INVALID_RESOLUTION_REASON`, `RESOLUTION_VERSION_REQUIRED`, `RESOLUTION_VERSION_MISMATCH`, `EFFECT_NOT_ALLOWED_FOR_TARGET`, `EFFECT_REQUIRES_UPHELD` | per token, e.g. "This outcome isn't allowed for this case type." / "Only an upheld finding can change the deposit." / "Please refresh — the approval text has changed." (version mismatch) | after fix | Mismatch: reload app | No |
| `DISPUTE_TARGET_GONE` / `DISPUTE_TARGET_CHANGED` | B3, B4 | 409 | target deleted / superseded / no longer confirmed | §8 | No | Yes | Yes |
| `DISPUTE_EFFECT_NOT_DERIVABLE` | B3, B4 | 409 | supersession has no server-derivable figure for this case shape | "A revised settlement can't be derived for this case. Choose another outcome." | No | No | Yes |
| `DISPUTE_EFFECT_NO_SETTLEMENT` / `DISPUTE_EFFECT_SETTLEMENT_REFUNDED` / `DISPUTE_EFFECT_SETTLEMENT_NOT_PENDING` | B3, B4 | 409 | settlement state forbids the effect | "The settlement is {already refunded / not awaiting a refund / missing}, so this outcome can't be applied." | No | Yes | Yes |
| `DISPUTE_EFFECT_REFUND_IN_FLIGHT` / `DISPUTE_EFFECT_REFUND_EVENT_PENDING` | B3, B4 | 409 | a refund is processing / an offline refund awaits confirmation | "A refund is already under way. Wait for it to finish (or the record to be withdrawn), then try again." | Later | Yes | Yes |
| `DISPUTE_EFFECT_NOT_OFFLINE_RAIL` | B3, B4 | 409 | OFFLINE_REFUND_CONFIRMED on an online-collected deposit | "This deposit was paid online, so it can't be marked as returned offline." | No | No | Yes |
| `DISPUTE_EFFECT_BLOCKED_BY_OPEN_CASE` (`details`) | B4 | 409 | another OPEN case on the booking | §8 | After the other case closes | Yes | Yes |
| `DISPUTE_NOT_RESOLVED` (`details.status`) | B4 | 409 | not resolved | "Resolve the case before applying an outcome." | No | Yes | No |
| `DISPUTE_EFFECT_INVALID` | B4 | 409 | effect/version inconsistent on the row | "This outcome can't be applied. Contact engineering." | No | Yes | Yes |
| `DISPUTE_EFFECT_ALREADY_EXECUTED` | B4 | 409 | concurrent execution won | treat as success after refetch | — | Yes | No |
| `Only finance/admin can trigger refund reconciliation.` | D1 | 403 | (not exposed in v1) | — | — | — | — |
| `INTERNAL_ERROR` | any | 5xx | server fault | "Something went wrong. Refresh to check whether the action was applied." | No (refetch first) | Yes | Maybe |
| network (status 0 / timeout) | any | — | unknown outcome | "We couldn't confirm the result. Checking…" → §8 reconcile | No (refetch first) | Yes | Maybe |

Not applicable to admins (party routes, 403 for admins): counter-statement codes
(`DISPUTE_NOT_COUNTERPARTY`, `COUNTER_STATEMENT_ALREADY_GIVEN`, `DISPUTE_STATEMENT_REQUIRED`),
`DISPUTE_SELF_TARGET`, `DISPUTE_TARGET_NOT_FOR_SIDE`.

Implementation: a new helper (e.g. `core/http/api-error-info.ts`) returning
`{status, code: <prefix before ':' of message>, detail: <suffix>, details}`; feature copy maps on `code`.
`apiErrorMessage` stays unchanged.

---

## 12. Privacy requirements

- Render only the fields listed in §5–§6; never `JSON.stringify` an API object into the page.
- Never request or render `payment_transactions.raw` (not projected by any admin route) or the settlement's private `reason` (not projected; Q-8).
- Offline-event `note` is not projected; do not add it.
- Event `metadata` and `bookingHistory.metadata`: render only the whitelisted keys in §6.1/§6.3.
- No secrets, tokens or env values in the DOM, logs or error copy.
- The resolution reason is party-visible; the form says so. Internal notes are admin-only and must never be copied into the resolution reason automatically.
- Admin-visible ids (actor ids, gateway ids) are acceptable per the admin projection; they must not leak into party-facing surfaces (no change to mobile).

---

## 13. Test plan (for ADM-D.1; not executed here)

**Unit (Vitest + `HttpTestingController`, existing convention)**
- Capability gating: SUPER/OPS/FINANCE sessions render exactly the actions in §3 / §6.2 (OPS: no Resolve/Apply; OPS withdraw only on own ADMIN cases; party cases: no Withdraw).
- Resolve form: finding/effect enabling per §7.1; reason required and ≤1000; acknowledgement required for non-NONE; `resolutionVersion` sent only for non-NONE; NONE path shows no Apply.
- Execute: request body is `{}`; one call per confirmation; no auto-retry.
- Error mapping: every row of §11 (code + suffix parsing + `details` links).
- Queue: filters → query params; OPEN-first order preserved; pages from `meta.total`; loading/error/empty distinct.
- Detail: target facts per type; metadata whitelist; timeline order; refetch after every mutation.
- Network-failure reconciliation per §8.
- Navigation item visibility by `OPERATIONAL_READ`.

**Integration / API-level E2E (`backend/e2e/admin/adm-d1.e2e.mjs`, real API + DB, A2/A4 harness conventions, cleanup to baseline)**
- Queue filters + paging; detail with target facts; deposit history.
- Notes (OPS, FINANCE); admin open (+ freeze proof); withdraw (opener, RESOLUTION holder, OPS on another's case → 403, party case → 403, resolved → 400).
- Resolve (all combinations of §7.1, version rules); execute (OFFLINE_REFUND_CONFIRMED, SETTLEMENT_SUPERSEDED, NONE, idempotent repeat).
- Conflict: execute blocked by another open case → 409 with `details`, then succeeds after the other case closes.

**Authorization:** SUPER, OPS, FINANCE per §3; owner, manager, resident → 403 on A1–C1.

**Privacy (negative assertions on API JSON and rendered DOM):** no `raw`, no settlement `reason`, no offline `note`, no tokens; metadata keys outside the whitelist absent from the DOM.

**Browser (manual + preview):** queue → detail → note → resolve → apply; blocked apply with link to the blocking case; withdraw an admin case; deposit history read. Requires an admin dev-server launch entry (a config addition in ADM-D.1, approval needed).

---

## 14. Proposed implementation milestone

**ADM-D.1 — Admin deposit dispute operations (frontend only)**
- Capability union: add `DEPOSIT_DISPUTE_OPERATIONS`, `DEPOSIT_DISPUTE_RESOLUTION`.
- `core/data/deposit-disputes.service.ts` (A1, A2, B1–B5, C1, D2) — errors propagate; no `catchError(() => of([]))`.
- Error helper (§11).
- Routes + nav item (§4); booking drawer link.
- Queue (§5), detail (§6), deposit history (§6.3), resolve + apply (§7), conflict handling (§8).
- Tests per §13; API-level E2E harness; browser validation.
- **No backend change, no migration, no mobile change.**

Deferred milestones (separate approval each):
- **ADM-D.2** persistent refund-exception visibility (§9 Option B; backend + UI).
- **Four-eyes** enforcement (Q3(b); backend).
- **FIN-Q1** unresolved deposit-payment refund path (product decision first).
- **NTF-1** notification reliability (PP3, relay batch redelivery, handler-failure loss, party "confirmed by both sides" copy, stale WAITING record).
- **REL-1** CI and release readiness (incl. admin `environment.prod.ts`, token storage, admin `lint` target, remaining swallowed errors).

---

## 15. Out of scope (ADM-D.0 and ADM-D.1)

Refund reconciliation button (D1); persistent exception queue; any backend endpoint, DTO or migration;
four-eyes; Q-1; party apps; notification changes; generic refunds or amount entry; actor-name resolution;
property picker / free-text search; dispute deadlines, categories, assignees, priority, SLA; changes to
A1–A3 auth/capability architecture beyond the two capability names; shared `os-modal` accessibility
rework; Storybook for the admin app; CI.

---

## 16. Acceptance criteria (ADM-D.1)

1. SUPER, OPS and FINANCE see "Deposit disputes" under Finance; owners/managers/residents cannot reach the routes (backend 403 regardless).
2. Queue lists cases with backend filters and paging; OPEN first; loading/error/empty distinct.
3. Detail shows identity, booking context, target facts, statements, notes, full timeline (whitelisted metadata), resolution, execution state and relationships, all from existing projections.
4. Actions appear exactly per §3/§6.2; every mutation has the specified confirmation; every server refusal maps to §11 copy; the UI refetches after every mutation and never auto-retries.
5. Resolve and apply are two separate calls; apply sends an empty body; no client-computed amounts anywhere.
6. A blocked apply shows the blocking case with a working link and leaves state as the server reports.
7. Deposit history renders the settlement chain with the live tail marked and the derived refund state, without raw payloads, private reasons or notes.
8. Unit, API-level E2E and authorization/privacy tests pass; existing admin specs and A1–A4 harnesses still pass; admin `ng build` and `ng test` green.
9. Zero backend, migration or mobile changes.

## 17. Risks and dependencies

| Risk / dependency | Mitigation |
|---|---|
| Backend M-C.4 code is **uncommitted** | Commit the backend before ADM-D.1 starts (prerequisite) |
| Client mirrors of backend rules (allowed-effects table, withdraw rule, version constant) drift | Presentation only; server authoritative; unit tests pin the copies; version mismatch surfaces as a clear 400 |
| FINANCE cannot resolve actor names | Show side + short id (§6.4) |
| Soft-deleted booking: D2 404 while A2/C1 work | Degrade gracefully (§6) |
| Shared `os-modal` lacks dialog semantics | Use inline confirmations |
| No CI / no admin lint target | Run `ng test` / `ng build` and the harnesses by hand; REL-1 later |
| Single-actor resolve + execute (no four-eyes) | Accepted for v1 only if Q3(a) is approved; both actors are recorded |
| Gateway-side refund holds stay invisible in the UI | Option A help text; ADM-D.2 if required |
