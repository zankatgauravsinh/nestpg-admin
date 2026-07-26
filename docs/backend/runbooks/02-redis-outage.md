# Runbook: Redis Outage

**Symptoms:** `/health` redis=down; warnings `Redis ... failing open`; jobs skipped.

## Per-subsystem behavior (see GET /admin/ops/redis)
- **CronLockService — FAIL_CLOSED:** jobs skip runs (no duplication); resume when Redis returns.
- **Throttler — FAIL_OPEN:** auth rate limits allow traffic (logged) — brute-force protection degraded.
- **Notification dedupe — FAIL_OPEN:** delivery proceeds (possible duplicates).
- **Reservation bed lock — DEGRADES:** DB `SELECT FOR UPDATE` remains authoritative; correctness preserved.

## Mitigation
- Restart/restore Redis; confirm `GET /admin/ops/redis` `redisReachable=true`.
- No data repair required (Redis holds only locks/counters/dedupe TTLs).
