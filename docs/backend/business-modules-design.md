# NestPG — Phase A Business Modules: Design

> Design-of-record for the 6 new modules (Payments, Invoices, Collections,
> Notifications, Reviews, Visitor Management). Produced **before coding** per the
> task. Follows the existing architecture exactly — no parallel patterns.

## 0. Audit findings (patterns we MUST follow)

| Concern | Existing pattern (reuse, do not reinvent) |
|---------|-------------------------------------------|
| Lib layout | Nx libs `libs/<name>/src`, alias `@nestpg/<name>`; `*.module.ts`, `entities/`, `dto/`, `enums/`, `*.service.ts`, `*.controller.ts`, `*.service.spec.ts` |
| Entities | extend `BaseEntity` (`@nestpg/shared-utils`) → id/createdAt/updatedAt/deletedAt/createdBy/updatedBy; Postgres `enum` types; money = integer **paise** |
| Migrations | `migrations/V3_0XX__name.ts`, `MigrationInterface`, raw SQL, partial indexes `WHERE deleted_at IS NULL`; next free numbers start **V3_023** |
| Transactions + events | `BookingTransactionService.run(qr => …)` + `writeOutbox(manager, aggregateType, aggregateId, EVENTS.X, payload)` inside the SAME tx |
| Event bus | outbox → `OutboxRelayJob` (every 5s) republishes on `EventEmitter2`; consumers use `@OnEvent(EVENTS.X)`. Event names live in `libs/shared-utils/src/constants/events.ts` |
| Jobs | `@Cron(expr,{name,timeZone:'Asia/Kolkata'})` / `@Interval`, wrapped in `CronLockService.withCronLock(...)` + `JobExecutionRegistryService`. **(BullMQ is configured but unused — we keep the cron+outbox pattern, NOT a parallel queue.)** |
| Guards | `JwtAuthGuard`, `RolesGuard` + `@Roles(UserRole…)`, `@CurrentUser() user: JwtPayload`, `@Public()`; ownership re-checked in services (owner_id / property_manager_assignments) |
| Response | `ApiResponse.ok(data, meta?)` envelope; `ParseUUIDPipe`; `@ApiStandardErrors()` |
| DTOs | class-validator + `@ApiProperty`; `@Type(()=>Number)` for numerics |
| Webhooks | `webhook_events` table + `V3_019` provider column already exist (idempotency store — reuse for Razorpay) |
| Numbering | monthly sequence table pattern (`booking_sequences`) → mirror for invoice/payment numbers |
| Encryption | `encryptTransformer` for sensitive columns (e.g. payer VPA, card last4 kept plain, tokens encrypted) |

**Dependency additions required** (none are mocks; all are real, config-gated):
- `razorpay` (official Node SDK) — order create / refund / signature verify.
- `pdfkit` — invoice & receipt PDF generation (pure, no headless browser).
- `qrcode` — visitor pass QR generation.
- Notification channel adapters: **In-App + Email/SMS/WhatsApp/Push behind a `NotificationChannel` interface.** In-App is fully functional (DB). External channels are real adapters that dispatch when their provider env (`SMTP_*`, `TWILIO_*`, `FCM_*`, `WHATSAPP_*`) is configured, and are **disabled (logged + delivery row marked SKIPPED) when not** — standard production behavior, not a mock.

---

## 1. Gap Analysis

| Domain need | Today | Gap to build |
|-------------|-------|--------------|
| Payments | only booking amount fields (`rentPaisa`, `totalPaidPaisa`…) | full payment ledger, allocations, refunds, Razorpay, reconciliation |
| Invoices | none | invoice + lines + invoice-payments, status machine, PDF |
| Collections | none | outstanding ledger, aging, reminders, escalation, penalties |
| Notifications | in-memory `NotificationService` (no persistence/API) | persisted multi-channel notifications, templates, preferences, deliveries, event subscribers |
| Reviews | none | property/resident/manager reviews, ratings, moderation, aggregates |
| Visitors | none | visitor, pass (QR), log, approval flow, expiry job |

