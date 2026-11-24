import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RentInvoicesComponent } from './rent-invoices.component';
import { SessionStore } from '../../core/auth/session.store';
import { CurrentUser } from '../../core/models/role.model';
import { Capability } from '../../core/models/capability.model';
import { environment } from '../../../environments/environment';

const RUN = environment.apiBase + '/admin/rent-invoices/run';

const user = (capabilities: Capability[]): CurrentUser => ({
  id: 'u-1', name: 'Fin', email: 'f@nestpg.test', role: 'SUPER_ADMIN',
  backendRole: 'FINANCE_ADMIN', initials: 'F', organization: 'NestPG', capabilities,
});

const period = (over: Record<string, unknown> = {}) => ({
  bookingId: 'bk-1', bookingNumber: 'NPG2611-000101', residentName: 'Asha Rao', propertyName: 'Maple Nivas',
  tenantId: 't-1', propertyId: 'p-1', periodStart: '2026-11-28', periodEnd: '2026-12-28', fullPeriodEnd: '2026-12-28',
  partial: false, days: null, amountPaisa: 800000, ...over,
});

const PREVIEW = {
  asOf: '2026-11-24', leadDays: 7, dryRun: true,
  planned: [
    period(),
    period({ bookingId: 'bk-2', bookingNumber: 'NPG2611-000102', residentName: 'Vikram Shah', periodStart: '2026-11-30',
      periodEnd: '2026-12-10', partial: true, days: 10, amountPaisa: 300000 }),
    period({ bookingId: 'bk-3', bookingNumber: 'NPG2611-000103', residentName: 'Neha Joshi', periodStart: '2026-11-29',
      periodEnd: '2026-12-05', partial: true, days: 6, amountPaisa: null, problem: 'PRICE_NOT_CONFIGURED_FOR_UNIT' }),
  ],
  created: [], skipped: [],
  withoutBillingAnchor: [{ bookingId: 'bk-9', bookingNumber: 'NPG2609-000009', residentName: 'Ravi K', propertyName: 'Cedar House', checkInDate: '2026-09-01' }],
};

