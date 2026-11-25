import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PaymentsReviewComponent } from './payments-review.component';
import { environment } from '../../../environments/environment';

const BASE = environment.apiBase + '/payments';
const CASE = {
  id: 'c1', payment_id: 'p1', payment_number: 'PAY-202611-0001', gateway_payment_id: 'pay_gw_1', gateway_order_id: 'order_1',
  reason: 'AMOUNT_MISMATCH', expected_paisa: '800000', captured_paisa: '500000', currency: 'INR', state: 'REQUIRED', outcome: null, note: null,
  resolved_at: null, resolved_by_name: null, created_at: '2026-11-25T10:00:00Z', purpose: 'RENT', invoice_id: 'i1', reservation_id: null, booking_id: null,
  property_name: 'Maple Nivas', booking_number: null, invoice_number: 'INV-1', payer_name: 'Asha Rao',
};
const EXTRA = {
  id: 'p2', payment_number: 'PAY-202611-0002', purpose: 'RENT', method: 'UPI', gateway: 'RAZORPAY', status: 'SUCCESS', amount_paisa: '800000',
  allocated_paisa: '300000', refunded_paisa: '0', unapplied_paisa: '500000', paid_at: '2026-11-25T10:00:00Z', booking_number: null,
  invoice_number: 'INV-2', invoice_status: 'PAID', property_name: 'Maple Nivas', payer_name: 'Vikram Shah',
};

describe('PaymentsReviewComponent', () => {
  let http: HttpTestingController;
  const open = () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(PaymentsReviewComponent);
    f.detectChanges();
    return f;
  };
  type Fix = ReturnType<typeof open>;
  const mm = () => http.expectOne((r) => r.url.startsWith(BASE + '/ops/amount-mismatches') && r.method === 'GET');
  const un = () => http.expectOne((r) => r.url.startsWith(BASE + '/ops/unapplied'));
  const ok = (data: unknown, total = 0) => ({ success: true, data, meta: { page: 1, limit: 20, total }, errors: [] });
  const both = (f: Fix, cases: unknown[] = [CASE], items: unknown[] = [EXTRA]) => {
    mm().flush(ok(cases, cases.length));
    un().flush(ok({ items, unappliedPaisa: items.length ? 500000 : 0 }, items.length));
    f.detectChanges();
  };
  const el = (f: Fix, id: string) => (f.nativeElement as HTMLElement).querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const txt = (n: HTMLElement | null) => (n?.textContent ?? '').replace(/\s+/g, ' ');
  const click = (f: Fix, id: string) => { el(f, id)!.click(); f.detectChanges(); };
  const type = async (f: Fix, v: string) => {
    const n = el(f, 'note') as HTMLInputElement; n.value = v; n.dispatchEvent(new Event('input')); await f.whenStable(); f.detectChanges();
  };
  afterEach(() => http.verify());

  it('shows what was asked for against what was captured, and the unapplied money with its total', () => {
    const f = open(); both(f);
    expect(txt(el(f, 'mismatch'))).toMatch(/Asked for ₹8,000.*captured ₹5,000/);
    expect(txt(el(f, 'mismatch'))).toContain('Invoice INV-1');
    expect(txt(el(f, 'unapplied-row'))).toMatch(/₹5,000 of ₹8,000 not needed/);
    expect(txt(el(f, 'unapplied-total'))).toContain('₹5,000');
  });

  it('a failed read is an error with a retry, never "nothing to review"', () => {
    const f = open();
    mm().flush({}, { status: 500, statusText: 'x' }); un().flush({}, { status: 500, statusText: 'x' }); f.detectChanges();
    expect(el(f, 'mismatches-error')).toBeTruthy(); expect(el(f, 'mismatches-empty')).toBeNull();
    expect(el(f, 'unapplied-error')).toBeTruthy(); expect(el(f, 'unapplied-empty')).toBeNull();
  });

  it('empty lists say so', () => {
    const f = open(); both(f, [], []);
    expect(el(f, 'mismatches-empty')).toBeTruthy(); expect(el(f, 'unapplied-empty')).toBeTruthy();
  });

  it('accepting needs a reason, sends no amount, and refreshes both lists', async () => {
    const f = open(); both(f);
    click(f, 'accept');
    expect((el(f, 'confirm') as HTMLButtonElement).disabled).toBe(true);
    await type(f, 'Resident agreed');
    click(f, 'confirm');
    const req = http.expectOne(BASE + '/ops/amount-mismatches/c1/accept');
    expect(req.request.body).toEqual({ note: 'Resident agreed' });
    req.flush(ok({})); f.detectChanges();
    both(f, [], []);
    expect(txt(el(f, 'review-done'))).toContain('captured amount accepted');
  });

  it('a refused close explains itself and keeps the case', async () => {
    const f = open(); both(f);
    click(f, 'close'); await type(f, 'Refunded there'); click(f, 'confirm');
    http.expectOne(BASE + '/ops/amount-mismatches/c1/close').flush({ success: false, errors: [{ code: 'Conflict', message: 'GATEWAY_REFUND_NOT_COMPLETE' }] }, { status: 409, statusText: 'Conflict' });
    f.detectChanges();
    expect(txt(el(f, 'action-error'))).toContain('fully refunded yet');
    expect(el(f, 'mismatch')).toBeTruthy();
  });

  it('money in another currency can only be closed, not accepted', () => {
    const f = open(); both(f, [{ ...CASE, reason: 'CURRENCY_MISMATCH', currency: 'USD' }]);
    expect(el(f, 'accept')).toBeNull(); expect(el(f, 'close')).toBeTruthy();
    expect(txt(el(f, 'mismatch'))).toContain('USD 5000');
  });

  it('a refund is exactly the unapplied amount, flagged so it can never reach applied money, and a second click sends nothing', async () => {
    const f = open(); both(f);
    click(f, 'refund'); await type(f, 'Paid twice');
    const btn = el(f, 'confirm') as HTMLButtonElement; btn.click(); btn.click();
    const req = http.expectOne(BASE + '/p2/refund');
    expect(req.request.body).toEqual({ amountPaisa: 500000, reason: 'Paid twice', unappliedOnly: true });
    req.flush(ok({})); f.detectChanges();
    both(f, [], []);
    expect(txt(el(f, 'review-done'))).toContain('refund sent to Razorpay');
  });

  it('the resolved tab shows who resolved it and why', () => {
    const f = open(); both(f);
    click(f, 'state-RESOLVED');
    mm().flush(ok([{ ...CASE, state: 'RESOLVED', outcome: 'ACCEPTED', note: 'Agreed', resolved_at: '2026-11-25T11:00:00Z', resolved_by_name: 'Fin A' }], 1)); f.detectChanges();
    expect(txt(el(f, 'resolution'))).toMatch(/Captured amount accepted · Fin A .* Agreed/);
    expect(el(f, 'accept')).toBeNull();
  });
});
