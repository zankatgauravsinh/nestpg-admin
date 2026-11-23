// ADM-D.1 — Admin deposit-operations console: the backend contract the console uses,
// proven on the REAL API + PostgreSQL (backend M-C.4.0–M-C.4.5, unchanged by ADM-D.1).
//
// Covers: queue access + filters + paging meta; detail projection; notes; an admin-created
// case (+ its freeze); withdrawal authority (own / RESOLUTION holder / party case / resolved);
// resolution that records only (the settlement is byte-identical afterwards); an execution
// blocked by another OPEN case (409 + blockingDisputeId) and then applied separately (the
// original settlement still byte-identical; idempotent repeat); OPS / owner / resident denial;
// booking deposit history; reconsideration; privacy (no raw payload, no private settlement
// reason, no offline note). The refund reconciliation endpoint is never called.
// Conventions: standalone Node 22 script like backend/e2e (psql single-line SQL, IST dates,
// Connection: close); fixtures are cleaned in dependency order and the DB baseline is verified.
//
// Target: the DISPOSABLE E2E stack only. Importing the backend's e2e/stack/target.mjs runs
// its fail-closed guard (stack DB proven by marker + cluster id, API proven by the stack
// sentinel login) and exits before any request if the stack is not up. There is no
// fallback to the developer database or API.
//
//   node nestpg-admin/e2e/adm-d1-deposit-operations.e2e.mjs        (stack up + stack.mjs api)
import { E2E } from '../../nestpg-backend/backend/e2e/stack/target.mjs';
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const API = E2E.apiBase;
const DSN = E2E.dsn;
const OUT = process.env.ADMD1_OUT ?? new URL('./adm-d1-deposit-operations-results.md', import.meta.url).pathname;
const BACKEND = new URL('../../nestpg-backend/backend/', import.meta.url).pathname;
// The backend checkout's jsonwebtoken, and the STACK's JWT secret (never the developer backend/.env).
const jwt = createRequire(BACKEND + 'package.json')('jsonwebtoken');
const JWT_SECRET = (readFileSync(E2E.envFile, 'utf8').match(/^JWT_SECRET=(.*)$/m) || [])[1]?.trim().replace(/^"|"$/g, '');
const VERSION = 'offline-financial-v1';
const RVERSION = 'dispute-resolution-v1';

