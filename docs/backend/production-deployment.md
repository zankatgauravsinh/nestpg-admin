# Production Deployment Guide — NestPG (release/rc1)

## 1. Environment Variables
| Variable | Required | Notes |
|---|---|---|
| `JWT_SECRET` | ✅ | Access-token signing; app **fails to boot** if unset |
| `DATABASE_URL` | ✅ | `postgres://user:pass@host:5432/db` |
| `REDIS_HOST` / `REDIS_PORT` | ✅ | cron locks, throttling, notification dedupe |
| `FIELD_ENCRYPTION_KEY` | ✅ | encrypts PII (aadhaar/pan) at rest |
| `NODE_ENV` | ✅ | `production` disables SQL query logging + sets secure cookies |
| `PORT` | – | default 3000 |
| `ALLOWED_ORIGINS` | – | CORS allow-list (comma-separated) |
| `SENTRY_DSN` | – | enables Sentry **only if set** and `@sentry/node` installed |
| `BED_RESERVATION_TTL_HOURS` / `BOOKING_PAYMENT_WINDOW_MINUTES` / `WAITLIST_NOTIFICATION_WINDOW_HOURS` | – | business timers (defaults 2 / 30 / 2) |

## 2. Migration Procedure
Migrations are **NOT** run at app boot. Run them as a separate release step:
```
npm run migrate:run     # ts-node typeorm migration:run --dataSource apps/api/src/config/typeorm.datasource.ts
```
- Idempotent: only unapplied migrations run. Verify: `SELECT * FROM migrations ORDER BY timestamp DESC LIMIT 5;`
- Deploy order: **migrate → deploy app**. The standalone DataSource owns migrations; the runtime DataSource uses `autoLoadEntities` only.

## 3. Backup Strategy
- Daily `pg_dump` + 14-day retention + gzip integrity check: `deploy/backup/backup.sh` (cron in `deploy/backup/crontab`).
- Optional offsite via `S3_BUCKET`. Weekly restore drill: `deploy/backup/restore-verify.sh` (measures RTO; RPO ≤ 24h — tighten with managed PITR).
- See `docs/DISASTER_RECOVERY.md`.

## 4. Redis Requirements
- Redis 7+, persistence (`appendonly yes`). Used for: cron locks (FAIL-CLOSED), auth rate-limit counters (FAIL-OPEN), notification dedupe (FAIL-OPEN), reservation bed locks (degrades to DB lock).
- For multi-instance, all app nodes must share **one** Redis (counters/dedupe are shared).

## 5. PostgreSQL Requirements
- PostgreSQL 17. Extensions: `uuid-ossp`/`pgcrypto` (gen_random_uuid). Autovacuum tuned for high-churn tables (V3_018).
- Connection pooling (PgBouncer transaction mode supported — `preparedStatements:false` already set).

## 6. Rollback Procedure
1. **App:** redeploy the previous image tag (`docker compose -f docker-compose.prod.yml up -d` with prior `nestpg-api:<sha>`).
2. **DB:** migrations are reversible — `npm run migrate:revert` reverts the latest migration (repeat per migration). Restore from backup only if a migration is destructive.
3. Outbox `PENDING` events relay automatically post-rollback; jobs are idempotent and resume.

## 7. Local Environment Safety (macOS shadowing)
A host **brew Postgres (:5432)** or **Redis (:6379)** can SHADOW the Docker stack for `localhost` connections, silently routing app traffic to the wrong instance.
- **Detection:** the app logs a `[env-safety]` WARNING at boot if it finds a local service on 5432/6379 while using localhost.
- **Mitigation:** `brew services stop postgresql@14` and `brew services stop redis`, or remap the Docker ports. (Production uses managed hosts → no shadow risk.)

## 8. Observability
- `/health` — liveness/readiness (db/redis/scheduler/outbox).
- `/metrics` — Prometheus text (login/otp/reservation/booking/checkin/checkout counters + occupancy_ratio gauge).
- `/api/v1/admin/ops/*` — metrics, alerts, jobs, recovery, integrity, outbox analytics (SUPER_ADMIN/OPS_ADMIN).
- Sentry: set `SENTRY_DSN` and `npm install @sentry/node@^7` to capture 5xx + unhandled + job failures.
