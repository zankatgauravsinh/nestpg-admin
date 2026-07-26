# Production Go-Live Checklist — NestPG

## Infrastructure
- [ ] **Dockerfile** for the API (multi-stage; `nx build api` → `node dist/apps/api/main.js`) — **MISSING, build before go-live**
- [ ] Production `docker-compose`/orchestrator manifest incl. the API service (compose today is DB+Redis only)
- [ ] Process manager / orchestrator (PM2, systemd, or k8s Deployment) — **MISSING**
- [ ] Reverse proxy (nginx/ALB) with TLS termination — **MISSING**
- [ ] `start:prod` script / container entrypoint

## Database (PostgreSQL 17)
- [ ] Managed/HA instance with automated **backups + PITR** (no backup metadata exists today)
- [ ] Connection pooling sized; `DATABASE_URL` set
- [ ] Migrations applied (V2_*/V3_* chain); autovacuum tuning (V3_018) in effect
- [ ] Read replica for reporting (optional)

## Redis 7
- [ ] Managed/HA Redis; `REDIS_HOST`/`REDIS_PORT` set
- [ ] Persistence/eviction policy reviewed (used for cron locks, throttle counters, notification dedupe)
- [ ] Note fail modes (see /admin/ops/redis): CronLock FAIL_CLOSED, throttle/dedupe FAIL_OPEN

## Monitoring
- [ ] `/health` wired to liveness/readiness probes
- [ ] Scrape `/admin/ops/{metrics,alerts,jobs,recovery,outbox/analytics}`
- [ ] Log aggregation (structured job logs: jobName/jobRunId/duration_ms)

## Backups
- [ ] DB automated backups + tested restore runbook — **PREREQUISITE MISSING**
- [ ] Backup metadata surfaced to ops (deferred — no source yet)

## Alerts
- [ ] Page on `OUTBOX_FAILED_EVENTS` (CRITICAL)
- [ ] Warn on `*_STALLED`, `OUTBOX_PENDING_*`, relay lag
- [ ] DB/Redis down (health), connection-pool saturation

## Security
- [ ] All secrets via env (`JWT_SECRET`, `DATABASE_URL`, `FIELD_ENCRYPTION_KEY`) — never committed
- [ ] Rate limiting active (Redis-backed) on auth routes
- [ ] Admin/ops routes behind JwtAuthGuard + RolesGuard (SUPER_ADMIN/OPS_ADMIN)
- [ ] helmet + CORS allow-list (`ALLOWED_ORIGINS`) configured
- [ ] TLS enforced at proxy

## Scaling
- [ ] Multi-instance verified: throttling + notification dedupe are Redis-shared (Phase 15)
- [ ] Outbox relay singleton via cron lock; SKIP LOCKED safe under N instances
- [ ] Horizontal pod autoscaling thresholds

## Incident Response
- [ ] Runbooks published (docs/runbooks/) and on-call trained
- [ ] Escalation path + ownership defined
