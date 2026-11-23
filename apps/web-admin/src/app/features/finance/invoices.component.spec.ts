import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { InvoicesComponent } from './invoices.component';
import { SessionStore } from '../../core/auth/session.store';
import { CurrentUser } from '../../core/models/role.model';
import { environment } from '../../../environments/environment';

const LIST = environment.apiBase + '/invoices';

const user: CurrentUser = {
  id: 'u-1', name: 'Fin', email: 'f@nestpg.test', role: 'SUPER_ADMIN',
  backendRole: 'FINANCE_ADMIN', initials: 'F', organization: 'NestPG', capabilities: ['FINANCIAL_OPERATIONS'],
};

/** Exactly what the API returns (`toInvoiceView`). */
const invoice = (over: Record<string, unknown> = {}) => ({
  id: 'inv-1', invoiceNumber: 'INV-202611-0001', bookingId: 'bk-1', corporateBookingId: null,
  customerUserId: 'tnt-1', propertyId: 'p-1', status: 'ISSUED', billingUnit: null,
  issueDate: '2026-11-04', dueDate: '2026-11-18', periodStart: null, periodEnd: null,
  subtotalPaisa: 800000, taxPaisa: 0, totalPaisa: 800000, paidPaisa: 300000, balancePaisa: 500000,
  notes: null, createdAt: '2026-11-04T06:00:00.000Z', updatedAt: '2026-11-04T06:00:00.000Z',
  ...over,
});

describe('InvoicesComponent', () => {
  let http: HttpTestingController;

  const setup = (rows = [invoice(), invoice({ id: 'inv-2', invoiceNumber: 'INV-202611-0002', totalPaisa: 120000, balancePaisa: 120000 })]) => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(SessionStore).setUser(user);
    const fixture = TestBed.createComponent(InvoicesComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === LIST).flush({ success: true, data: rows, meta: { page: 1, limit: 20, total: rows.length, totalPages: 1 } });
    fixture.detectChanges();
    return fixture;
  };
  const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ');

  afterEach(() => http.verify());

  it('lists the number, due date and amounts the API returns', () => {
    const f = setup();
    const row = text(f.nativeElement.querySelector('tbody tr'));
    expect(row).toContain('INV-202611-0001');
    expect(row).toContain('18 Nov 2026');
    expect(row).toContain('₹8.0K');
    expect(row).toContain('₹5.0K');
  });

  const openDrawer = (f: ReturnType<typeof setup>, detail: Record<string, unknown>) => {
    (f.nativeElement.querySelector('tbody tr button') as HTMLButtonElement).click();
    http.expectOne((r) => r.url === `${LIST}/${detail['id']}`).flush({ success: true, data: { ...detail, lines: [], payments: [] } });
    f.detectChanges();
    return text(f.nativeElement);
  };
  /** The drawer's Void action (red), not the 'Void' status filter tab. */
  const voidActions = (f: ReturnType<typeof setup>) => [...f.nativeElement.querySelectorAll('button.text-danger')].filter((b) => (b as HTMLElement).textContent?.trim() === 'Void');

  it('VOID-06: an invoice with payments applied offers no Void and says why', () => {
    const f = setup([invoice({ status: 'PARTIAL' })]);
    const t = openDrawer(f, invoice({ status: 'PARTIAL', paidPaisa: 300000, balancePaisa: 500000 }));
    expect(voidActions(f)).toHaveLength(0);
    expect(t).toContain('Payments have been applied to this invoice');
  });

  it('an unpaid issued invoice still offers Void', () => {
    const f = setup([invoice({ paidPaisa: 0, balancePaisa: 800000 })]);
    const t = openDrawer(f, invoice({ paidPaisa: 0, balancePaisa: 800000 }));
    expect(voidActions(f)).toHaveLength(1);
    expect(t).not.toContain('Payments have been applied');
  });

  it('Void asks first: nothing is sent until "Void invoice" is confirmed; "Keep invoice" backs out', () => {
    const f = setup([invoice({ paidPaisa: 0, balancePaisa: 800000 })]);
    openDrawer(f, invoice({ paidPaisa: 0, balancePaisa: 800000 }));
    const button = (label: string) => [...f.nativeElement.querySelectorAll('button')].find((b) => (b as HTMLElement).textContent?.trim() === label) as HTMLButtonElement | undefined;
    voidActions(f)[0].click(); f.detectChanges();
    http.expectNone((r) => r.url.endsWith('/void'));
    const confirm = f.nativeElement.querySelector('[data-testid="void-confirm"]') as HTMLElement;
    expect(text(confirm)).toContain('Void INV-202611-0001?');
    expect(text(confirm)).toContain("can't be undone");
    button('Keep invoice')!.click(); f.detectChanges();
    expect(f.nativeElement.querySelector('[data-testid="void-confirm"]')).toBeNull();
    http.expectNone((r) => r.url.endsWith('/void'));
    voidActions(f)[0].click(); f.detectChanges();
    button('Void invoice')!.click();
    const req = http.expectOne((r) => r.url === `${LIST}/inv-1/void`);
    expect(req.request.method).toBe('POST');
    req.flush({ success: true, data: { ...invoice({ status: 'VOID' }), lines: [], payments: [] } });
    for (const r of http.match((x) => x.url === LIST)) r.flush({ success: true, data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } });
  });

  it('search filters by invoice number as it changes', () => {
    const f = setup();
    f.componentInstance.search.set('0002');
    f.detectChanges();
    const rows = f.nativeElement.querySelectorAll('tbody tr');
    expect(rows.length).toBe(1);
    expect(text(rows[0])).toContain('INV-202611-0002');
  });
});
