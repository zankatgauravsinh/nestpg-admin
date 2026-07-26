# Runbook: High Booking Failure Rate

**Symptoms:** elevated 4xx/5xx on `/bookings`/`/reservations`; `bookingSuccessRate` drop (`GET /admin/ops/metrics`).

## Triage
1. `GET /admin/ops/integrity` → bed/booking/reservation drift (e.g., RESERVED-without-reservation).
2. `GET /admin/ops/metrics` → reservation/booking success rates.
3. Check logs for `BED_NOT_AVAILABLE` / `BED_HAS_ACTIVE_BOOKING` / lock contention.

## Mitigation
- Drift detected: investigate manually (NO auto-repair); correct via owner/ops flows.
- Contention: check DB load and Redis bed-lock health; single-writer invariants are DB-enforced.
