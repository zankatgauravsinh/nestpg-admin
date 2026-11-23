# ADM-D.1 — Admin deposit operations console: implementation record

Implements `ADM_D0_DEPOSIT_OPERATIONS_SPEC.md` with the approved decisions (Q1 Option A, Q2 two
separate actions, Q3 no four-eyes, Q4 Finance nav, Q5 backend withdrawal authority, Q6 confirmations,
Q7 reconsideration). Frontend only: **no backend, migration or mobile change; no financial behaviour
change.** No discrepancy with the spec was found that required stopping.

## 1. Screens and routes

| Route | Component | Guard |
|---|---|---|
| `/finance/deposit-disputes` | `DepositDisputesQueueComponent` | `capabilityGuard` + `OPERATIONAL_READ` |
| `/finance/deposit-disputes/:id` | `DepositDisputeDetailComponent` | same |
| `/finance/deposits/:bookingId` | `BookingDepositHistoryComponent` | same |

- Nav: Finance → "Deposit disputes" (`gavel`, `OPERATIONAL_READ`).
- Booking drawer (`/bookings`): "Deposit history" link, shown with `OPERATIONAL_READ`.
- Code: `src/app/features/finance/deposit-disputes/` (queue, detail, history, `open-dispute-form`,
  `dispute-confirm-panel`, `dispute-copy`), `src/app/core/data/deposit-disputes.service.ts`,
  `src/app/core/http/api-error-info.ts`.

## 2. API contracts used (verified against backend code)

| Call | Route | Notes |
|---|---|---|
| queue | `GET /admin/deposit-disputes?status&targetType&propertyId&bookingId&page&limit` | meta `{page, limit, total}`; pages = `ceil(total/20)`; server order (OPEN first) rendered as received |
| detail | `GET /admin/deposit-disputes/:id` | admin projection + `targetFacts` + `events` + `supersededByDisputeId` |
| booking context | `GET /bookings/:id` | names + derived `depositRefund` (incl. `ON_HOLD`); 404 (deleted booking) degrades |
| deposit history | `GET /admin/bookings/:id/deposit-history` | read-only |
| note | `POST /admin/deposit-disputes/:id/notes` `{note}` | not idempotent — never retried |
| open / reconsider | `POST /admin/deposit-disputes` | body from `openBodyFor`: exactly the ids the type takes (an OFFLINE_REFUND / ONLINE_REFUND case never sends its derived settlement id) |
| withdraw | `POST /admin/deposit-disputes/:id/withdraw` | no body |
| resolve | `POST /admin/deposit-disputes/:id/resolve` `{finding, effect, resolutionReason, resolutionVersion?}` | `resolutionVersion: 'dispute-resolution-v1'` sent for non-NONE only (client constant, as specified) |
| execute | `POST /admin/deposit-disputes/:id/execute-effect` | body `{}` |

Not called anywhere: `POST /payments/ops/reconcile-deposit-refunds` (Q1 Option A); `GET /users/:id`
(FINANCE lacks USER_OPERATIONS; actors are shown as side + short id).

## 3. Capability gating (presentation; the backend decides)

The two backend names `DEPOSIT_DISPUTE_OPERATIONS` / `DEPOSIT_DISPUTE_RESOLUTION` were added to the
`Capability` union (they already arrived at runtime from `GET /users/me`). No new capability, no change
to the A3 session/guard architecture.

| Control | Shown when |
|---|---|
| Note | OPEN + OPERATIONS |
| Withdraw | OPEN + `openedSide = ADMIN` + OPERATIONS + (opener = me or RESOLUTION) |
| Resolve | OPEN + RESOLUTION |
| Apply outcome | RESOLVED + `effectExecuted === false` + RESOLUTION |
| Open reconsideration | RESOLVED + not superseded + not itself a reconsideration + OPERATIONS |
| Open admin case (history page) | OPERATIONS; offered on CONFIRMED offline records, the live settlement and its lines, gateway refunds |

Result per role: SUPER and FINANCE — all of the above; OPS — notes, open, withdraw own admin cases,
no resolve / apply; owners, managers, residents — no route access (the backend answers 403 anyway).

## 4. Error handling

