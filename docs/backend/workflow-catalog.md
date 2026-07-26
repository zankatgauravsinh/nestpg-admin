# NestPG PMS — Workflow & State-Machine Catalog

> Traced from services (`*.service.ts`), consumers, jobs, and `EVENTS` constants.
> Documentation only.

## 1. Property creation → activation

```
POST /properties (PG_OWNER)            → DRAFT  (ownerId = creator)
POST /properties/:id/buildings         → Building
POST /buildings/:id/floors             → Floor
POST /floors/:floorId/rooms            → Room (capacity from roomType)
POST /rooms/:roomId/beds               → Bed (AVAILABLE)
POST /properties/:id/submit (owner)    → PENDING_REVIEW
PUT  /properties/:id/verify (ops)      → ACTIVE        (now searchable: GET /properties)
PUT  /properties/:id/reject (ops)      → REJECTED {reason}
```
Only **ACTIVE** properties appear in the public `GET /properties` search. The owner sees DRAFT/own via `GET /properties/my`. Bed counts shown anywhere come from a **live aggregation over `beds`**, not the denormalized counters.

**Property state machine**
```
DRAFT ──submit──▶ PENDING_REVIEW ──verify──▶ ACTIVE ──(pause)──▶ PAUSED
                       │                         │
                       └──reject──▶ REJECTED     └──(archive)──▶ ARCHIVED
```

## 2. Booking lifecycle (reservation → checkout)

```
POST /reservations              AVAILABLE bed → RESERVED, BedReservation ACTIVE (TTL 2h)
   │  (redis lock 30s; one active hold per tenant per bed)
POST /bookings (convert-only)   reservation ACTIVE → CONVERTED; Booking CONFIRMED; bed OCCUPIED
POST /bookings/:id/check-in     CONFIRMED → CHECKED_IN (actualCheckInAt set)
POST /bookings/:id/notice       records ExpectedMoveOut; bed VACATING_SOON
POST /bookings/:id/check-out    CHECKED_IN → CHECKED_OUT; bed → AVAILABLE; BedOccupancyHistory closed
POST /bookings/:id/cancel       PENDING|CONFIRMED → CANCELLED; bed released
POST /bookings/:id/no-show      CONFIRMED → NO_SHOW (only after checkInDate passed)
```

**Booking state machine + guards**
```
            ┌────────── cancel ──────────┐
            ▼                            │
PENDING ──(expire: payment window)──▶ EXPIRED
   │
   └─ convert ▶ CONFIRMED ──check-in──▶ CHECKED_IN ──check-out──▶ CHECKED_OUT
                   │                        │
                   ├─ no-show ▶ NO_SHOW     └─ notice (stays CHECKED_IN, sets move-out)
                   └─ cancel  ▶ CANCELLED
```
Transition guards (rejection codes): check-in requires `CONFIRMED` (`BOOKING_NOT_CONFIRMED`) and not already checked in (`ALREADY_CHECKED_IN`), bed not `OCCUPIED` (`BED_ALREADY_OCCUPIED`); check-out requires `CHECKED_IN` (`BOOKING_NOT_CHECKED_IN`); cancel requires `PENDING|CONFIRMED` (`BOOKING_NOT_CANCELLABLE`); no-show requires `CONFIRMED` + check-in date passed (`CHECK_IN_DATE_NOT_PASSED`). Every transition writes `booking_history` and emits a `booking.*` event in the same transaction (outbox).

**Note:** there is **no public "create PENDING booking + pay later" endpoint** — `POST /bookings` is convert-only from a reservation and lands directly in `CONFIRMED`. PENDING/EXPIRED exist for internal/payment-window flows.

## 3. Reservation expiry

`bed_reservations` with `status=ACTIVE AND expires_at < NOW()` are expired by the **reservation-expiry cron (every 5 min)** → reservation `EXPIRED`, bed back to `AVAILABLE`, emits `reservation.expired`.

## 4. Corporate flow
```
POST /corporate/accounts                 → corporate_accounts (CORP_HR)
POST /corporate/agreements               → corporate_bookings (requested beds)
POST /corporate/agreements/:id/assign-bed→ allocate a bed to an employee tenant (confirmed++)
POST /corporate/agreements/:id/cancel    → cancel agreement, release beds
```
Emits `corporate.account_created`, `corporate.agreement_created`, `corporate.bed_allocated`, `corporate.agreement_confirmed/cancelled`.

