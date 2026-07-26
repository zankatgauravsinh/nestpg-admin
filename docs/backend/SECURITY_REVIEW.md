# Phase 18 Security Review — NestPG

## Authentication & Rate Limiting
- Auth bootstrap routes (register/login/verify-otp/send-otp/refresh) are public by design (no global guard).
- **Rate limiting ACTIVE** (Redis-backed, multi-instance): login 5/15m, send-otp & verify-otp 3/10m, refresh 10/1m.
  Fail-open on Redis outage (logged). 429s logged with route/ip/ua/timestamp/profile (no PII/secrets).

## Authorization
- All write routes carry `@UseGuards` (method or class level); no unprotected writes.
- Admin/ops routes (`/api/v1/admin/ops/*`) + audit + dashboard: `JwtAuthGuard + RolesGuard`, roles `SUPER_ADMIN`/`OPS_ADMIN` (dashboard also OWNER/MANAGER/FINANCE).
- Domain ownership enforced dual-layer (guards + in-transaction asserts).

## Secrets
- `JWT_SECRET`, `DATABASE_URL`, `FIELD_ENCRYPTION_KEY` sourced from env; `AuthModule` throws at boot if `JWT_SECRET` missing.
- `GET /admin/ops/environment` reports **names only** — never values.
- PII fields (aadhaar/pan) stored via encrypting transformer (`FIELD_ENCRYPTION_KEY`).

## Diagnostics safety
- All Phase 17/18 ops endpoints are read-only `SELECT`/PING; expose counts/sizes/status only — no payload bodies, no secrets.
- `/health` returns component status + outbox counts only (safe for probes).

## Residual risks
- No TLS/reverse-proxy/WAF in repo (deploy-time infra).
- No DB backup/restore metadata (DR gap — Phase 17 Rule-9 stop).
- Throttle fail-open: a Redis outage disables auth rate limiting (availability trade-off).
