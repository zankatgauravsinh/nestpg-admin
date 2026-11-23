import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DepositDisputesService, openBodyFor } from './deposit-disputes.service';
import { environment } from '../../../environments/environment';

const url = (p: string) => environment.apiBase + p;

/** ADM-D.1 — the service speaks exactly the backend contract (paths, params, bodies). */
describe('DepositDisputesService', () => {
  let http: HttpTestingController;
  let svc: DepositDisputesService;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    svc = TestBed.inject(DepositDisputesService);
  });
  afterEach(() => http.verify());

  it('queue: only the backend filters, page/limit, and the meta is returned as-is', () => {
    let meta: unknown;
    svc.queue({ status: 'OPEN', targetType: 'SETTLEMENT', bookingId: 'b-1', propertyId: 'p-1', page: 2 }).subscribe((r) => (meta = r.meta));
    const req = http.expectOne((r) => r.url === url('/admin/deposit-disputes'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys().sort()).toEqual(['bookingId', 'limit', 'page', 'propertyId', 'status', 'targetType']);
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('20');
    req.flush({ data: [], meta: { page: 2, limit: 20, total: 0 } });
    expect(meta).toEqual({ page: 2, limit: 20, total: 0 });
  });

  it('queue without filters sends no empty params', () => {
    svc.queue().subscribe();
    const req = http.expectOne((r) => r.url === url('/admin/deposit-disputes'));
    expect(req.request.params.keys().sort()).toEqual(['limit', 'page']);
    req.flush({ data: [], meta: { page: 1, limit: 20, total: 0 } });
  });

  it('detail, deposit history and booking context are plain GETs on the admin / booking routes', () => {
    svc.detail('d-1').subscribe();
    svc.depositHistory('b-1').subscribe();
    svc.bookingContext('b-1').subscribe();
    http.expectOne(url('/admin/deposit-disputes/d-1')).flush({ data: {} });
    http.expectOne(url('/admin/bookings/b-1/deposit-history')).flush({ data: {} });
    http.expectOne(url('/bookings/b-1')).flush({ data: {} });
  });

  it('note / withdraw / resolve / execute bodies', () => {
    svc.addNote('d-1', 'checked the receipt').subscribe();
    svc.withdraw('d-1').subscribe();
    svc.resolve('d-1', { finding: 'UPHELD', effect: 'SETTLEMENT_SUPERSEDED', resolutionReason: 'r', resolutionVersion: 'dispute-resolution-v1' }).subscribe();
    svc.executeEffect('d-1').subscribe();
    const note = http.expectOne(url('/admin/deposit-disputes/d-1/notes'));
    expect(note.request.body).toEqual({ note: 'checked the receipt' });
    const wd = http.expectOne(url('/admin/deposit-disputes/d-1/withdraw'));
    expect(wd.request.method).toBe('POST');
    expect(wd.request.body ?? null).toBeNull();
    const res = http.expectOne(url('/admin/deposit-disputes/d-1/resolve'));
    expect(res.request.body).toEqual({ finding: 'UPHELD', effect: 'SETTLEMENT_SUPERSEDED', resolutionReason: 'r', resolutionVersion: 'dispute-resolution-v1' });
    const ex = http.expectOne(url('/admin/deposit-disputes/d-1/execute-effect'));
    expect(ex.request.body).toEqual({}); // empty by contract: no amount, no id
    [note, wd, res, ex].forEach((r) => r.flush({ data: {} }));
  });

  it('never calls the refund reconciliation endpoint', () => {
    expect(Object.getOwnPropertyNames(DepositDisputesService.prototype).join(',')).not.toMatch(/reconcile/i);
    http.expectNone(url('/payments/ops/reconcile-deposit-refunds'));
  });

  it('errors propagate (no swallowing into an empty result)', () => {
    let failed = false; let got: unknown = 'untouched';
    svc.queue().subscribe({ next: (r) => (got = r), error: () => (failed = true) });
    http.expectOne((r) => r.url === url('/admin/deposit-disputes')).flush('boom', { status: 500, statusText: 'Server Error' });
    expect(failed).toBe(true);
    expect(got).toBe('untouched');
  });

  describe('openBodyFor — exactly the ids each target type takes', () => {
    const refs = { offlineEventId: 'e-1', settlementId: 's-1', deductionId: 'dd-1', refundId: 'r-1' };
    it('offline types send only the event (the refund case\'s settlement is derived server-side)', () => {
      expect(openBodyFor('b-1', 'OFFLINE_COLLECTION', refs, 'x')).toEqual({ bookingId: 'b-1', targetType: 'OFFLINE_COLLECTION', reason: 'x', offlineEventId: 'e-1' });
      expect(openBodyFor('b-1', 'OFFLINE_REFUND', refs, 'x')).toEqual({ bookingId: 'b-1', targetType: 'OFFLINE_REFUND', reason: 'x', offlineEventId: 'e-1' });
    });
    it('a settlement case sends the settlement and, for a line case, the deduction', () => {
      expect(openBodyFor('b-1', 'SETTLEMENT', { settlementId: 's-1', deductionId: null }, 'x')).toEqual({ bookingId: 'b-1', targetType: 'SETTLEMENT', reason: 'x', settlementId: 's-1' });
      expect(openBodyFor('b-1', 'SETTLEMENT', refs, 'x')).toMatchObject({ settlementId: 's-1', deductionId: 'dd-1' });
      expect(openBodyFor('b-1', 'SETTLEMENT', refs, 'x')).not.toHaveProperty('offlineEventId');
    });
    it('an online refund case sends only the refund; a reconsideration adds supersedesDisputeId', () => {
      expect(openBodyFor('b-1', 'ONLINE_REFUND', refs, 'x', 'd-0')).toEqual({ bookingId: 'b-1', targetType: 'ONLINE_REFUND', reason: 'x', refundId: 'r-1', supersedesDisputeId: 'd-0' });
    });
  });
});
