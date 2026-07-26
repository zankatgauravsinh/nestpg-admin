# Runbook: Scheduler Stalled

**Symptoms:** stalled alerts (`*_STALLED`); `GET /admin/ops/jobs` shows old `lastCompletedAt`.

## Triage
1. `GET /admin/ops/recovery` → `stalledJobs`, `jobsExecuted`.
2. `GET /health` scheduler.status; confirm process up (single instance holds cron lock).
3. Check for a crashed process holding a cron lock until TTL expiry.

## Mitigation
- Restart the API process; locks auto-expire (Redis EX TTL); jobs resume next tick (idempotent).
- For long-held locks after a crash, wait out TTL or clear the specific `advisory:*` key.