const rows = []; let cur = 'setup'; let passed = 0; let failed = 0;
const sql = (q) => { try { return execSync(`psql "${DSN}" -Atc ${JSON.stringify(q)}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch (e) { return 'SQL_ERROR ' + (e.stderr || '').toString().split('\n')[0]; } };
const firstLine = (v) => String(v).split('\n')[0];
const actors = {};
async function raw(method, path, body, { token } = {}) {
  const h = { 'Content-Type': 'application/json', Connection: 'close' };
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(API + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let json = null; try { json = await res.json(); } catch { /* empty */ }
  return { status: res.status, data: json?.data, meta: json?.meta, code: json?.errors?.[0]?.code, message: json?.errors?.[0]?.message, details: json?.errors?.[0]?.details, json };
}
const call = (actor, method, path, body) => raw(method, path, body, { token: actors[actor]?.token });
function ok(name, cond, detail = '') {
  const result = cond ? 'PASS' : 'FAIL'; if (cond) passed++; else failed++;
  rows.push({ section: cur, name, detail: String(detail).slice(0, 220), result });
  console.log(`${result.padEnd(5)} [${cur}] ${name}${detail ? ' — ' + detail : ''}`);
}
const obs = (m) => { rows.push({ section: cur, name: m, detail: '', result: 'OBS' }); console.log(`OBS   [${cur}] ${m}`); };
function mintById(name, id) { if (!id || String(id).startsWith('SQL_ERROR')) return false; const [phone, role] = sql(`SELECT phone, role FROM users WHERE id='${id}'`).split('|'); actors[name] = { token: jwt.sign({ sub: id, phone, role }, JWT_SECRET, { expiresIn: '30m' }), id, role }; return true; }
const rowMd5 = (table, where) => sql(`SELECT md5(COALESCE(string_agg(row(t.*)::text, '|' ORDER BY t.id), '')) FROM ${table} t WHERE ${where}`);
const chainMd5 = (sid) => `${rowMd5('deposit_settlements', `t.id='${sid}'`)}/${rowMd5('deposit_deductions', `t.settlement_id='${sid}'`)}`;
const liveSettlement = (bk) => sql(`SELECT s.id||'|'||s.status FROM deposit_settlements s WHERE s.booking_id='${bk}' AND s.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM deposit_settlements x WHERE x.supersedes_settlement_id=s.id AND x.deleted_at IS NULL)`).split('|');
const evCount = (id, action) => Number(sql(`SELECT count(*) FROM deposit_dispute_events WHERE dispute_id='${id}' AND action='${action}'`));
const Q = '/admin/deposit-disputes';
const D = (id) => `${Q}/${id}`;

let T0 = null; let F = null; const touched = [];
function cleanup() {
  const bks = [...touched, '00000000-0000-0000-0000-000000000000'].map((x) => `'${x}'`).join(',');
  sql(`DELETE FROM deposit_dispute_events WHERE dispute_id IN (SELECT id FROM deposit_disputes WHERE booking_id IN (${bks}))`);
  sql(`UPDATE deposit_disputes SET supersedes_dispute_id=NULL WHERE booking_id IN (${bks})`);
  for (let i = 0; i < 4; i++) {   // peel: unreferenced disputes → offline events → copied deductions → superseding settlements
    sql(`DELETE FROM deposit_disputes WHERE booking_id IN (${bks}) AND id NOT IN (SELECT superseding_dispute_id FROM deposit_settlements WHERE superseding_dispute_id IS NOT NULL)`);
    sql(`DELETE FROM deposit_offline_events WHERE booking_id IN (${bks}) AND id NOT IN (SELECT offline_event_id FROM deposit_disputes WHERE offline_event_id IS NOT NULL)`);
    sql(`DELETE FROM deposit_deductions WHERE settlement_id IN (SELECT id FROM deposit_settlements WHERE booking_id IN (${bks}) AND supersedes_settlement_id IS NOT NULL) AND id NOT IN (SELECT deduction_id FROM deposit_disputes WHERE deduction_id IS NOT NULL)`);
    sql(`DELETE FROM deposit_settlements WHERE booking_id IN (${bks}) AND supersedes_settlement_id IS NOT NULL AND id NOT IN (SELECT settlement_id FROM deposit_disputes WHERE settlement_id IS NOT NULL)`);
  }
  sql(`DELETE FROM deposit_disputes WHERE booking_id IN (${bks})`);
  sql(`DELETE FROM deposit_offline_events WHERE booking_id IN (${bks})`);
  sql(`DELETE FROM deposit_deductions WHERE settlement_id IN (SELECT id FROM deposit_settlements WHERE booking_id IN (${bks}))`);
  sql(`DELETE FROM deposit_settlements WHERE booking_id IN (${bks})`);
  if (F) sql(`UPDATE booking_deposits SET status='DUE', collected_at=NULL, updated_by=NULL WHERE id='${F.dep}'`);
  if (T0) {
    sql(`DELETE FROM outbox_events WHERE aggregate_id IN (${bks}) AND created_at > '${T0}'`);
    sql(`DELETE FROM notification_deliveries WHERE notification_id IN (SELECT id FROM notifications WHERE entity_id IN (${bks}) AND created_at > '${T0}')`);
    sql(`DELETE FROM notifications WHERE entity_id IN (${bks}) AND created_at > '${T0}'`);
  }
}

async function main() {
  cur = '0-setup';
  if (!JWT_SECRET) { console.error('FATAL: JWT_SECRET not found in the stack env file'); process.exit(1); }
  const count = (t, where = '') => sql(`SELECT count(*) FROM ${t} ${where}`);
  const snapshot = () => ({
    bookings: count('bookings'), pay: count('payments'), refunds: count('refunds'), ptx: count('payment_transactions'), dep: count('booking_deposits'),
    collected: count('booking_deposits', `WHERE status='COLLECTED'`), settlements: count('deposit_settlements'), deductions: count('deposit_deductions'),
    offline: count('deposit_offline_events'), disputes: count('deposit_disputes'), disputeEvents: count('deposit_dispute_events'),
    disputeNotifs: count('notifications', `WHERE type LIKE 'deposit.%'`),
  });
  const BASE = snapshot();
  T0 = sql('SELECT NOW()');
  const adminOf = (role) => sql(`SELECT id FROM users WHERE role='${role}' AND status='ACTIVE' ORDER BY created_at LIMIT 1`);
  const okRoles = mintById('super', adminOf('SUPER_ADMIN')) & mintById('ops', adminOf('OPS_ADMIN')) & mintById('finance', adminOf('FINANCE_ADMIN'));
  if (!okRoles) { console.error('FATAL: need one active SUPER_ADMIN, OPS_ADMIN and FINANCE_ADMIN'); process.exit(1); }
  // A CHECKED_OUT booking with a DUE deposit, made COLLECTED offline (a CONFIRMED collection event), owner-finalized with two lines.
  const pick = sql(`SELECT b.id||'|'||b.tenant_id||'|'||b.property_id||'|'||p.owner_id||'|'||d.id||'|'||d.amount_paisa||'|'||b.booking_number FROM bookings b JOIN pg_properties p ON p.id=b.property_id JOIN booking_deposits d ON d.booking_id=b.id AND d.deleted_at IS NULL WHERE b.status='CHECKED_OUT' AND b.deleted_at IS NULL AND d.status='DUE' AND d.amount_paisa >= 200000 AND b.id NOT IN (SELECT booking_id FROM deposit_settlements) AND b.id NOT IN (SELECT booking_id FROM deposit_disputes) ORDER BY b.created_at LIMIT 1`).split('|');
  if (pick.length !== 7) { console.error('FATAL: no CHECKED_OUT booking with a DUE deposit'); process.exit(1); }
  F = { bk: pick[0], tenant: pick[1], prop: pick[2], owner: pick[3], dep: pick[4], amt: Number(pick[5]), number: pick[6], ev: randomUUID() };
  touched.push(F.bk);
  mintById('owner', F.owner); mintById('tenant', F.tenant);
  mintById('otherTenant', sql(`SELECT id FROM users WHERE role='TENANT' AND id <> '${F.tenant}' ORDER BY created_at LIMIT 1`));
  sql(`UPDATE booking_deposits SET status='COLLECTED', collected_at=NOW() WHERE id='${F.dep}'`);
  sql(`INSERT INTO deposit_offline_events (id, booking_id, booking_deposit_id, property_id, event_type, initiator_side, confirm_required_from, amount_paisa, method, event_date, status, recorded_by, confirmed_by, confirmed_at, confirmation_version, note) VALUES ('${F.ev}','${F.bk}','${F.dep}','${F.prop}','DEPOSIT_COLLECTION','OWNER','TENANT',${F.amt},'CASH',CURRENT_DATE,'CONFIRMED','${F.owner}','${F.tenant}',NOW(),'${VERSION}','PRIVATE-NOTE-MUST-NOT-LEAK')`);
  const wall = Math.floor(F.amt / 3); const clean = Math.floor(F.amt / 10);
  const fin = await call('owner', 'POST', `/bookings/${F.bk}/deposit/settlement`, { deductions: [{ amountPaisa: wall, reason: 'Wall damage' }, { amountPaisa: clean, reason: 'Cleaning' }], reason: 'PRIVATE-SETTLEMENT-REASON', acknowledgedDepositAmountPaisa: F.amt, acknowledgedTotalDeductionsPaisa: wall + clean });
  const [S1] = liveSettlement(F.bk);
  const lines = sql(`SELECT id||':'||reason FROM deposit_deductions WHERE settlement_id='${S1}' ORDER BY created_at`).split('\n').map((l) => l.split(':'));
  const wallId = lines.find((l) => l[1] === 'Wall damage')?.[0]; const cleanId = lines.find((l) => l[1] === 'Cleaning')?.[0];
  ok('[fixture] owner-finalized settlement with two lines on an offline-collected deposit', fin.status === 201 && S1 && wallId && cleanId, `${fin.status} ${fin.message ?? ''}`);

  // ═══ 1–2. Queue access, filters, paging ══
  cur = '1-queue';
  const tenantCase = await call('tenant', 'POST', `/bookings/${F.bk}/deposit/disputes`, { targetType: 'SETTLEMENT', settlementId: S1, deductionId: wallId, reason: 'The wall was already damaged' });
  const T = tenantCase.data?.id;
  const q = await Promise.all(['super', 'ops', 'finance'].map((a) => call(a, 'GET', `${Q}?bookingId=${F.bk}&status=OPEN`)));
  ok('[1] SUPER, OPS and FINANCE open the queue (200); the new case is listed', tenantCase.status === 201 && q.every((r) => r.status === 200 && r.data?.some((x) => x.id === T)), q.map((r) => r.status).join('/'));
  const meta = q[0].meta;
  ok('[2] paging meta is {page, limit, total} — no totalPages', meta && meta.page === 1 && meta.limit === 20 && typeof meta.total === 'number' && !('totalPages' in meta), JSON.stringify(meta));
  const f1 = await call('ops', 'GET', `${Q}?targetType=OFFLINE_COLLECTION&bookingId=${F.bk}`);
  const f2 = await call('ops', 'GET', `${Q}?propertyId=${F.prop}&limit=1&page=1`);
  const f3 = await call('ops', 'GET', `${Q}?status=NOT_A_STATUS`);
  const f4 = await call('ops', 'GET', `${Q}?limit=101`);
  ok('[2] filters narrow (targetType + bookingId → none yet; propertyId + limit=1 → 1 row), invalid status / limit → 400', f1.status === 200 && f1.data?.length === 0 && f2.status === 200 && f2.data?.length === 1 && f2.meta?.limit === 1 && f3.status === 400 && f4.status === 400, `${f1.data?.length}/${f2.data?.length}/${f3.status}/${f4.status}`);
  const all = await call('super', 'GET', `${Q}?limit=100`);
  const firstNonOpen = (all.data ?? []).findIndex((x) => x.status !== 'OPEN');
  ok('[2] server order: OPEN cases first', all.status === 200 && (firstNonOpen === -1 || all.data.slice(firstNonOpen).every((x) => x.status !== 'OPEN')), `rows=${all.data?.length}`);

  // ═══ 3–4. Detail + notes ══
  cur = '3-detail-notes';
  const det = await call('finance', 'GET', D(T));
  ok('[3] detail: identity, booking number, target facts (settlement + the disputed line), events', det.status === 200 && det.data?.bookingNumber === F.number && det.data?.targetFacts?.settlement?.id === S1 && det.data?.targetFacts?.deduction?.id === wallId && det.data?.events?.[0]?.action === 'OPENED' && det.data?.effectExecuted === null, `${det.status}`);
  const nOps = await call('ops', 'POST', `${D(T)}/notes`, { note: 'OPS: asked the owner for the inspection photos' });
  const nFin = await call('finance', 'POST', `${D(T)}/notes`, { note: 'FIN: photos received' });
  const nBlank = await call('finance', 'POST', `${D(T)}/notes`, { note: '   ' });
  const nOwner = await call('owner', 'POST', `${D(T)}/notes`, { note: 'x' });
  ok('[4] OPS and FINANCE add notes (201, {disputeId, eventId}); blank → 400 DISPUTE_NOTE_REQUIRED; owner → 403', nOps.status === 201 && nOps.data?.eventId && nFin.status === 201 && nBlank.status === 400 && nBlank.message === 'DISPUTE_NOTE_REQUIRED' && nOwner.status === 403 && evCount(T, 'NOTE_ADDED') === 2, `${nOps.status}/${nFin.status}/${nBlank.status}/${nOwner.status}`);
  const party = await call('tenant', 'GET', `/bookings/${F.bk}/deposit/disputes`);
  ok('[4] notes are admin-only: the party view never carries them', party.status === 200 && !JSON.stringify(party.data).includes('asked the owner') && !JSON.stringify(party.data).includes('NOTE_ADDED'));

  // ═══ 7–8. Resolution records only ══
  cur = '7-resolve';
  const SNAP = chainMd5(S1);
  const rOps = await call('ops', 'POST', `${D(T)}/resolve`, { finding: 'UPHELD', effect: 'SETTLEMENT_SUPERSEDED', resolutionReason: 'x', resolutionVersion: RVERSION });
  const rNoVer = await call('finance', 'POST', `${D(T)}/resolve`, { finding: 'UPHELD', effect: 'SETTLEMENT_SUPERSEDED', resolutionReason: 'x' });
  const rDismissEffect = await call('finance', 'POST', `${D(T)}/resolve`, { finding: 'DISMISSED', effect: 'SETTLEMENT_SUPERSEDED', resolutionReason: 'x', resolutionVersion: RVERSION });
  ok('[12] OPS cannot resolve (403); missing version → 400 …RESOLUTION_VERSION_REQUIRED; non-UPHELD + effect → 400 …EFFECT_REQUIRES_UPHELD', rOps.status === 403 && rNoVer.status === 400 && /RESOLUTION_VERSION_REQUIRED/.test(rNoVer.message ?? '') && rDismissEffect.status === 400 && /EFFECT_REQUIRES_UPHELD/.test(rDismissEffect.message ?? ''), `${rOps.status}/${rNoVer.message}/${rDismissEffect.message}`);
  const rT = await call('finance', 'POST', `${D(T)}/resolve`, { finding: 'UPHELD', effect: 'SETTLEMENT_SUPERSEDED', resolutionReason: 'Move-in photos show the damage pre-dates the stay.', resolutionVersion: RVERSION });
  ok('[7] FINANCE resolves UPHELD + SETTLEMENT_SUPERSEDED (200)', rT.status === 200 && rT.data?.status === 'RESOLVED' && rT.data?.effect === 'SETTLEMENT_SUPERSEDED', `${rT.status} ${rT.message ?? ''}`);
  ok('[8] resolution alone executes NOTHING: effectExecuted false, no EFFECT_EXECUTED, the settlement chain byte-identical, still the live settlement', rT.data?.effectExecuted === false && evCount(T, 'EFFECT_EXECUTED') === 0 && chainMd5(S1) === SNAP && liveSettlement(F.bk)[0] === S1);

  // ═══ 5 + 11. Admin-created case (freeze) blocks execution ══
  cur = '5-admin-case-blocks';
  const S = await call('ops', 'POST', Q, { bookingId: F.bk, targetType: 'SETTLEMENT', settlementId: S1, deductionId: cleanId, reason: 'Review of the cleaning line' });
  const Sid = S.data?.id;
  ok('[5] OPS opens an admin case on the other line (201, openedSide ADMIN)', S.status === 201 && S.data?.openedSide === 'ADMIN', `${S.status} ${S.message ?? ''}`);
  const dup = await call('super', 'POST', Q, { bookingId: F.bk, targetType: 'SETTLEMENT', settlementId: S1, reason: 'dup' });
  ok('[5] a second case on the same settlement family → 409 DISPUTE_ALREADY_OPEN with details.disputeId', dup.status === 409 && dup.code === 'DISPUTE_ALREADY_OPEN' && dup.details?.disputeId === Sid, `${dup.status} ${dup.code}`);
  const exOps = await call('ops', 'POST', `${D(T)}/execute-effect`, {});
  const exBody = await call('finance', 'POST', `${D(T)}/execute-effect`, { amountPaisa: 1 });
  const exBlocked = await call('finance', 'POST', `${D(T)}/execute-effect`, {});
  ok('[12] OPS cannot execute (403); a body key → 400', exOps.status === 403 && exBody.status === 400, `${exOps.status}/${exBody.status}`);
  ok('[11] execution blocked by the OPEN admin case: 409 DISPUTE_EFFECT_BLOCKED_BY_OPEN_CASE with blockingDisputeId; nothing written; a failure row kept', exBlocked.status === 409 && exBlocked.code === 'DISPUTE_EFFECT_BLOCKED_BY_OPEN_CASE' && exBlocked.details?.blockingDisputeId === Sid && chainMd5(S1) === SNAP && evCount(T, 'EFFECT_EXECUTED') === 0 && evCount(T, 'EFFECT_EXECUTION_FAILED') === 1, `${exBlocked.status} ${JSON.stringify(exBlocked.details)}`);

  // ═══ 6. Withdrawal authority ══
  cur = '6-withdraw';
  const wOwner = await call('owner', 'POST', `${D(Sid)}/withdraw`);
  const wParty = await call('finance', 'POST', `${D(T)}/withdraw`);   // party case (and resolved)
  ok('[13] the owner cannot use the admin withdraw route (403); a party case is never withdrawn by an admin', wOwner.status === 403 && wParty.status === 403 && wParty.message === 'DISPUTE_NOT_ADMIN_OPENED', `${wOwner.status}/${wParty.status} ${wParty.message}`);
  const wS = await call('ops', 'POST', `${D(Sid)}/withdraw`);
  const wAgain = await call('ops', 'POST', `${D(Sid)}/withdraw`);
  ok('[6] OPS withdraws its OWN admin case (200 WITHDRAWN); a second withdraw → 400 DISPUTE_NOT_OPEN', wS.status === 200 && wS.data?.status === 'WITHDRAWN' && wAgain.status === 400 && wAgain.message === 'DISPUTE_NOT_OPEN', `${wS.status}/${wAgain.status}`);

  // ═══ 9–10. Separate execution, confirmed by the backend ══
  cur = '9-execute';
  const before = await call('finance', 'GET', D(T));
  const ex = await call('finance', 'POST', `${D(T)}/execute-effect`, {});
  const after = await call('finance', 'GET', D(T));
  const [S2, S2status] = liveSettlement(F.bk);
  ok('[10] before execution the case reads "recorded, not applied" (effectExecuted false)', before.data?.effectExecuted === false);
  ok('[9] FINANCE applies the outcome separately (200): effectExecuted true, ref = the new live settlement (PENDING, Wall line removed)', ex.status === 200 && ex.data?.effectExecuted === true && ex.data?.effectExecutionRef === S2 && S2 !== S1 && S2status === 'PENDING' && sql(`SELECT string_agg(reason, ',') FROM deposit_deductions WHERE settlement_id='${S2}'`) === 'Cleaning', `${ex.status} ${ex.message ?? ''}`);
  ok('[10] the detail reflects it only after the backend confirmed: effectExecuted true + EFFECT_EXECUTED row', after.data?.effectExecuted === true && evCount(T, 'EFFECT_EXECUTED') === 1);
  ok('[16] M-C.4 invariant: the original settlement + its lines are byte-identical after execution', chainMd5(S1) === SNAP);
  const exAgain = await call('super', 'POST', `${D(T)}/execute-effect`, {});
  ok('[16] idempotent: a repeat returns the recorded result, no second superseder', exAgain.status === 200 && exAgain.data?.effectExecutionRef === S2 && Number(sql(`SELECT count(*) FROM deposit_settlements WHERE supersedes_settlement_id='${S1}'`)) === 1);

  // ═══ party case on the collection: admin withdrawal refused; NONE resolution; reconsideration ══
  cur = '6b-party-reconsider';
  const P = await call('tenant', 'POST', `/bookings/${F.bk}/deposit/disputes`, { targetType: 'OFFLINE_COLLECTION', offlineEventId: F.ev, reason: 'I paid more than recorded' });
  const wP = await call('super', 'POST', `${D(P.data?.id)}/withdraw`);
  ok('[6] SUPER has no override: an OPEN party case → 403 DISPUTE_NOT_ADMIN_OPENED', P.status === 201 && wP.status === 403 && wP.message === 'DISPUTE_NOT_ADMIN_OPENED', `${P.status}/${wP.status}`);
  const rP = await call('super', 'POST', `${D(P.data?.id)}/resolve`, { finding: 'INCONCLUSIVE', effect: 'NONE', resolutionReason: 'Neither side produced a receipt.' });
  ok('[7] NONE resolution is executed at resolution (nothing to apply)', rP.status === 200 && rP.data?.effectExecuted === true);
  const R = await call('ops', 'POST', Q, { bookingId: F.bk, targetType: 'OFFLINE_COLLECTION', offlineEventId: F.ev, reason: 'Reconsider with the new receipt', supersedesDisputeId: P.data?.id });
  const parentAfter = await call('ops', 'GET', D(P.data?.id));
  ok('[5] reconsideration through the same endpoint (201): supersedes link, the parent shows supersededByDisputeId', R.status === 201 && R.data?.supersedesDisputeId === P.data?.id && parentAfter.data?.supersededByDisputeId === R.data?.id, `${R.status} ${R.message ?? ''}`);
  const wR = await call('finance', 'POST', `${D(R.data?.id)}/withdraw`);
  ok('[6] FINANCE (RESOLUTION holder) may withdraw an admin case it did not open (200)', wR.status === 200 && wR.data?.status === 'WITHDRAWN', `${wR.status} ${wR.message ?? ''}`);

  // ═══ 13. Unauthorized roles ══
  cur = '13-denied';
  const denied = await Promise.all([
    call('owner', 'GET', Q), call('tenant', 'GET', Q), call('otherTenant', 'GET', D(T)),
    call('owner', 'GET', `/admin/bookings/${F.bk}/deposit-history`), call('tenant', 'POST', `${D(T)}/resolve`, { finding: 'DISMISSED', effect: 'NONE', resolutionReason: 'x' }),
    call('owner', 'POST', Q, { bookingId: F.bk, targetType: 'OFFLINE_COLLECTION', offlineEventId: F.ev, reason: 'x' }),
    raw('GET', Q),
  ]);
  ok('[13] owner / resident / another resident → 403 on queue, detail, history, resolve, admin open; anonymous → 401', denied.slice(0, 6).every((r) => r.status === 403) && denied[6].status === 401, denied.map((r) => r.status).join('/'));

  // ═══ 14–15. Deposit history + privacy ══
  cur = '14-history-privacy';
  const hist = await Promise.all(['super', 'ops', 'finance'].map((a) => call(a, 'GET', `/admin/bookings/${F.bk}/deposit-history`)));
  const h = hist[0].data;
  ok('[14] deposit history for SUPER / OPS / FINANCE (200): both settlements, the chain link, the disputes', hist.every((r) => r.status === 200) && h?.settlements?.length === 2 && h.settlements.some((s) => s.supersedesSettlementId === S1) && h.disputes?.length >= 4, hist.map((r) => r.status).join('/'));
  const blob = JSON.stringify(hist.map((r) => r.data)) + JSON.stringify(after.data) + JSON.stringify(det.data);
  ok('[15] privacy: no raw transaction payload, no private settlement reason, no offline note, no token-like secrets in the admin projections', !blob.includes('"raw"') && !blob.includes('PRIVATE-SETTLEMENT-REASON') && !blob.includes('PRIVATE-NOTE-MUST-NOT-LEAK') && !/eyJ[A-Za-z0-9_-]{10,}\./.test(blob) && h.settlements.every((s) => !('reason' in s)) && h.offlineEvents.every((e) => !('note' in e)));
  obs(`case T=${T} admin S=${Sid} party P=${P.data?.id} reconsideration R=${R.data?.id}; live settlement ${S2} revises ${S1}`);

  cur = 'cleanup';
  cleanup();
  const AFTER = snapshot();
  ok('baseline restored (bookings, payments, refunds, transactions, deposits, settlements, deductions, offline events, disputes, events, deposit notifications)', JSON.stringify(AFTER) === JSON.stringify(BASE), `${JSON.stringify(BASE)} → ${JSON.stringify(AFTER)}`);
}

main().catch((e) => { console.error('FATAL', e); cur = 'fatal'; ok('harness ran to completion', false, String(e?.message ?? e)); cleanup(); }).finally(() => {
  const md = [`# ADM-D.1 — Admin deposit operations (E2E, real API)`, '', `Run ${new Date().toISOString()} · ${passed} passed · ${failed} failed`, '', '| Section | Check | Result | Detail |', '|---|---|---|---|',
    ...rows.map((r) => `| ${r.section} | ${r.name.replace(/\|/g, '\\|')} | ${r.result} | ${r.detail.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`)].join('\n');
  writeFileSync(OUT, md);
  console.log(`\n${passed} passed, ${failed} failed → ${OUT}`);
  process.exit(failed ? 1 : 0);
});