## 5. KYC flow
```
POST /kyc/me                              → bootstrap NOT_STARTED
POST /uploads/presign  (scope=kyc)        → presigned PUT to PRIVATE kyc/{userId}/…
PUT  uploadUrl (browser → MinIO/S3)       → object stored privately
POST /kyc/me/documents {docType,key}      → verify prefix+exists; KycDocument; status SUBMITTED; emit kyc.submitted
POST /kyc/:userId/review {decision,reason}→ APPROVED|REJECTED; writes kyc_reviews; emit kyc.approved/rejected
GET  /kyc/:userId/documents (reviewer)    → list keys
POST /uploads/presign-get {key}           → 60s signed GET (self/admin only) to view a doc
```
KYC objects are **never public**.

## 6. Payments / Invoices — NOT IMPLEMENTED
There is **no Payment, Invoice, Collection, or Refund controller/entity/service**. The frontend "Payments/Collections/Finance" screens are derived from **booking amount fields** (`rentPaisa`, `securityDepositPaisa`, `advancePaisa`, `totalPaidPaisa`, `paymentMode`) — there is no payment ledger, gateway webhook ingestion table, or refund flow in the backend. (`PayGateway` enum and `webhook_events` migration exist as scaffolding only.) This is the single biggest backend gap — see the quality audit.

## 7. Waitlist flow
```
POST /waitlist                → WAITING
[bed becomes AVAILABLE]       → waitlist-notification cron (every 10 min) matches & NOTIFIES (status NOTIFIED, emit waitlist.notified)
DELETE /waitlist/:id          → CANCELLED
```

## 8. Events (EventEmitter → Outbox → relay)

All domain events are persisted to an **outbox** table inside the writing transaction, then relayed asynchronously (transactional outbox pattern), and also emitted in-process via `@nestjs/event-emitter` for consumers.

| Event | Producer | Consumer / Side effect |
|-------|----------|------------------------|
| `reservation.created` | ReservationService.create | metrics.consumer (counter) |
| `reservation.expired` | reservation-expiry job | reservation-events.consumer → free bed |
| `reservation.converted` | ReservationService.convert | — |
| `booking.confirmed` | BookingService.convert | booking-events.consumer; metrics |
| `booking.checked_in` | BookingService.checkIn | booking-events.consumer; metrics |
| `booking.checked_out` | BookingService.checkOut | booking-events.consumer; metrics; frees bed |
| `booking.no_show` | BookingService.markNoShow | — |
| `booking.notice_given` | BookingService.giveNotice | expected-move-out tracking |
| `bed.available/occupied/vacating_soon/transferred` | beds/booking services | inventory updates |
| `corporate.*` | CorporateBookingService | — |
| `kyc.submitted/approved/rejected` | KycService | — |
| `waitlist.joined/notified` | Waitlist services | waitlist-events.consumer (notify) |

## 9. Scheduled jobs (NestJS `@Cron`, Asia/Kolkata)

| Job | Schedule | Purpose |
|-----|----------|---------|
| reservation-expiry | `*/5 * * * *` | expire stale holds, free beds |
| booking-expiry | `*/5 * * * *` | expire unpaid PENDING bookings |
| no-show-detection | `0 * * * *` | flag CONFIRMED past check-in as NO_SHOW |
| waitlist-notification | `*/10 * * * *` | match freed beds to waitlist, notify |
| expected-move-out | `0 1 * * *` | process upcoming/overdue move-outs |
| occupancy-snapshot | `59 23 * * *` | nightly `occupancy_snapshots` rollup |
| outbox-relay | (relay loop) | publish outbox events to subscribers |
| outbox-cleanup | `0 3 * * *` | prune delivered outbox rows |

## 10. Concurrency & integrity primitives
- **Redis lock** (`SET NX EX 30`) around reservation creation prevents double-holding a bed.
- **Transactional outbox** (`BookingTransactionService.run` + `writeOutbox`) guarantees event delivery matches committed state.
- **Row locks** on reservation/booking conversion re-assert ownership inside the transaction (`expectedTenantId`).
- **Booking numbers** are gap-tolerant monthly sequences (`booking_sequences`).
- `preparedStatements: false` everywhere (PgBouncer transaction-pool compatible).
