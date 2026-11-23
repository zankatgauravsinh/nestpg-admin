import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BookingDepositHistoryComponent } from './booking-deposit-history.component';
import { SessionStore } from '../../../core/auth/session.store';
import { environment } from '../../../../environments/environment';
import { Capability } from '../../../core/models/capability.model';
import { adminUser, history, OPS, READ_ONLY } from './dispute-test-fixtures';

const api = (p: string) => environment.apiBase + p;
const HISTORY = api('/admin/bookings/b-1/deposit-history');

/** ADM-D.1 — a booking's deposit history: server figures only, no private fields, open-case entry points. */
describe('BookingDepositHistoryComponent', () => {
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;
  const setup = (caps: Capability[]) => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ bookingId: 'b-1' })) } }] });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(SessionStore).setUser(adminUser(caps));
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const f = TestBed.createComponent(BookingDepositHistoryComponent);
    f.detectChanges();
    return f;
  };
  const el = (f: { nativeElement: HTMLElement }, id: string) => f.nativeElement.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const ok = (f: { detectChanges: () => void }, h = history(), refund: object | null = { rail: 'OFFLINE', state: 'AWAITING_CONFIRMATION', amountPaisa: 1400000, completedAt: null }) => {
    http.expectOne(HISTORY).flush({ data: h });
    f.detectChanges();
    http.expectOne(api('/bookings/b-1')).flush({ data: { id: 'b-1', bookingNumber: 'NPG2610-000514', status: 'CHECKED_OUT', tenantName: 'Asha R', propertyName: 'Maple Nivas', depositRefund: refund } });
    f.detectChanges();
  };
  afterEach(() => http.verify());

  it('loading → the chain with the live settlement marked, server figures, no private data', () => {
    const f = setup(READ_ONLY);
    expect(el(f, 'history-loading')).toBeTruthy();
    ok(f);
    expect(el(f, 'settlement-s-2')!.querySelector('[data-testid="live-tail"]')).toBeTruthy();
    expect(el(f, 'settlement-s-1')!.querySelector('[data-testid="live-tail"]')).toBeNull();
    expect(el(f, 'settlement-s-2')!.textContent).toMatch(/refundable ₹14,000/);
    expect(el(f, 'refund-state')!.textContent).toMatch(/OFFLINE · AWAITING_CONFIRMATION/);
    const text = f.nativeElement.textContent!;
    expect(text).not.toMatch(/should-not-render|secretKey|"raw"|\[object Object\]/); // booking-history metadata is never rendered
    expect(el(f, 'history-booking')!.textContent).toMatch(/Asha R/);
  });

  it('ON_HOLD (server-derived) is explained; no reconciliation button exists', () => {
    const f = setup(OPS);
    ok(f, history(), { rail: 'ONLINE', state: 'ON_HOLD', amountPaisa: 1400000, completedAt: null });
    expect(el(f, 'refund-state')!.textContent).toMatch(/cannot be executed automatically/);
    expect(f.nativeElement.textContent).not.toMatch(/reconcil/i);
    http.expectNone(api('/payments/ops/reconcile-deposit-refunds'));
  });

  it('empty history and a missing deposit are stated, not errors', () => {
    const f = setup(READ_ONLY);
    ok(f, history({ deposit: null, offlineEvents: [], settlements: [], refunds: [], disputes: [], bookingHistory: [] }), null);
    expect(el(f, 'no-deposit')).toBeTruthy();
    expect(el(f, 'history-empty')).toBeTruthy();
  });

  it('not found / forbidden / failure show an error state', () => {
    const f = setup(READ_ONLY);
    http.expectOne(HISTORY).flush({ errors: [{ code: 'Not Found', message: 'BOOKING_NOT_FOUND' }] }, { status: 404, statusText: 'Not Found' });
    f.detectChanges();
    expect(el(f, 'history-error')!.textContent).toMatch(/Booking not found/);
    TestBed.resetTestingModule();
    const g = setup(READ_ONLY);
    http.expectOne(HISTORY).flush({ errors: [{ code: 'Forbidden', message: 'Forbidden resource' }] }, { status: 403, statusText: 'Forbidden' });
    g.detectChanges();
    expect(el(g, 'history-error')!.textContent).toMatch(/Your role cannot do this/);
  });

  it('open-case entry points: only with OPERATIONS, only on confirmed records and the LIVE settlement', () => {
    const ro = setup(READ_ONLY);
    ok(ro);
    expect(ro.nativeElement.querySelector('[data-testid^="open-"]')).toBeNull();
    TestBed.resetTestingModule();
    const f = setup(OPS);
    ok(f);
    expect(el(f, 'open-oe-oe-1')).toBeTruthy();     // CONFIRMED collection
    expect(el(f, 'open-oe-oe-2')).toBeNull();       // WAITING refund record: not a target
    expect(el(f, 'open-st-s-2')).toBeTruthy();      // live settlement
    expect(el(f, 'open-st-s-1')).toBeNull();        // superseded history
    expect(el(f, 'open-dd-dd-3')).toBeTruthy();
    expect(el(f, 'open-dd-dd-1')).toBeNull();
  });

  it('opening a line case: freeze warning, then exactly the settlement + deduction ids; navigates to the new case', () => {
    const f = setup(OPS);
    ok(f);
    el(f, 'open-dd-dd-3')!.click(); f.detectChanges();
    const t = el(f, 'open-reason') as HTMLTextAreaElement; t.value = 'Cleaning charged twice'; t.dispatchEvent(new Event('input')); f.detectChanges();
    el(f, 'open-review')!.click(); f.detectChanges();
    expect(el(f, 'confirm-panel')!.textContent).toMatch(/refunds on this booking are paused/);
    el(f, 'confirm-action')!.click(); f.detectChanges();
    const req = http.expectOne(api('/admin/deposit-disputes'));
    expect(req.request.body).toEqual({ bookingId: 'b-1', targetType: 'SETTLEMENT', settlementId: 's-2', deductionId: 'dd-3', reason: 'Cleaning charged twice' });
    req.flush({ data: { id: 'd-new' } });
    expect(navigate).toHaveBeenCalledWith(['/finance/deposit-disputes', 'd-new']);
  });

  it('a lifetime-cap refusal is explained and nothing is retried', () => {
    const f = setup(OPS);
    ok(f);
    el(f, 'open-oe-oe-1')!.click(); f.detectChanges();
    const t = el(f, 'open-reason') as HTMLTextAreaElement; t.value = 'x'; t.dispatchEvent(new Event('input')); f.detectChanges();
    el(f, 'open-review')!.click(); f.detectChanges();
    el(f, 'confirm-action')!.click(); f.detectChanges();
    http.expectOne(api('/admin/deposit-disputes')).flush({ errors: [{ code: 'DISPUTE_LIFETIME_CAP_REACHED', message: 'DISPUTE_LIFETIME_CAP_REACHED', details: { cap: 2, side: 'ADMIN' } }] }, { status: 409, statusText: 'Conflict' });
    f.detectChanges();
    expect(el(f, 'open-error')!.textContent).toMatch(/maximum number of cases/);
    http.expectNone(api('/admin/deposit-disputes'));
  });
});
