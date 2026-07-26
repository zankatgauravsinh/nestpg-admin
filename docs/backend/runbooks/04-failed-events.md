# Runbook: Failed Outbox Events

**Symptoms:** alert `OUTBOX_FAILED_EVENTS` (CRITICAL); `GET /admin/ops/outbox` failed>0.

## Triage
1. `GET /admin/ops/outbox/failed` → inspect `eventType`, `retryCount`, `lastError`.
2. Identify root cause (consumer bug, bad payload, downstream outage).

## Recovery (operator-initiated, after root cause fixed)
- Single: `POST /api/v1/admin/ops/outbox/requeue/:id` (FAILED → PENDING).
- Bulk: `POST /api/v1/admin/ops/outbox/requeue-all` → `{updated}`.
- Relay re-delivers on the next tick. Never requeue before fixing the cause (will re-fail to 5 retries).
