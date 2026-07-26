# Runbook: Database (PostgreSQL) Outage

**Symptoms:** `/health` → `checks.database.status=down`; 5xx on write routes; relay/jobs erroring.

## Triage
1. `GET /health` and `GET /api/v1/admin/ops/deployment` → confirm `dbConnectivity=false`.
2. Check Postgres container/instance: `docker ps`, `pg_isready -h $DB_HOST`.
3. Inspect connections/pool exhaustion; review recent deploys/migrations.

## Mitigation
- Restart/restore the Postgres instance; fail over to replica if configured.
- Once DB is back: jobs resume on next tick (cron-locked, idempotent); no manual replay needed.
- Outbox `PENDING` events relay automatically once DB + relay are healthy.

## Verify recovery
- `/health` database=up; `GET /admin/ops/integrity` status=OK; `GET /admin/ops/recovery` relay lag normal.