**Reuse, do not duplicate:** payments link to `bookings`/`corporate_bookings`; invoices link to bookings + corporate; notifications subscribe to existing `EVENTS.*`; reviews link to `pg_properties`/`users`; visitors link to `users`/`pg_properties`/`bookings`. Media attachments (reviews, payment proof) reuse the generic `media` table + presigned uploads. The existing in-memory `NotificationService` is **superseded** by the new persisted module (kept as a thin façade to avoid breaking callers).

---

## 2. Database Design (migrations V3_023 … V3_028)

All tables extend the BaseEntity column set (id uuid pk, created_at, updated_at, deleted_at, created_by, updated_by). Money = `BIGINT` paise.

### V3_023 — Payments
- **payments**: `payment_number`(uniq), `booking_id?`, `corporate_booking_id?`, `invoice_id?`, `payer_user_id`, `property_id?`, `purpose`(enum: RENT, SECURITY_DEPOSIT, UTILITY, MAINTENANCE, PENALTY, ADVANCE, OTHER), `method`(enum: UPI, CARD, NETBANKING, CASH, BANK_TRANSFER), `status`(enum: PENDING, PROCESSING, SUCCESS, FAILED, REFUNDED, PARTIAL, CANCELLED), `amount_paisa`, `allocated_paisa`, `refunded_paisa`, `currency`('INR'), `gateway`(enum: RAZORPAY, MANUAL, CASH…), `gateway_order_id?`, `gateway_payment_id?`, `gateway_signature?`, `notes?`. Indexes: (booking_id), (payer_user_id), (status), uniq(gateway_order_id) where not null.
- **payment_allocations**: `payment_id`, `invoice_id?`, `booking_id?`, `component`(enum same as purpose), `amount_paisa`. (Splits one payment across charges.)
- **refunds**: `refund_number`(uniq), `payment_id`, `amount_paisa`, `reason`, `status`(enum: PENDING, PROCESSING, SUCCESS, FAILED), `gateway_refund_id?`, `processed_at?`.
- **payment_transactions**: append-only gateway event log — `payment_id`, `kind`(ORDER_CREATED, AUTHORIZED, CAPTURED, FAILED, REFUND_INITIATED, REFUND_PROCESSED, WEBHOOK), `gateway_ref?`, `raw`(jsonb), `created_at`. (Audit/state trail.)
- **payment_methods** (saved instruments, optional): `user_id`, `type`(UPI/CARD…), `label`, `token_encrypted?`, `last4?`, `is_default`. 
- Webhook idempotency: reuse `webhook_events` (provider='razorpay', event_id uniq).

### V3_024 — Invoices
- **invoices**: `invoice_number`(uniq, monthly seq), `booking_id?`, `corporate_booking_id?`, `customer_user_id`, `property_id?`, `status`(enum: DRAFT, ISSUED, PARTIAL, PAID, OVERDUE, VOID), `issue_date`, `due_date`, `subtotal_paisa`, `tax_paisa`, `total_paisa`, `paid_paisa`, `balance_paisa`, `notes?`, `pdf_key?`(media/storage key). Index (customer_user_id), (status), (due_date).
- **invoice_lines**: `invoice_id`, `kind`(RENT, DEPOSIT, UTILITY, PENALTY, CORPORATE, OTHER), `description`, `quantity`, `unit_paisa`, `amount_paisa`, `tax_rate_bps?`.
- **invoice_payments**: link table `invoice_id`, `payment_id`, `amount_paisa` (a payment can settle multiple invoices and vice-versa).
- **invoice_sequences**: `month_key`(char7 pk), `current_val` (mirror of booking_sequences).

