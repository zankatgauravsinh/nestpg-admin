# NestPG — Pilot Release Plan

Goal: validate real-world workflows with a small, supported cohort before a wider rollout. Feature-frozen during the pilot.

## Pilot users
- 1–2 **PG owners** (real properties, real inventory already onboarded).
- 2–3 **property managers / caretakers** operating those properties day-to-day.
- 10–20 **residents** across the pilot properties (self-service reservations, payments, visitors).
- 1 **ops admin** (internal) monitoring the Operations Center dashboard.

## Duration
- 1–2 weeks of real usage. No planned feature work during the window.

## Feedback process
- Weekly 30-min check-in with owners + managers.
- In-app / shared channel for residents to report friction.
- Ops admin reviews `Operations Center` (`/admin/system`) daily: alerts, API latency, queue backlog, job failures.

## Bug reporting
- Every report captures the **`x-request-id`** from the failing response (surfaced in error responses) so backend logs can be correlated instantly.
- Triage: CRITICAL (blocks money/occupancy) → same-day; MAJOR → within pilot; MINOR → backlog.
- Reproduce against the live smoke checklist (`RC2` §Smoke) before fixing.

## Support
- Named on-call engineer for the pilot window.
- Runbook: health = `/health`; metrics = `/admin/metrics`; alerts = `/admin/dashboard/alerts`.
- Escalation path documented for db/redis/storage CRITICAL alerts.

## Success metrics
- ≥ 95% success rate on the core journeys (reservation → booking → check-in; invoice → payment; visitor lifecycle; check-out).
- API p95 latency < 500ms, p99 < 2s under pilot load.
- Zero unresolved CRITICAL alerts; outbox backlog stays < 100; zero payment/finance data-integrity issues.
- Positive qualitative feedback from owners/managers on daily operations.

## Known constraints during pilot (set expectations)
- **Reservations are resident self-service** — operators cannot yet reserve/convert bookings on behalf of walk-in residents (documented design gap; see RC1 report). Pilot residents should self-reserve.
- External notification channels (email/SMS/WhatsApp/push) are OFF unless `NOTIF_*_WEBHOOK_URL` is configured; IN_APP notifications always work.

## Exit criteria (pilot → wider rollout)
- All CRITICAL and MAJOR pilot bugs resolved and re-verified.
- Success metrics met for the full window.
- A go/no-go review with owners + engineering.
- Decision recorded on the operator on-behalf-booking gap (implement vs. stay resident-self-service).