`apiErrorInfo()` reads the real envelope: the domain code from `errors[0].message` (split at `:` into
`code` + `detail`), `details` when supplied, and a kind (`network`, `auth`, `forbidden`, `not-found`,
`validation`, `conflict`, `server`). `disputeErrorCopy()` maps every code in ADM-D.0 §11 to operator copy,
whether to re-read, a link (`details.disputeId` / `details.blockingDisputeId`) and whether the outcome is
uncertain. Validation sentences are shown as-is; unknown codes fall back to neutral copy (no raw code,
no stack, no payload). `apiErrorMessage()` is unchanged for existing screens. The new data service
never swallows errors (unlike the 14 legacy `catchError(() => of([]))` sites, which were not touched).

## 5. Flows

- **Notes:** trimmed, ≤1000, button disabled while in flight; success → re-read; transport/5xx →
  "could not confirm whether the note was saved", re-read, text kept, no automatic re-send.
- **Open admin case / reconsideration:** reason (party-visible, ≤1000) → explicit confirmation stating
  the refund freeze → submit; conflicts (`DISPUTE_ALREADY_OPEN`, lifetime cap, reconsideration rules,
  ineligible target) are explained with links; nothing is retried or opened automatically; success →
  navigate to the new case.
- **Withdraw:** confirmation ("does not reverse any money movement") → submit → re-read.
- **Resolve:** finding radios; effect radios limited to the target type's allowed set; non-NONE disabled
  unless UPHELD; SETTLEMENT_SUPERSEDED disabled when the locked derivation rule gives no figure (the rule
  text is shown); reason required (party-visible); acknowledgement checkbox for non-NONE; review step →
  confirmation stating "records the decision only. No money moves until the outcome is applied" → submit.
  A refusal that does not change the case (e.g. `DISPUTE_EFFECT_NOT_DERIVABLE`) returns to the filled form;
  a state conflict re-reads.
- **Apply outcome:** separate action; confirmation shows finding, effect, what the backend will do and the
  server's own refundable figure (no client computation); body `{}`; the page shows "Applied" only after the
  server returns `effectExecuted: true` and the re-read confirms it. `DISPUTE_EFFECT_BLOCKED_BY_OPEN_CASE` →
  message + link to `blockingDisputeId` + re-read (the new `EFFECT_EXECUTION_FAILED` reason is shown);
  no retry loop.
- The detail follows route-parameter changes (following a link to another case reloads cleanly).

## 6. Booking deposit history

Booking facts, deposit, offline records (no note), the settlement chain ordered root → revisions with
the live settlement marked (the one nothing supersedes; display only), refunds with their transaction log
summary, disputes, lifecycle (`from → to`, actor, reason; the raw `metadata` object is never rendered),
and the derived `depositRefund` from `GET /bookings/:id` with an `ON_HOLD` explanation. Loading, error
(404 / 403 / failure), empty and no-deposit states are distinct.

## 7. Privacy guarantees

Only listed fields are rendered — no object is stringified into the page. Event metadata is whitelisted
per action (FREEZE_BLOCKED shows only `chokepoint`, etc.). `payment_transactions.raw`, the settlement's
private `reason` and the offline `note` are not in any admin projection and are never requested.
The E2E harness seeds a private settlement reason and an offline note and asserts neither appears in
any admin response.

## 8. Accessibility

Inline confirmation panel (`os-dispute-confirm`): labelled group, focus moves to its heading (not to the
confirm button), Escape cancels, confirm disabled while busy. Inputs have labels; radios use
fieldset/legend; status and errors use `role="status"` / `role="alert"`; tables have a caption and
`scope="col"`. The shared `os-modal` was inspected (no dialog role or focus management) and **not** used
or modified. Defect found and fixed during testing: radios sharing a `name` share one `ngModel` control,
so `[disabled]` on one effect option disabled all of them — now `[attr.disabled]` per option.

## 9. Tests

`ng test`: **15 files / 151 tests** (baseline 9 / 92; +6 files / +59 tests):
`api-error-info.spec` (envelope shapes, colon codes, kinds), `deposit-disputes.service.spec` (paths,
params, bodies, empty execute body, no reconcile, error propagation, `openBodyFor`), `dispute-copy.spec`
(error copy, effect state, derivation rule, metadata whitelist, nav + route guards),
`deposit-disputes-queue.component.spec`, `deposit-dispute-detail.component.spec` (rendering, gating per
role, notes incl. ambiguous failure, resolve NONE / non-NONE / disabled options / refusal / stale,
apply empty body / applied only after confirmation / blocked with link, withdraw, reconsideration body,
open-case conflict), `booking-deposit-history.component.spec` (chain + live tail, ON_HOLD, privacy,
states, entry points, open body, cap refusal).

