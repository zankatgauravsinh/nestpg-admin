import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { DepositDisputeDetailComponent } from './deposit-dispute-detail.component';
import { SessionStore } from '../../../core/auth/session.store';
import { environment } from '../../../../environments/environment';
import { Capability } from '../../../core/models/capability.model';
import type { AdminDisputeDetail } from '../../../core/data/deposit-disputes.service';
import { adminUser, detail, OPS, READ_ONLY, SUPER_OR_FINANCE } from './dispute-test-fixtures';

const api = (p: string) => environment.apiBase + p;
const DETAIL = (id = 'd-1') => api(`/admin/deposit-disputes/${id}`);
const BOOKING = api('/bookings/b-1');
const conflict = (message: string, details?: Record<string, unknown>) =>
  [{ errors: [{ code: message, message, ...(details ? { details } : {}) }] }, { status: 409, statusText: 'Conflict' }] as const;

/** ADM-D.1 — the operator's case page against the real admin projection. */
describe('DepositDisputeDetailComponent', () => {
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let navigate: ReturnType<typeof vi.spyOn>;

  const setup = (caps: Capability[], d: AdminDisputeDetail = detail(), me = 'admin-me') => {
    params = new BehaviorSubject(convertToParamMap({ id: d.id }));
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable(), snapshot: { paramMap: convertToParamMap({ id: d.id }) } } }],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(SessionStore).setUser(adminUser(caps, me));
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const f = TestBed.createComponent(DepositDisputeDetailComponent);
    f.detectChanges();
    flushLoad(d);
    f.detectChanges();
    return f;
  };
  const flushLoad = (d: AdminDisputeDetail, booking: object | 'missing' = { id: 'b-1', bookingNumber: d.bookingNumber, status: 'CHECKED_OUT', tenantName: 'Asha R', propertyName: 'Maple Nivas', roomNumber: '102', bedLabel: 'B', depositRefund: { rail: 'OFFLINE', state: 'NOT_STARTED', amountPaisa: 900000, completedAt: null } }) => {
    http.expectOne(DETAIL(d.id)).flush({ data: d });
    const b = http.expectOne(BOOKING);
    if (booking === 'missing') b.flush({ errors: [{ code: 'Not Found', message: 'BOOKING_NOT_FOUND' }] }, { status: 404, statusText: 'Not Found' });
    else b.flush({ data: booking });
  };
  const el = (f: { nativeElement: HTMLElement }, id: string) => f.nativeElement.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const click = (f: { nativeElement: HTMLElement; detectChanges: () => void }, id: string) => { el(f, id)!.click(); f.detectChanges(); };
  const type = (f: { nativeElement: HTMLElement; detectChanges: () => void }, id: string, v: string) => {
    const t = el(f, id) as HTMLTextAreaElement; t.value = v; t.dispatchEvent(new Event('input')); f.detectChanges();
  };
  const settle = async (f: { detectChanges: () => void; whenStable: () => Promise<unknown> }) => { f.detectChanges(); await f.whenStable(); f.detectChanges(); };
  afterEach(() => http.verify());

  describe('rendering (admin projection only)', () => {
    it('shows identity, booking context, target facts, statements, internal notes and the history', () => {
      const f = setup(READ_ONLY);
      const text = f.nativeElement.textContent!;
      expect(el(f, 'status')!.textContent).toMatch(/Open/);
      expect(el(f, 'freeze-note')).toBeTruthy();
      expect(el(f, 'booking-context')!.textContent).toMatch(/Asha R/);
      expect(el(f, 'booking-context')!.textContent).toMatch(/Maple Nivas/);
      expect(el(f, 'facts-settlement')!.textContent).toMatch(/₹9,000/);
      expect(el(f, 'deduction-dd-1')!.textContent).toMatch(/Wall damage.*\(disputed\)/);
      expect(el(f, 'statement-e-1')!.textContent).toMatch(/The wall was already damaged/);
      expect(el(f, 'statement-e-2')!.textContent).toMatch(/Fresh damage at inspection/);
      expect(el(f, 'note-e-3')!.textContent).toMatch(/INTERNAL: photos reviewed/);
      expect(el(f, 'event-FREEZE_BLOCKED')!.textContent).toMatch(/Blocked action: ONLINE_REFUND_WORKER/);
      // whitelisted metadata only: remainingPaisa / settlementId of the freeze row are not rendered
      expect(el(f, 'event-FREEZE_BLOCKED')!.textContent).not.toMatch(/900000|Remaining/);
      expect(text).not.toMatch(/"raw"|\[object Object\]|settledBy|tenantId/);
    });

    it('a deleted booking (404 on the booking read) degrades; the case still renders', () => {
      params = new BehaviorSubject(convertToParamMap({ id: 'd-1' }));
      TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } }] });
      http = TestBed.inject(HttpTestingController);
      TestBed.inject(SessionStore).setUser(adminUser(READ_ONLY));
      const f = TestBed.createComponent(DepositDisputeDetailComponent);
      f.detectChanges();
      flushLoad(detail(), 'missing');
      f.detectChanges();
      expect(el(f, 'booking-unavailable')).toBeTruthy();
      expect(el(f, 'target-facts')).toBeTruthy();
    });

    it('a failed case load shows an error, not an empty page', () => {
      params = new BehaviorSubject(convertToParamMap({ id: 'd-x' }));
      TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } }] });
      http = TestBed.inject(HttpTestingController);
      TestBed.inject(SessionStore).setUser(adminUser(READ_ONLY));
      const f = TestBed.createComponent(DepositDisputeDetailComponent);
      f.detectChanges();
      http.expectOne(DETAIL('d-x')).flush({ errors: [{ code: 'Not Found', message: 'DEPOSIT_DISPUTE_NOT_FOUND' }] }, { status: 404, statusText: 'Not Found' });
      f.detectChanges();
      expect(el(f, 'detail-error')!.textContent).toMatch(/This dispute does not exist/);
    });

    it('resolved + effect pending is visibly distinct from applied; relationships link both ways', () => {
      const pending = setup(READ_ONLY, detail({ status: 'RESOLVED', finding: 'UPHELD', effect: 'SETTLEMENT_SUPERSEDED', resolutionReason: 'Move-in photos', resolutionVersion: 'dispute-resolution-v1', resolvedBy: 'fin-1', resolvedAt: '2026-10-09T10:00:00.000Z', effectExecuted: false, supersedesDisputeId: 'd-0', supersededByDisputeId: 'd-2' }));
      expect(el(pending, 'effect-state')!.textContent).toMatch(/Recorded — not applied/);
      expect(el(pending, 'relationships')!.textContent).toMatch(/Reconsiders/);
      expect(el(pending, 'relationships')!.textContent).toMatch(/Reconsidered by/);
      TestBed.resetTestingModule();
      const applied = setup(READ_ONLY, detail({ status: 'RESOLVED', finding: 'UPHELD', effect: 'SETTLEMENT_SUPERSEDED', resolutionReason: 'r', resolvedBy: 'fin-1', resolvedAt: '2026-10-09T10:00:00.000Z', effectExecuted: true, effectExecutedAt: '2026-10-09T11:00:00.000Z', effectExecutionRef: 's-2-uuid-0000' }));
      expect(el(applied, 'effect-state')!.textContent).toMatch(/Applied/);
      expect(el(applied, 'execution-ref')!.textContent).toMatch(/s-2-uuid/);
    });
  });

  describe('capability + state gating (presentation only)', () => {
    it('SUPER / FINANCE on an OPEN party case: note + resolve, no withdraw (party cases are never withdrawn by admins)', () => {
      const f = setup(SUPER_OR_FINANCE);
      expect(el(f, 'note-form')).toBeTruthy();
      expect(el(f, 'resolve-start')).toBeTruthy();
      expect(el(f, 'withdraw-start')).toBeNull();
      expect(el(f, 'execute-start')).toBeNull();
    });
    it('OPS: note, no resolve / execute; withdraw only its OWN admin case', () => {
      const party = setup(OPS);
      expect(el(party, 'note-form')).toBeTruthy();
      expect(el(party, 'resolve-start')).toBeNull();
      expect(el(party, 'actions')).toBeNull();
      TestBed.resetTestingModule();
      const others = setup(OPS, detail({ openedSide: 'ADMIN', openedBy: 'another-admin' }), 'ops-me');
      expect(el(others, 'withdraw-start')).toBeNull();
      TestBed.resetTestingModule();
      const own = setup(OPS, detail({ openedSide: 'ADMIN', openedBy: 'ops-me' }), 'ops-me');
      expect(el(own, 'withdraw-start')).toBeTruthy();
    });
    it('FINANCE may withdraw any admin case (holds RESOLUTION); nobody can withdraw a RESOLVED case', () => {
      const f = setup(SUPER_OR_FINANCE, detail({ openedSide: 'ADMIN', openedBy: 'another-admin' }));
      expect(el(f, 'withdraw-start')).toBeTruthy();
      TestBed.resetTestingModule();
      const r = setup(SUPER_OR_FINANCE, detail({ openedSide: 'ADMIN', openedBy: 'admin-me', status: 'RESOLVED', finding: 'DISMISSED', effect: 'NONE', resolutionReason: 'r', resolvedBy: 'x', resolvedAt: '2026-10-09T10:00:00.000Z', effectExecuted: true }));
      expect(el(r, 'withdraw-start')).toBeNull();
      expect(el(r, 'execute-start')).toBeNull(); // NONE needs no execution
    });
    it('read-only role: no actions at all', () => {
      const f = setup(READ_ONLY, detail({ openedSide: 'ADMIN', openedBy: 'admin-me' }));
      expect(el(f, 'actions')).toBeNull();
      expect(el(f, 'note-form')).toBeNull();
    });
  });

  describe('notes (not idempotent)', () => {
    it('posts the trimmed note once, then re-reads the case', () => {
      const f = setup(SUPER_OR_FINANCE);
      type(f, 'note-text', '  receipt requested  ');
      click(f, 'note-submit');
      const req = http.expectOne(api('/admin/deposit-disputes/d-1/notes'));
      expect(req.request.body).toEqual({ note: 'receipt requested' });
      expect((el(f, 'note-submit') as HTMLButtonElement).disabled).toBe(true); // no double submit while in flight
      req.flush({ data: { disputeId: 'd-1', eventId: 'e-9' } });
      f.detectChanges();
      flushLoad(detail());
      f.detectChanges();
      expect(el(f, 'banner')!.textContent).toMatch(/Note added/);
    });
    it('an ambiguous failure is reported as uncertain, the case is re-read, and the note is NOT retried', () => {
      const f = setup(SUPER_OR_FINANCE);
      type(f, 'note-text', 'receipt requested');
      click(f, 'note-submit');
      http.expectOne(api('/admin/deposit-disputes/d-1/notes')).error(new ProgressEvent('error'), { status: 0, statusText: '' });
      f.detectChanges();
      flushLoad(detail());
      f.detectChanges();
      expect(el(f, 'note-uncertain')).toBeTruthy();
      http.expectNone(api('/admin/deposit-disputes/d-1/notes'));
      expect((el(f, 'note-text') as HTMLTextAreaElement).value).toBe('receipt requested'); // kept for an informed re-send
    });
  });

  describe('resolve (records only) and apply (separate, empty body)', () => {
    it('NONE: review → confirm → POST without resolutionVersion; execute is never called', async () => {
      const f = setup(SUPER_OR_FINANCE);
      click(f, 'resolve-start');
      await settle(f);
      (el(f, 'finding-DISMISSED') as HTMLInputElement).click(); await settle(f);
      type(f, 'resolution-reason', 'Documented in the inspection report');
      click(f, 'resolve-review');
      expect(el(f, 'resolve-summary')!.textContent).toMatch(/Dismissed.*No change to the deposit/);
      click(f, 'confirm-action');
      const req = http.expectOne(api('/admin/deposit-disputes/d-1/resolve'));
      expect(req.request.body).toEqual({ finding: 'DISMISSED', effect: 'NONE', resolutionReason: 'Documented in the inspection report' });
      req.flush({ data: { id: 'd-1', effect: 'NONE', effectExecuted: true, status: 'RESOLVED' } });
      f.detectChanges();
      flushLoad(detail({ status: 'RESOLVED', finding: 'DISMISSED', effect: 'NONE', resolutionReason: 'r', resolvedBy: 'admin-me', resolvedAt: '2026-10-09T10:00:00.000Z', effectExecuted: true }));
      f.detectChanges();
      http.expectNone(api('/admin/deposit-disputes/d-1/execute-effect'));
      expect(el(f, 'banner')!.textContent).toMatch(/Resolved. No change to the deposit/);
    });

    it('non-NONE needs UPHELD + the acknowledgement, sends dispute-resolution-v1, and leaves the outcome NOT applied', async () => {
      const f = setup(SUPER_OR_FINANCE);
      click(f, 'resolve-start');
      await settle(f);
      expect(el(f, 'supersede-rule')!.textContent).toMatch(/Removes the disputed deduction line/);
      (el(f, 'effect-SETTLEMENT_SUPERSEDED') as HTMLInputElement).click(); await settle(f);
      type(f, 'resolution-reason', 'Pre-existing damage');
      click(f, 'resolve-review');
      expect(el(f, 'resolve-form-error')!.textContent).toMatch(/Confirm the approval statement/);
      (el(f, 'resolution-ack') as HTMLInputElement).click(); await settle(f);
      click(f, 'resolve-review');
      expect(el(f, 'confirm-panel')!.textContent).toMatch(/No money moves until the outcome is applied/);
      click(f, 'confirm-action');
      const req = http.expectOne(api('/admin/deposit-disputes/d-1/resolve'));
      expect(req.request.body).toEqual({ finding: 'UPHELD', effect: 'SETTLEMENT_SUPERSEDED', resolutionReason: 'Pre-existing damage', resolutionVersion: 'dispute-resolution-v1' });
      req.flush({ data: { id: 'd-1', effect: 'SETTLEMENT_SUPERSEDED', effectExecuted: false, status: 'RESOLVED' } });
      f.detectChanges();
      flushLoad(detail({ status: 'RESOLVED', finding: 'UPHELD', effect: 'SETTLEMENT_SUPERSEDED', resolutionReason: 'r', resolutionVersion: 'dispute-resolution-v1', resolvedBy: 'admin-me', resolvedAt: '2026-10-09T10:00:00.000Z', effectExecuted: false }));
      f.detectChanges();
      http.expectNone(api('/admin/deposit-disputes/d-1/execute-effect'));
      expect(el(f, 'banner')!.textContent).toMatch(/has NOT been applied yet/);
      expect(el(f, 'effect-state')!.textContent).toMatch(/Recorded — not applied/);
      expect(el(f, 'execute-start')).toBeTruthy();
    });

    it('a non-derivable whole-settlement case cannot pick SETTLEMENT_SUPERSEDED; a non-UPHELD finding disables every non-NONE effect', async () => {
      const f = setup(SUPER_OR_FINANCE, detail({ target: { offlineEventId: null, settlementId: 's-1', deductionId: null, refundId: null }, openedSide: 'OWNER' }));
      click(f, 'resolve-start');
      await settle(f);
      expect((el(f, 'effect-SETTLEMENT_SUPERSEDED') as HTMLInputElement).disabled).toBe(true);
      expect((el(f, 'effect-OFFLINE_REFUND_CONFIRMED') as HTMLInputElement).disabled).toBe(false);
      (el(f, 'finding-INCONCLUSIVE') as HTMLInputElement).click(); await settle(f);
      expect((el(f, 'effect-OFFLINE_REFUND_CONFIRMED') as HTMLInputElement).disabled).toBe(true);
    });

    it('a server refusal that does not change the case returns to the filled form (no re-read)', async () => {
      const f = setup(SUPER_OR_FINANCE);
      click(f, 'resolve-start');
      await settle(f);
      type(f, 'resolution-reason', 'x');
      click(f, 'resolve-review');
      click(f, 'confirm-action');
      http.expectOne(api('/admin/deposit-disputes/d-1/resolve')).flush(...conflict('DISPUTE_EFFECT_NOT_DERIVABLE', { disputeId: 'd-1' }));
      f.detectChanges();
      await settle(f);
      expect(el(f, 'resolve-form')).toBeTruthy();
      expect((el(f, 'resolution-reason') as HTMLTextAreaElement).value).toBe('x');
      expect(el(f, 'action-error')!.textContent).toMatch(/cannot be derived/);
      http.expectNone(DETAIL());
    });

    it('apply sends an EMPTY body and shows "Applied" only after the server confirms it', () => {
      const resolved = detail({ status: 'RESOLVED', finding: 'UPHELD', effect: 'SETTLEMENT_SUPERSEDED', resolutionReason: 'r', resolutionVersion: 'dispute-resolution-v1', resolvedBy: 'x', resolvedAt: '2026-10-09T10:00:00.000Z', effectExecuted: false });
      const f = setup(SUPER_OR_FINANCE, resolved);
      click(f, 'execute-start');
      expect(el(f, 'execute-text')!.textContent).toMatch(/current settlement is kept unchanged/);
      expect(el(f, 'effect-state')!.textContent).toMatch(/Recorded — not applied/);
      click(f, 'confirm-action');
      const req = http.expectOne(api('/admin/deposit-disputes/d-1/execute-effect'));
      expect(req.request.body).toEqual({});
      expect(el(f, 'effect-state')!.textContent).toMatch(/Recorded — not applied/); // still pending while in flight
      req.flush({ data: { id: 'd-1', effectExecuted: true, effectExecutionRef: 's-2' } });
      f.detectChanges();
      flushLoad({ ...resolved, effectExecuted: true, effectExecutedAt: '2026-10-09T11:00:00.000Z', effectExecutionRef: 's-2' });
      f.detectChanges();
      expect(el(f, 'effect-state')!.textContent).toMatch(/Applied/);
      expect(el(f, 'execute-start')).toBeNull();
    });

    it('blocked by another OPEN case: message + link to the blocking case + re-read; no automatic retry', () => {
      const resolved = detail({ status: 'RESOLVED', finding: 'UPHELD', effect: 'SETTLEMENT_SUPERSEDED', resolutionReason: 'r', resolutionVersion: 'dispute-resolution-v1', resolvedBy: 'x', resolvedAt: '2026-10-09T10:00:00.000Z', effectExecuted: false });
      const f = setup(SUPER_OR_FINANCE, resolved);
      click(f, 'execute-start');
      click(f, 'confirm-action');
      http.expectOne(api('/admin/deposit-disputes/d-1/execute-effect')).flush(...conflict('DISPUTE_EFFECT_BLOCKED_BY_OPEN_CASE', { disputeId: 'd-1', blockingDisputeId: 'd-sib', blockingTargetType: 'SETTLEMENT' }));
      f.detectChanges();
      flushLoad({ ...resolved, events: [...resolved.events, { id: 'e-f', actorId: 'admin-me', actorSide: 'ADMIN', action: 'EFFECT_EXECUTION_FAILED', note: null, metadata: { code: 'DISPUTE_EFFECT_BLOCKED_BY_OPEN_CASE' }, createdAt: '2026-10-09T12:00:00.000Z' }] });
      f.detectChanges();
      expect(el(f, 'action-error')!.textContent).toMatch(/another dispute on this booking is open/);
      expect(el(f, 'error-link')!.getAttribute('href')).toContain('/finance/deposit-disputes/d-sib');
      expect(el(f, 'last-failure')!.textContent).toMatch(/DISPUTE_EFFECT_BLOCKED_BY_OPEN_CASE/);
      expect(el(f, 'effect-state')!.textContent).toMatch(/Recorded — not applied/);
      http.expectNone(api('/admin/deposit-disputes/d-1/execute-effect'));
    });

    it('a stale case (already resolved elsewhere) re-reads and shows the server state', async () => {
      const f = setup(SUPER_OR_FINANCE);
      click(f, 'resolve-start');
      await settle(f);
      type(f, 'resolution-reason', 'x');
      click(f, 'resolve-review');
      click(f, 'confirm-action');
      http.expectOne(api('/admin/deposit-disputes/d-1/resolve')).flush(...conflict('DISPUTE_NOT_OPEN', { disputeId: 'd-1', status: 'RESOLVED' }));
      f.detectChanges();
      flushLoad(detail({ status: 'RESOLVED', finding: 'DISMISSED', effect: 'NONE', resolutionReason: 'by someone else', resolvedBy: 'fin-2', resolvedAt: '2026-10-09T10:00:00.000Z', effectExecuted: true }));
      f.detectChanges();
      expect(el(f, 'action-error')!.textContent).toMatch(/no longer open \(now resolved\)/);
      expect(el(f, 'finding')!.textContent).toMatch(/Dismissed/);
    });
  });

  describe('withdraw and reconsider', () => {
    it('withdraw confirms, posts with no body, then re-reads', () => {
      const f = setup(SUPER_OR_FINANCE, detail({ openedSide: 'ADMIN', openedBy: 'admin-me' }));
      click(f, 'withdraw-start');
      expect(el(f, 'confirm-panel')!.textContent).toMatch(/does not reverse any money movement/);
      click(f, 'confirm-action');
      const req = http.expectOne(api('/admin/deposit-disputes/d-1/withdraw'));
      expect(req.request.body ?? null).toBeNull();
      req.flush({ data: { id: 'd-1', status: 'WITHDRAWN' } });
      f.detectChanges();
      flushLoad(detail({ openedSide: 'ADMIN', openedBy: 'admin-me', status: 'WITHDRAWN', withdrawnAt: '2026-10-09T10:00:00.000Z' }));
      f.detectChanges();
      expect(el(f, 'withdrawn-note')).toBeTruthy();
      expect(el(f, 'actions')).toBeNull();
    });

    it('reconsideration posts the SAME target ids (an offline-refund case drops its derived settlement) + supersedesDisputeId, after a freeze warning', () => {
      const resolved = detail({ targetType: 'OFFLINE_REFUND', target: { offlineEventId: 'oe-7', settlementId: 's-1', deductionId: null, refundId: null },
        status: 'RESOLVED', finding: 'INCONCLUSIVE', effect: 'NONE', resolutionReason: 'r', resolvedBy: 'x', resolvedAt: '2026-10-09T10:00:00.000Z', effectExecuted: true });
      const f = setup(OPS, resolved, 'ops-me');
      click(f, 'reconsider-start');
      type(f, 'open-reason', 'New receipt provided');
      click(f, 'open-review');
      expect(el(f, 'confirm-panel')!.textContent).toMatch(/deposit refunds on this booking are paused/);
      click(f, 'confirm-action');
      const req: TestRequest = http.expectOne(api('/admin/deposit-disputes'));
      expect(req.request.body).toEqual({ bookingId: 'b-1', targetType: 'OFFLINE_REFUND', offlineEventId: 'oe-7', reason: 'New receipt provided', supersedesDisputeId: 'd-1' });
      req.flush({ data: { id: 'd-2' } });
      expect(navigate).toHaveBeenCalledWith(['/finance/deposit-disputes', 'd-2']);
    });

    it('an open-case conflict shows a link to the existing case and opens nothing else', () => {
      const resolved = detail({ status: 'RESOLVED', finding: 'INCONCLUSIVE', effect: 'NONE', resolutionReason: 'r', resolvedBy: 'x', resolvedAt: '2026-10-09T10:00:00.000Z', effectExecuted: true });
      const f = setup(SUPER_OR_FINANCE, resolved);
      click(f, 'reconsider-start');
      type(f, 'open-reason', 'again');
      click(f, 'open-review');
      click(f, 'confirm-action');
      http.expectOne(api('/admin/deposit-disputes')).flush(...conflict('DISPUTE_ALREADY_OPEN', { disputeId: 'd-open' }));
      f.detectChanges();
      expect(el(f, 'open-error')!.textContent).toMatch(/already open/);
      expect(el(f, 'open-error')!.querySelector('a')!.getAttribute('href')).toContain('/finance/deposit-disputes/d-open');
      http.expectNone(api('/admin/deposit-disputes'));
    });
  });
});