/** Monthly rent — preview, attention lists, and the confirmed run. */
describe('RentInvoicesComponent', () => {
  let http: HttpTestingController;

  const setup = (capabilities: Capability[] = ['FINANCIAL_OPERATIONS']) => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(SessionStore).setUser(user(capabilities));
    const f = TestBed.createComponent(RentInvoicesComponent);
    f.detectChanges();
    return f;
  };
  const answer = (dryRun: boolean, data: unknown) => {
    const req = http.expectOne((r) => r.url === RUN + (dryRun ? '?dryRun=true' : ''));
    expect(req.request.method).toBe('POST');
    req.flush({ success: true, data, meta: null, errors: [] });
  };
  const el = (f: { nativeElement: HTMLElement }, id: string) => f.nativeElement.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

  afterEach(() => http.verify());

  it('opens with a DRY RUN — it never raises anything just by being looked at', () => {
    const f = setup();
    expect(el(f, 'rent-loading')).toBeTruthy();
    answer(true, PREVIEW);
    f.detectChanges();
    expect(el(f, 'rent-loading')).toBeNull();
  });

  it('shows what is due with resident, property, period and amount; totals only what can be priced', () => {
    const f = setup();
    answer(true, PREVIEW); f.detectChanges();
    expect(norm(el(f, 'tile-due')?.textContent)).toContain('2');
    expect(norm(el(f, 'tile-total')?.textContent)).toContain('₹11,000');
    expect(norm(el(f, 'tile-attention')?.textContent)).toContain('1');
    expect(norm(el(f, 'tile-no-anchor')?.textContent)).toContain('1');
    const rows = [...el(f, 'rent-due')!.querySelectorAll('tbody tr')].map((tr) => norm(tr.textContent));
    expect(rows[0]).toContain('NPG2611-000101');
    expect(rows[0]).toContain('Asha Rao');
    expect(rows[0]).toContain('Maple Nivas');
    expect(rows[0]).toContain('1 month');
    expect(rows[0]).toContain('₹8,000');
    expect(rows[1]).toContain('10 days');
    expect(rows[1]).toContain('₹3,000');
    expect(rows.length).toBe(2);
    expect(norm(el(f, 'rent-asof')?.textContent)).toContain('periods starting by 1 Dec 2026');
  });

  it('explains what can’t be priced and what isn’t billed automatically', () => {
    const f = setup();
    answer(true, PREVIEW); f.detectChanges();
    const att = norm(el(f, 'rent-attention')?.textContent);
    expect(att).toContain('NPG2611-000103');
    expect(att).toContain('6 days');
    expect(att).toContain('daily rate');
    const na = norm(el(f, 'rent-no-anchor')?.textContent);
    expect(na).toContain('NPG2609-000009');
    expect(na).toContain('checked in 1 Sept 2026'.replace('Sept', 'Sep'));
    expect(na).toContain('won’t bill them');
  });

  it('links to the daily-rate report only for admins who can open it', () => {
    let f = setup(['FINANCIAL_OPERATIONS']);
    answer(true, PREVIEW); f.detectChanges();
    expect(el(f, 'rent-attention')!.querySelector('a[href="/properties/daily-rates"]')).toBeNull();
    TestBed.resetTestingModule();
    f = setup(['FINANCIAL_OPERATIONS', 'PROPERTY_OPERATIONS']);
    answer(true, PREVIEW); f.detectChanges();
    expect(el(f, 'rent-attention')!.querySelector('a[href="/properties/daily-rates"]')).toBeTruthy();
  });

  it('raises only after confirming, reports what actually happened, then refreshes the preview', () => {
    const f = setup();
    answer(true, PREVIEW); f.detectChanges();
    el(f, 'run')!.click(); f.detectChanges();
    expect(norm(el(f, 'run-confirm-panel')?.textContent)).toContain('Raise 2 rent invoices totalling ₹11,000 now?');
    http.expectNone(RUN);                             // nothing sent before confirming
    el(f, 'run-confirm')!.click();
    answer(false, {
      ...PREVIEW, dryRun: false,
      created: [{ ...period(), invoiceId: 'inv-1', invoiceNumber: 'INV-202611-0042' }],
      skipped: [{ bookingId: 'bk-2', periodStart: '2026-11-30', reason: 'ALREADY_INVOICED' }],
    });
    f.detectChanges();
    const res = norm(el(f, 'run-result')?.textContent);
    expect(res).toContain('Raised 1 rent invoice — ₹8,000');
    expect(res).toContain('INV-202611-0042');
    expect(norm(el(f, 'run-skipped')?.textContent)).toContain('NPG2611-000102 · Vikram Shah');
    expect(norm(el(f, 'run-skipped')?.textContent)).toContain('Already invoiced');
    answer(true, { ...PREVIEW, planned: [] });       // the refreshed preview
    f.detectChanges();
    expect(el(f, 'rent-none-due')).toBeTruthy();
    expect(el(f, 'run')).toBeNull();
  });

  it('cancel sends nothing', () => {
    const f = setup();
    answer(true, PREVIEW); f.detectChanges();
    el(f, 'run')!.click(); f.detectChanges();
    [...el(f, 'run-confirm-panel')!.querySelectorAll('button')].find((b) => b.textContent!.includes('Cancel'))!.click();
    f.detectChanges();
    expect(el(f, 'run-confirm-panel')).toBeNull();
    http.expectNone(RUN);
  });

  it('a failed run is shown and the preview stays — nothing pretends to have happened', () => {
    const f = setup();
    answer(true, PREVIEW); f.detectChanges();
    el(f, 'run')!.click(); f.detectChanges();
    el(f, 'run-confirm')!.click();
    http.expectOne(RUN).flush({ errors: [{ code: 'FORBIDDEN', message: 'Forbidden' }] }, { status: 403, statusText: 'Forbidden' });
    f.detectChanges();
    expect(el(f, 'run-error')).toBeTruthy();
    expect(el(f, 'run-result')).toBeNull();
    expect(el(f, 'rent-due')).toBeTruthy();
  });

  it('nothing due is said plainly, with no run button', () => {
    const f = setup();
    answer(true, { ...PREVIEW, planned: [], withoutBillingAnchor: [] }); f.detectChanges();
    expect(norm(el(f, 'rent-none-due')?.textContent)).toContain('Nothing is due');
    expect(el(f, 'run')).toBeNull();
    expect(el(f, 'rent-attention')).toBeNull();
    expect(el(f, 'rent-no-anchor')).toBeNull();
  });

  it('a failed preview is an ERROR with a retry — never "nothing is due"', () => {
    const f = setup();
    http.expectOne((r) => r.url.startsWith(RUN)).flush({ errors: [{ code: 'X', message: 'Server down' }] }, { status: 500, statusText: 'Server Error' });
    f.detectChanges();
    expect(el(f, 'rent-error')).toBeTruthy();
    expect(el(f, 'rent-none-due')).toBeNull();
    (el(f, 'rent-error')!.querySelector('button') as HTMLButtonElement).click();
    answer(true, PREVIEW); f.detectChanges();
    expect(el(f, 'rent-due')).toBeTruthy();
  });
});