## 10. E2E

`nestpg-admin/e2e/adm-d1-deposit-operations.e2e.mjs` (Node 22, real API + PostgreSQL, the backend/e2e
conventions; it reads the backend `.env` and `jsonwebtoken` read-only, so no backend file changes):
**30/30**, baseline restored. Covers queue access, filters, paging meta, order; detail; notes;
admin-created case + duplicate refusal; execution blocked by the open admin case (409 + id, nothing
written); OPS cannot resolve / execute; withdrawal authority (own, RESOLUTION holder, party case refused,
SUPER no override); resolution records only (settlement byte-identical); separate execution confirmed by
the backend; original settlement byte-identical afterwards; idempotent repeat; NONE resolution;
reconsideration; owner / resident / anonymous denial; deposit history; privacy.

## 11. Browser validation

Admin dev server via the new `admin` launch entry (:4200) against the real API (:3000), on a temporary fixture booking that was cleaned up afterwards (baseline restored). Sessions came from locally minted test tokens for FINANCE, OPS and an owner.

Confirmed by screenshot and DOM inspection:
- **Queue (FINANCE):** the OPEN filter, the outcome column and the Finance nav entry after Collections. At about 800px the table scrolls inside its own container.
- **Detail (FINANCE):** a note was added by real typing. Resolve UPHELD + SETTLEMENT_SUPERSEDED went through the form, with focus moving to the confirm heading. The result showed "Recorded — not applied". No private note, private settlement reason, raw payload or object dump appeared in the DOM.
- **Role gating (OPS):** the resolved case offered only "Open reconsideration". Deposit history offered open-case buttons only on the live settlement, its lines and the confirmed offline event.
- **Admin-opened case (OPS):** opened on a deduction line through the form, with the freeze warning shown. The new case offered only Withdraw and the note form.
- **Blocked effect (FINANCE):** Apply returned 409. The UI showed the message, an "Open the blocking case" link and a failure entry in the history. The link loaded the blocking case.
- **Withdrawal (FINANCE, keyboard):** Escape cancelled the confirmation. Tab and Enter then withdrew the case.
- **Effect execution (FINANCE):** Apply succeeded, showing "Applied" with the execution reference.
- **Deposit history (1280 wide):** the original settlement was marked "history" and the revision "live", with refundable ₹10,800. This evidence comes mainly from the DOM, because the screenshot was small.
- **Booking drawer:** the "Deposit history" link points to `/finance/deposits/<bookingId>`.
- **Owner:** both `/finance/deposit-disputes` and `/finance/deposits/:id` redirect to the dashboard. There is no nav item and no dispute API call.
- **Reconciliation:** the network log has no call to the refund reconciliation endpoint.

## 12. Config additions

`/Users/gaurav/WORK/nestpg/.claude/launch.json`: one entry `admin` → `cd nestpg-admin/apps/web-admin &&
npm start -- --port 4200` (the existing `ng serve`, which already uses `proxy.conf.json` → `:3000`).
Needed because no preview entry existed for the admin app. No other config changed.

## 13. Deferred / out of scope

ADM-D.2 persistent refund-exception visibility (writer + list endpoint + screen); refund reconciliation
button; four-eyes enforcement; Q-1 unresolved deposit-payment path; notification reliability; CI; actor
name resolution; property picker / free-text search; shared modal accessibility; legacy swallowed errors.

## 14. Known limitations

- **Four-eyes is not enforced** (Q3, approved for v1): one SUPER or FINANCE admin can resolve and then
  apply the same case. Both actors are recorded (`resolvedBy`; the EFFECT_EXECUTED event's actor).
- Gateway-side refund holds are not visible in the UI (Q1 Option A); only the derived `ON_HOLD` is.
- Actors appear as side + short id (no name lookup available to FINANCE).
- The allowed-effects table, the supersession derivation rule, the withdraw rule and the resolution
  version are presentation copies of backend rules; the backend re-validates every call.
- Backend M-C.4 code remains uncommitted (prerequisite flagged in ADM-D.0, not part of this milestone).
