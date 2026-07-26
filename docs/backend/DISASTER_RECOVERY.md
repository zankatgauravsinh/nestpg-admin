# Disaster Recovery Plan — NestPG

## Objectives
- **RPO (Recovery Point Objective): ≤ 24h** — daily `pg_dump` (deploy/backup/backup.sh @ 02:30 UTC).
  Tighten to minutes by enabling WAL archiving / PITR or a managed DB with continuous backup.
- **RTO (Recovery Time Objective): ≤ 30 min** — single-file restore via deploy/backup/restore.sh;
  measured automatically by the weekly drill.

## Backup
- Daily compressed `pg_dump` with 14-day local retention; optional offsite to S3 (`S3_BUCKET`).
- Integrity verified at write time (`gzip -t`).

## Restore
- `deploy/backup/restore.sh <file.sql.gz> <TARGET_URL>` — full logical restore.
- App needs no replay: outbox `PENDING` events relay automatically; jobs resume (cron-locked, idempotent).

## Restore Drill (validation)
- `deploy/backup/restore-verify.sh` (weekly cron): restores latest backup into a scratch DB,
  verifies `bookings`/`users` row counts, measures RTO, reports PASS/FAIL.

## DR runbooks
See docs/runbooks/ (DB outage, Redis outage, outbox backlog, failed events, scheduler stalled).

## Stateful components
- **PostgreSQL** — authoritative; backed up. **Redis** — locks/counters/dedupe only (no durable
  business data); rebuilds on restart (fail-open/closed documented in GET /admin/ops/redis).
