# Phase B — Web Admin Integration: Backend API Gaps

> Audited the requested Phase-B screens against the **real** Phase-A controllers.
> Most features map to existing endpoints. The items below have **no backend
> endpoint** — per the STOP rule they are **not fabricated or mocked**. The
> screens render an explicit "endpoint pending" empty state for these, exactly
> as the existing Operations Center does for tickets.

## Confirmed-missing endpoints (do NOT implement around)

| # | Screen feature | Needed endpoint (absent) | What the UI does instead |
|---|----------------|--------------------------|--------------------------|
| 1 | Finance: **Recent Expenses**, **Expense Trend** | an Expenses module (`GET /expenses…`) | Omitted with a labelled "No expenses module" note — there is no expense backend at all. |
| 2 | Finance: **Revenue Chart / Collection Trend** (time-series) | `GET /dashboard/revenue/history` or `/collections/trend` | Only point-in-time values exist (`/collections/dashboard`, `/dashboard/revenue`). Chart shows the current snapshot (today vs month vs outstanding); no historical series is invented. |
| 3 | Payments drawer: **Receipt** PDF | `GET /payments/:id/receipt` | Not rendered. Only `GET /invoices/:id/pdf` exists. |
| 4 | Payments drawer: **Retry** | `POST /payments/:id/retry` | Hidden. (A failed online payment is retried by creating a new Razorpay order, not by a retry endpoint.) |
| 5 | Notifications: **Delivery History / Retry Queue**, per-delivery table, drawer **Retry** | `GET /notifications/deliveries`, `POST /notifications/deliveries/:id/retry` | The Notification Center ships **Notifications feed + Preferences + Templates** (all real). The delivery-admin tabs show "endpoint pending" — `notification_deliveries` has no read/retry API (dispatch is internal cron only). |
| 6 | Reviews: global **Approved / Rejected** tabs | `GET /reviews?status=…` (cross-subject) | Moderation queue (`/reviews/queue`) returns PENDING+FLAGGED only; approved/rejected are queryable **per subject** (`/reviews?subjectType=&subjectId=`). The screen shows the Pending/Flagged queue + per-subject browse + analytics (`/reviews/top`, `/reviews/aggregate`). |
| 7 | Collections: **Owner Collections** report, dedicated **Penalty History / Reminder History** lists | `GET /collections/reports/owner`, `/collections/penalties`, `/collections/reminders` | Property report (`/collections/reports/property`) + per-resident timeline (`/collections/timeline/:userId`, which includes that resident's reminders) are used. Owner-wide rollup and global penalty/reminder lists have no endpoint. |

## Fully available (built against real APIs, zero mock)

- **Payments:** `GET /payments` (status/booking/payer filters, paging), `GET /payments/:id` (+allocations/transactions/refunds), `POST /payments/:id/refund`, `POST /payments` (record), `POST /payments/razorpay/order`.
- **Invoices:** `GET /invoices`, `GET /invoices/:id` (+lines/payments), `POST /invoices` (create), `POST /:id/issue`, `POST /:id/void`, `GET /:id/pdf`.
- **Collections:** `GET /collections/dashboard|aging|ledger|recovery-queue|reports/property|timeline/:userId`, `POST /:invoiceId/remind`.
- **Notifications:** `GET /notifications`, `POST /:id/read`, `POST /read-all`, `GET/PUT /preferences`, `GET/POST /templates`, `POST /templates/preview`.
- **Reviews:** `GET /reviews|aggregate|top|queue|:id`, `POST /:id/flag`, `POST /:id/moderate`.
- **Visitors:** `POST /visitors`, `GET /visitors` (status/search/property filters), `POST /validate`, `GET /:id|:id/pass|:id/logs`, `POST /:id/approve|reject|cancel|check-in|check-out`. Dashboard cards (today/active/upcoming/expired) are computed client-side from status-filtered `GET /visitors` calls (no dedicated stats endpoint — acceptable, documented).

## Notes on FE building blocks
The component library lacks the planned `os-table`/`os-form`/`os-toast`/`os-error-state`/`os-confirm-dialog` (architecture marked them `[add]`, never built). Phase-B screens follow the **existing** convention used by `bookings-list`, `portfolio-hub`, etc.: hand-rolled `<table>` + `os-status-pill` + `os-empty-state` + `os-loading-state` + `os-drawer` + `os-modal` + inline toast signal + `apiErrorMessage`. No new primitive is invented; no parallel design system.