### V3_025 — Collections
No new core table (collections are a **read model + automation** over invoices/payments). One automation table:
- **collection_reminders**: `invoice_id`, `stage`(enum: GENTLE, DUE_SOON, OVERDUE_1, OVERDUE_2, ESCALATION), `channel`, `scheduled_for`, `sent_at?`, `status`(SCHEDULED, SENT, FAILED, CANCELLED). Aging buckets are computed live (Current / 1-30 / 31-60 / 61-90 / 90+) from `invoices.due_date` + `balance_paisa`.

### V3_026 — Notifications
- **notifications**: `recipient_user_id`, `type`(event key), `title`, `body`, `data`(jsonb), `entity_type?`, `entity_id?`, `read_at?`, `priority`(LOW/NORMAL/HIGH). Index (recipient_user_id, read_at).
- **notification_templates**: `key`(uniq with `version`), `version`, `channel`, `locale`, `subject?`, `body`(handlebars-style `{{var}}`), `is_active`. Composite uniq (key, channel, locale, version).
- **notification_preferences**: `user_id`, `channel`, `category`, `enabled`. uniq(user_id, channel, category).
- **notification_deliveries**: `notification_id`, `channel`(PUSH/EMAIL/SMS/IN_APP/WHATSAPP), `status`(PENDING, SENT, FAILED, SKIPPED), `provider_ref?`, `error?`, `sent_at?`.

### V3_027 — Reviews
- **reviews**: `subject_type`(PROPERTY, RESIDENT, MANAGER), `subject_id`, `author_user_id`, `rating`(smallint 1-5), `title?`, `body?`, `status`(PENDING, APPROVED, REJECTED, HIDDEN, FLAGGED), `booking_id?`(verifies stay), `moderated_by?`, `moderated_at?`. Media via generic `media` (entityType='review'). uniq(subject_type, subject_id, author_user_id, booking_id) to prevent dupes. Index (subject_type, subject_id, status).
- **review_aggregates** (denormalized, maintained on moderation/post): `subject_type`, `subject_id` (pk pair), `avg_rating`(numeric), `review_count`, `dist`(jsonb {1..5}).

### V3_028 — Visitors
- **visitors**: `host_user_id`(resident), `property_id`, `name`, `phone`, `purpose?`, `expected_at?`, `vehicle_no?`, `status`(PENDING, APPROVED, REJECTED, EXPIRED, CHECKED_IN, CHECKED_OUT). 
- **visitor_passes**: `visitor_id`, `pass_code`(uniq, random), `qr_key?`, `valid_from`, `valid_until`, `status`(ACTIVE, USED, EXPIRED, REVOKED). 
- **visitor_logs**: append-only `visitor_id`, `pass_id`, `action`(CHECK_IN, CHECK_OUT, DENIED), `gate?`, `actor_user_id`, `at`. Index (property_id via visitor), (status).

---

## 3. API Design (all `/api/v1`, `ApiResponse` envelope, JwtAuthGuard unless noted)

### Payments — `/payments`
- `POST /payments` — record a manual/cash payment {bookingId?, invoiceId?, purpose, method, amountPaisa, allocations?[]}. (FINANCE_ADMIN/OWNER/MGR/admin)
- `POST /payments/razorpay/order` — {bookingId?/invoiceId?, amountPaisa, purpose} → {orderId, key, amountPaisa}. (auth)
- `POST /payments/razorpay/verify` — {orderId, paymentId, signature} → marks SUCCESS + allocates.
- `POST /payments/webhook/razorpay` — `@Public`, signature + idempotent (webhook_events).
- `GET /payments` — list (filters: bookingId, payerUserId, status, from/to, page/limit).
- `GET /payments/:id` — detail (+ allocations, transactions).
- `POST /payments/:id/refund` — {amountPaisa, reason}. (FINANCE_ADMIN/admin)
- `GET /payments/methods` / `POST /payments/methods` / `DELETE /payments/methods/:id` (self).

