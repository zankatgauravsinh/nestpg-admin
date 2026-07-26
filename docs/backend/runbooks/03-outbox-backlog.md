# Runbook: Outbox Backlog (PENDING growth)

**Symptoms:** `GET /admin/ops/outbox` pending rising; `relayLagMinutes` high; alert `OUTBOX_PENDING_BACKLOG`/`OUTBOX_PENDING_AGE`.

## Triage
1. `GET /admin/ops/outbox/analytics` → `pendingByEventType`, `oldestFailedMinutes`.
2. `GET /admin/ops/recovery` → relay `lastCompletedAt` / `lastStatus`.
3. Confirm relay running: `GET /admin/ops/jobs` (job `outbox-relay`).

## Mitigation
- If relay stalled: check DB connectivity + scheduler; the `@Interval` resumes automatically.
- If a slow consumer blocks: investigate the listener; relay is at-least-once and idempotent.
