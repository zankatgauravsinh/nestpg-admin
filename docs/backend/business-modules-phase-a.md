# NestPG — Phase A Business Modules: Delivery & API Reference

> Implementation record for the 6 Phase-A modules. Design rationale lives in
> `business-modules-design.md`; this is the as-built API surface + verification.
> All money is integer **paise**. Base `/api/v1`, `ApiResponse` envelope,
> `JwtAuthGuard` unless marked `@Public`.

## Status — COMPLETE (5 phases, 6 modules)

| Phase | Module | Lib | Migration | Tables | Tests |
|-------|--------|-----|-----------|--------|-------|
| 1 | Payments | `@nestpg/payments` | V3_023 | payments, payment_allocations, refunds, payment_transactions, payment_methods, payment_sequences | 5 |
| 1 | Invoices | `@nestpg/invoices` | V3_024 | invoices, invoice_lines, invoice_payments, invoice_sequences | 3 |
| 2 | Collections | `@nestpg/collections` | V3_025 | collection_reminders (+ read model over invoices/payments) | 3 |
| 3 | Notifications | `@nestpg/notifications` | V3_026 | notifications, notification_templates, notification_preferences, notification_deliveries | 5 |
| 4 | Reviews | `@nestpg/reviews` | V3_027 | reviews, review_aggregates | 3 |
| 5 | Visitors | `@nestpg/visitors` | V3_028 | visitors, visitor_passes, visitor_logs, visitor_approvals | 2 |

**Verification (every phase):** `nx build api` green · `nx test <lib>` green (21 total) · migration applied · routes live (401 protected / 403 bad signature / 200 public) · cron jobs + event subscribers registered · prior phases intact.

## Architecture reuse (no parallel implementations)
- **Transactions + events:** `BookingTransactionService.run()` + `writeOutbox()` — every mutation writes its event to the outbox inside the same tx; `OutboxRelayJob` republishes on `EventEmitter2`.
- **Jobs:** `@Cron`/`@Interval` + `CronLockService` + `JobExecutionRegistryService` (visible in `/admin/ops/jobs`). No BullMQ parallel queue introduced.
- **Entities:** all extend `BaseEntity`; soft-delete partial indexes; Postgres enums.
- **Guards/envelope:** `JwtAuthGuard`/`RolesGuard`/`@Roles`/`@CurrentUser`/`@Public`, `ApiResponse.ok`, `ParseUUIDPipe`, `@ApiStandardErrors`.
- **Webhook idempotency:** reuses `webhook_events (provider, event_id)`.
- **Media:** review/payment attachments reuse the generic `media` table + presigned uploads.

## New events (added to `EVENTS`)
`payment.initiated|success|failed|refunded`, `invoice.generated|paid|overdue`, `collection.reminder`, `review.submitted|moderated`, `visitor.requested|approved|checked_in|checked_out`. The Notifications subscriber consumes 15 events (these + booking/kyc/waitlist) → persisted multi-channel notifications.

## Scheduled jobs added
| Job | Schedule | Module |
|-----|----------|--------|
| invoice-overdue-scan | `0 3 * * *` | invoices |
| collection-reminder-scheduler | `*/30 * * * *` | collections |
| collection-penalty-generation | `0 4 * * *` | collections |
| notification-dispatch | `@Interval 10s` | notifications |
| visitor-pass-expiry | `*/15 * * * *` | visitors |

---

## API surface

### Payments `/payments`
`POST /payments` (record manual/cash) · `POST /payments/razorpay/order` · `POST /payments/razorpay/verify` · `POST /payments/webhook/razorpay` (@Public, signed+idempotent) · `GET /payments` · `GET /payments/:id` · `POST /payments/:id/refund`.

### Invoices `/invoices`
`POST /invoices` · `GET /invoices` · `GET /invoices/:id` · `POST /invoices/:id/issue` · `POST /invoices/:id/void` · `GET /invoices/:id/pdf` (streams PDF).

### Collections `/collections`
`GET /collections/dashboard` · `/aging` · `/ledger` · `/recovery-queue` · `/reports/property` · `/timeline/:userId` · `POST /collections/:invoiceId/remind`.

### Notifications `/notifications`
`GET /notifications` (feed) · `POST /:id/read` · `POST /read-all` · `GET/PUT /preferences` · `GET/POST /templates` (admin) · `POST /templates/preview` (admin).

### Reviews `/reviews`
`POST /reviews` (verified stay) · `GET /reviews` (@Public) · `GET /reviews/aggregate` (@Public) · `GET /reviews/top` (@Public) · `GET /reviews/queue` (moderation) · `GET /reviews/:id` · `POST /:id/flag` · `POST /:id/moderate`.

### Visitors `/visitors`
`POST /visitors` (host) · `GET /visitors` · `POST /visitors/validate` (gate) · `GET /:id` · `GET /:id/pass` (QR) · `GET /:id/logs` · `POST /:id/approve|reject|cancel|check-in|check-out`.

## State machines
- **Payment:** PENDING/PROCESSING → SUCCESS → (PARTIAL/REFUNDED) ; FAILED ; CANCELLED.
- **Invoice:** DRAFT → ISSUED → PARTIAL → PAID ; OVERDUE (cron) ; VOID.
- **Review:** PENDING → APPROVED/REJECTED/HIDDEN ; FLAGGED (auto at threshold).
- **Visitor:** PENDING → APPROVED → CHECKED_IN → CHECKED_OUT ; REJECTED ; CANCELLED ; EXPIRED (cron). **Pass:** ACTIVE → USED/EXPIRED/REVOKED.

## Permissions (enforced by `@Roles` + service ownership)
See `business-modules-design.md §6`. Highlights: payments record/refund = finance/owner-manager; invoices issue/void = finance/owner-manager; collections = finance/owner-manager; notifications feed/prefs = self; templates = admin; reviews create = verified stay (any), moderate = admin/property-owner, reads = public; visitors create = host, approve = host/property-manager/admin, gate ops = staff roles.

## Production configuration (config-gated, not mocks)
- **Razorpay:** `RAZORPAY_KEY_ID/KEY_SECRET/WEBHOOK_SECRET` — online payments + webhook; absent ⇒ online disabled (manual/cash still work), 503 on order.
- **Notification channels:** `NOTIF_EMAIL_WEBHOOK_URL` / `NOTIF_SMS_WEBHOOK_URL` / `NOTIF_WHATSAPP_WEBHOOK_URL` / `NOTIF_PUSH_WEBHOOK_URL` — real gateway relays; absent ⇒ channel SKIPPED (In-App always on).
- **Collections:** `COLLECTION_PENALTY_BPS` (default 200 = 2%), `COLLECTION_GRACE_DAYS` (default 5).

## Remaining (out of Phase-A scope)
Frontend wiring for the new APIs (the web-admin Finance/Comms screens can now move off mock data); live Razorpay/gateway round-trips need real credentials + a logged-in token to exercise end-to-end. A `visitor.rejected` notification event was intentionally not added (host sees status; can be added if a dedicated channel is wanted).