### Invoices — `/invoices`
- `POST /invoices` — create from {bookingId?/corporateBookingId?, customerUserId, lines[], dueDate}. 
- `POST /invoices/generate/rent` — generate monthly rent invoices (also a cron). 
- `GET /invoices` / `GET /invoices/:id` (+ lines, payments).
- `POST /invoices/:id/issue` — DRAFT→ISSUED (emits invoice.generated). 
- `POST /invoices/:id/void` — →VOID.
- `GET /invoices/:id/pdf` — invoice PDF (presigned/stream). 
- `GET /payments/:id/receipt` — receipt PDF.

### Collections — `/collections`
- `GET /collections/dashboard` — totals, aging buckets, top debtors. (FINANCE/OWNER/MGR/admin)
- `GET /collections/ledger` — outstanding ledger (filters: propertyId, bucket, page).
- `GET /collections/aging` — aging summary.
- `GET /collections/recovery-queue` — overdue invoices needing action.
- `POST /collections/:invoiceId/remind` — manual reminder trigger.

### Notifications — `/notifications`
- `GET /notifications` — my in-app feed (unreadOnly?, page). 
- `POST /notifications/:id/read`, `POST /notifications/read-all`.
- `GET /notifications/preferences` / `PUT /notifications/preferences`.
- Admin templates: `GET/POST/PUT /notifications/templates`, `POST /notifications/templates/:id/preview`. (admin)

### Reviews — `/reviews`
- `POST /reviews` — {subjectType, subjectId, rating, title?, body?, bookingId?}. (auth; verified-stay check for property reviews)
- `GET /reviews?subjectType=&subjectId=` — approved reviews + aggregate.
- `GET /reviews/:id`.
- `POST /reviews/:id/flag` (auth).
- `POST /reviews/:id/moderate` — {decision: APPROVE|REJECT|HIDE}. (OPS_ADMIN/SUPER_ADMIN/OWNER for own property)
- `GET /reviews/aggregate?subjectType=&subjectId=`.

### Visitors — `/visitors`
- `POST /visitors` — resident creates {name, phone, propertyId, expectedAt?, purpose?}. (TENANT/host)
- `GET /visitors` — mine / by property (role-scoped). 
- `POST /visitors/:id/approve` / `/reject` — (host or MGR/CARETAKER/SECURITY/admin).
- `GET /visitors/:id/pass` — pass + QR (image via qrcode). 
- `POST /visitors/validate` — {passCode} gate scan → returns visitor + validity. (SECURITY/CARETAKER/MGR/admin)
- `POST /visitors/:id/check-in` / `/check-out` — gate actions (writes visitor_logs). 
- `GET /visitors/:id/logs`.

---

## 4. Event Design (added to `EVENTS`)

```
PAYMENT_INITIATED   'payment.initiated'
PAYMENT_SUCCESS     'payment.success'
PAYMENT_FAILED      'payment.failed'
PAYMENT_REFUNDED    'payment.refunded'
INVOICE_GENERATED   'invoice.generated'
INVOICE_PAID        'invoice.paid'
INVOICE_OVERDUE     'invoice.overdue'
COLLECTION_REMINDER 'collection.reminder'
REVIEW_SUBMITTED    'review.submitted'
REVIEW_MODERATED    'review.moderated'
VISITOR_REQUESTED   'visitor.requested'
VISITOR_APPROVED    'visitor.approved'
VISITOR_CHECKED_IN  'visitor.checked_in'
VISITOR_CHECKED_OUT 'visitor.checked_out'
NOTIFICATION_DISPATCH 'notification.dispatch'   (internal fan-out)
```
Every mutation writes its event to the **outbox inside the transaction**; the relay republishes on EventEmitter2. The **NotificationsмодуLE subscribes** (`@OnEvent`) to: booking.confirmed/checked_in/checked_out, payment.success/failed, invoice.generated/overdue, kyc.approved/rejected, waitlist.notified, visitor.* → builds a Notification + deliveries. Reviews/visitors/payments each also write `booking_history`-style domain history where applicable.

