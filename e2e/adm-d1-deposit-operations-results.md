# ADM-D.1 — Admin deposit operations (E2E, real API)

Run 2026-10-11T06:12:21.578Z · 30 passed · 0 failed

| Section | Check | Result | Detail |
|---|---|---|---|
| 0-setup | [fixture] owner-finalized settlement with two lines on an offline-collected deposit | PASS | 201  |
| 1-queue | [1] SUPER, OPS and FINANCE open the queue (200); the new case is listed | PASS | 200/200/200 |
| 1-queue | [2] paging meta is {page, limit, total} — no totalPages | PASS | {"page":1,"limit":20,"total":1} |
| 1-queue | [2] filters narrow (targetType + bookingId → none yet; propertyId + limit=1 → 1 row), invalid status / limit → 400 | PASS | 0/1/400/400 |
| 1-queue | [2] server order: OPEN cases first | PASS | rows=1 |
| 3-detail-notes | [3] detail: identity, booking number, target facts (settlement + the disputed line), events | PASS | 200 |
| 3-detail-notes | [4] OPS and FINANCE add notes (201, {disputeId, eventId}); blank → 400 DISPUTE_NOTE_REQUIRED; owner → 403 | PASS | 201/201/400/403 |
| 3-detail-notes | [4] notes are admin-only: the party view never carries them | PASS |  |
| 7-resolve | [12] OPS cannot resolve (403); missing version → 400 …RESOLUTION_VERSION_REQUIRED; non-UPHELD + effect → 400 …EFFECT_REQUIRES_UPHELD | PASS | 403/DISPUTE_RESOLUTION_INVALID:RESOLUTION_VERSION_REQUIRED/DISPUTE_RESOLUTION_INVALID:EFFECT_REQUIRES_UPHELD |
| 7-resolve | [7] FINANCE resolves UPHELD + SETTLEMENT_SUPERSEDED (200) | PASS | 200  |
| 7-resolve | [8] resolution alone executes NOTHING: effectExecuted false, no EFFECT_EXECUTED, the settlement chain byte-identical, still the live settlement | PASS |  |
| 5-admin-case-blocks | [5] OPS opens an admin case on the other line (201, openedSide ADMIN) | PASS | 201  |
| 5-admin-case-blocks | [5] a second case on the same settlement family → 409 DISPUTE_ALREADY_OPEN with details.disputeId | PASS | 409 DISPUTE_ALREADY_OPEN |
| 5-admin-case-blocks | [12] OPS cannot execute (403); a body key → 400 | PASS | 403/400 |
| 5-admin-case-blocks | [11] execution blocked by the OPEN admin case: 409 DISPUTE_EFFECT_BLOCKED_BY_OPEN_CASE with blockingDisputeId; nothing written; a failure row kept | PASS | 409 {"disputeId":"5b368490-d295-478e-89a7-89a3934ff64d","blockingDisputeId":"480e3667-c38f-45c2-b171-d051f95778e2","blockingTargetType":"SETTLEMENT"} |
| 6-withdraw | [13] the owner cannot use the admin withdraw route (403); a party case is never withdrawn by an admin | PASS | 403/403 DISPUTE_NOT_ADMIN_OPENED |
| 6-withdraw | [6] OPS withdraws its OWN admin case (200 WITHDRAWN); a second withdraw → 400 DISPUTE_NOT_OPEN | PASS | 200/400 |
| 9-execute | [10] before execution the case reads "recorded, not applied" (effectExecuted false) | PASS |  |
| 9-execute | [9] FINANCE applies the outcome separately (200): effectExecuted true, ref = the new live settlement (PENDING, Wall line removed) | PASS | 200  |
| 9-execute | [10] the detail reflects it only after the backend confirmed: effectExecuted true + EFFECT_EXECUTED row | PASS |  |
| 9-execute | [16] M-C.4 invariant: the original settlement + its lines are byte-identical after execution | PASS |  |
| 9-execute | [16] idempotent: a repeat returns the recorded result, no second superseder | PASS |  |
| 6b-party-reconsider | [6] SUPER has no override: an OPEN party case → 403 DISPUTE_NOT_ADMIN_OPENED | PASS | 201/403 |
| 6b-party-reconsider | [7] NONE resolution is executed at resolution (nothing to apply) | PASS |  |
| 6b-party-reconsider | [5] reconsideration through the same endpoint (201): supersedes link, the parent shows supersededByDisputeId | PASS | 201  |
| 6b-party-reconsider | [6] FINANCE (RESOLUTION holder) may withdraw an admin case it did not open (200) | PASS | 200  |
| 13-denied | [13] owner / resident / another resident → 403 on queue, detail, history, resolve, admin open; anonymous → 401 | PASS | 403/403/403/403/403/403/401 |
| 14-history-privacy | [14] deposit history for SUPER / OPS / FINANCE (200): both settlements, the chain link, the disputes | PASS | 200/200/200 |
| 14-history-privacy | [15] privacy: no raw transaction payload, no private settlement reason, no offline note, no token-like secrets in the admin projections | PASS |  |
| 14-history-privacy | case T=5b368490-d295-478e-89a7-89a3934ff64d admin S=480e3667-c38f-45c2-b171-d051f95778e2 party P=5d95a198-7df1-4f0b-99d5-3ee79960152e reconsideration R=976d70c1-e8aa-4e10-be60-f92377ec6db3; live settlement 1413df23-decf-46b3-b780-f38b20c3d3b6 revises 8756710c-7ea5-4945-8b4b-5146c6a6963e | OBS |  |
| cleanup | baseline restored (bookings, payments, refunds, transactions, deposits, settlements, deductions, offline events, disputes, events, deposit notifications) | PASS | {"bookings":"1351","pay":"232","refunds":"33","ptx":"202","dep":"25","collected":"0","settlements":"0","deductions":"0","offline":"0","disputes":"0","disputeEvents":"0","disputeNotifs":"96"} → {"bookings":"1351","pay":"2 |