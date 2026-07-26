# NestPG — Production Deployment Checklist

Last updated: RC3. Covers the `api` (NestJS) and `web-admin` (Angular) apps.

## Infrastructure
- [ ] Compute for `api` (Node 22) and static hosting/CDN for `web-admin` build output.
- [ ] Managed PostgreSQL 15+ (with automated backups — see Backups).
- [ ] Managed Redis 7+ (persistence enabled; used for reservation locks, cron locks, token revocation, rate-limit counters).
- [ ] S3-compatible object storage (AWS S3 / Cloudflare R2 / MinIO) with a private media bucket.
- [ ] Reverse proxy / load balancer terminating TLS and forwarding `X-Request-Id`.

## Environment
- [ ] Populate every **[REQUIRED]** var from `backend/.env.example` (Database, Redis, JWT, Encryption, App, Storage).
- [ ] `JWT_SECRET` and `FIELD_ENCRYPTION_KEY` are strong random values from a secret manager — never committed.
- [ ] `NODE_ENV=production` (disables the dev-only OTP log line).
- [ ] `ALLOWED_ORIGINS` set to the production web-admin origin(s) ONLY.
- [ ] Optional integrations set only if used: `RAZORPAY_*`, `MSG91_*`, `NOTIF_*_WEBHOOK_URL`.

## Secrets
- [ ] All secrets injected via environment / secret manager (not baked into images).
- [ ] Rotate DB, Redis, Razorpay, JWT, and encryption keys on a schedule.

## SSL / DNS
- [ ] Valid TLS certificate; HTTP→HTTPS redirect.
- [ ] DNS records for the API and web-admin hostnames; health-check path `/health` allowed through the proxy.

## Database
- [ ] Run migrations before starting the app (28 applied as of RC2; verify `migrations` table).
- [ ] Confirm connection pool sizing matches instance count.
- [ ] Verify `/admin/metrics` → `database.status: up` with sane connection counts.

## Redis
- [ ] Reachable from all API instances; `/health` → `redis: up`.
- [ ] Eviction policy suitable for locks (do NOT evict lock keys under memory pressure).

## Storage
- [ ] Bucket created; CORS + lifecycle rules applied; `/health` → `storage: up`.
- [ ] Presigned URL TTLs reviewed (`UPLOAD_URL_TTL`, private GET TTL).

## Cron / Background workers
- [ ] Scheduler runs (either a single scheduler instance, or rely on `CronLockService` Redis advisory locks for multi-instance safety).
- [ ] Confirm jobs registered via `/health` (`scheduler.cronJobs > 0`) and `/admin/metrics` (`queues.jobs`).
- [ ] Jobs are idempotent + `SKIP LOCKED` guarded (reservation-expiry, invoice-overdue, reminders, outbox relay, visitor-expiry, occupancy-snapshot).

## Monitoring & Alerts
- [ ] Scrape `GET /metrics` (Prometheus text) and/or poll `GET /admin/metrics` (JSON).
- [ ] Poll `GET /admin/dashboard/alerts`; page on CRITICAL (db/redis/storage down), ticket on WARNING (outbox backlog > 500, failed events, job failures, high API p99).
- [ ] Alert on `outbox.failed > 0` and `notification failures`.
- [ ] Every request carries `x-request-id` (echoed in responses) for log correlation.

## Scaling
- [ ] `api` is stateless → scale horizontally behind the LB.
- [ ] Shared state (locks, revocation, rate limits) lives in Redis → safe across instances.
- [ ] Watch API p95/p99 latency and DB connection saturation via the dashboard.

## Backups
- [ ] Automated daily PostgreSQL backups with retention + periodic restore drills.
- [ ] Object-storage versioning/backup for the media bucket.
- [ ] **Gap:** the app does not currently manage or verify backups itself — this is delegated to the managed DB/storage provider. `/health` does not assert backup freshness (see Known Limitations).

## Disaster Recovery
- [ ] Documented RTO/RPO; tested restore of DB + Redis + storage into a clean environment.
- [ ] Rollback: `api`/`web-admin` are stateless — redeploy the previous image/build tag. Migrations expose `down()`; roll back a schema step only if the new columns are not yet written.