---

## 5. Queue / Job Design (cron + outbox, matching existing)

| Job | Schedule | Action |
|-----|----------|--------|
| `invoice-rent-generation` | `0 2 1 * *` (monthly) | issue rent invoices for active bookings |
| `invoice-overdue-scan` | `0 3 * * *` daily | ISSUED/PARTIAL past due → OVERDUE, emit `invoice.overdue` |
| `collection-reminder-scheduler` | `*/30 * * * *` | enqueue due `collection_reminders`, emit `collection.reminder` |
| `collection-penalty-generation` | `0 4 * * *` | add penalty invoice line for X-days overdue |
| `notification-dispatch` | `@Interval 10s` | claim PENDING `notification_deliveries`, send via channel adapter, mark SENT/FAILED/SKIPPED (FOR UPDATE SKIP LOCKED + CronLock) |
| `visitor-pass-expiry` | `*/15 * * * *` | expire passes past `valid_until`, visitors past expected window |
| `payment-reconciliation` | `0 1 * * *` | reconcile PROCESSING payments with gateway, flag mismatches |

All wrapped in `CronLockService.withCronLock` + `JobExecutionRegistryService`, mirroring `OutboxRelayJob`/`ReservationExpiryJob`.

---

## 6. Permission Matrix (enforced by `@Roles` + service ownership)

SA=SUPER_ADMIN, OA=OPS_ADMIN, FA=FINANCE_ADMIN, OWN=PG_OWNER, MGR=PROP_MANAGER, SEC=SECURITY/CARETAKER, TEN=TENANT.

| Action | SA | OA | FA | OWN | MGR | SEC | TEN |
|--------|----|----|----|----|-----|-----|-----|
| Payments: record/refund | ✅ | ✅ | ✅ | 🏠 | 🏠 | — | — |
| Payments: create order / pay self | ✅ | ✅ | ✅ | ✅ | ✅ | — | 👤 (own booking) |
| Payments: list/get | ✅ | ✅ | ✅ | 🏠 | 🏠 | — | 👤 |
| Razorpay webhook | 🔓 public + signature |
| Invoices: create/issue/void | ✅ | ✅ | ✅ | 🏠 | 🏠 | — | — |
| Invoices: view / pdf | ✅ | ✅ | ✅ | 🏠 | 🏠 | — | 👤 |
| Collections: dashboard/ledger | ✅ | ✅ | ✅ | 🏠 | 🏠 | — | — |
| Notifications: own feed/prefs | 👤 | 👤 | 👤 | 👤 | 👤 | 👤 | 👤 |
| Notifications: templates | ✅ | ✅ | — | — | — | — | — |
| Reviews: create/flag | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ (verified stay) |
| Reviews: moderate | ✅ | ✅ | — | 🏠 (own property) | — | — | — |
| Reviews: read aggregates | 🔓 public |
| Visitors: create | ✅ | ✅ | — | ✅ | ✅ | — | 👤 (host) |
| Visitors: approve/reject | ✅ | ✅ | — | 🏠 | 🏠 | 🏠 | 👤 (own) |
| Visitors: validate/check-in/out | ✅ | ✅ | — | 🏠 | 🏠 | 🏠 | — |

🏠 = owner/manager-of-property (service re-checks `owner_id`/`property_manager_assignments`). 👤 = self/own resource. Backend remains the hard authz boundary.

---

## 7. Implementation order & exit gates
Phase 1 **Payments + Invoices** → Phase 2 **Collections** → Phase 3 **Notifications** → Phase 4 **Reviews** → Phase 5 **Visitors**.
After each: `nx build api` green · `nx test <lib>` green · migration runs · routes mounted (401 unauth) · docs updated. **Stop on any red.**
