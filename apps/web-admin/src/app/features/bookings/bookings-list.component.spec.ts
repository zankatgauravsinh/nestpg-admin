import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { BookingsListComponent } from './bookings-list.component';
import { SessionStore } from '../../core/auth/session.store';
import { CurrentUser } from '../../core/models/role.model';

const ops: CurrentUser = { id: 'u-1', name: 'Ops', email: 'o@nestpg.test', role: 'SUPER_ADMIN', backendRole: 'OPS_ADMIN', initials: 'O', organization: 'NestPG', capabilities: ['BOOKING_OPERATIONS', 'OPERATIONAL_READ'] as never };
const hold = { id: 'res-1', bedId: 'bed-1', status: 'ACTIVE', expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), reservedFrom: '2026-12-01', reservedUntil: '2026-12-31', tenantName: 'Riya', propertyName: 'Sunrise', roomNumber: '101', bedNumber: 'B1' };
const page = (data: unknown[]) => ({ success: true, data, meta: { page: 1, limit: 20, total: data.length, totalPages: 1 } });

describe('BookingsListComponent — New booking uses the hold’s quoted rent', () => {
  let http: HttpTestingController;
  afterEach(() => http.verify());

  function setup() {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(SessionStore).setUser(ops);
    const f = TestBed.createComponent(BookingsListComponent);
    f.detectChanges();
    const flushRest = () => { for (const r of http.match(() => true)) r.flush(r.request.url.endsWith('/reservations') ? { success: true, data: [hold] } : page([])); f.detectChanges(); };
    flushRest();
    return { f, c: f.componentInstance as unknown as { newBooking(): void; pickHold(id: string): void; submitBooking(): void; reservationId: string; rent: number | null; createErr(): string | null; quotedRent(): number | null }, flushRest };
  }

  it('picking a hold fills in the server quote and says the booking must use it', () => {
    const { f, c, flushRest } = setup();
    c.newBooking(); flushRest();
    c.reservationId = 'res-1'; c.pickHold('res-1');
    http.expectOne((r) => r.url.endsWith('/reservations/res-1/quote')).flush({ success: true, data: { rentPaisa: '800000', securityDepositPaisa: '1000000' } });
    f.detectChanges();
    expect(c.rent).toBe(8000);
    expect(c.quotedRent()).toBe(800000);
    expect((f.nativeElement.querySelector('[data-testid="quoted-rent"]') as HTMLElement).textContent).toContain('8,000');
  });

  it('a different rent is refused with the quoted figure in the message', () => {
    const { c, flushRest } = setup();
    c.newBooking(); flushRest();
    c.reservationId = 'res-1'; c.pickHold('res-1');
    http.expectOne((r) => r.url.endsWith('/quote')).flush({ success: true, data: { rentPaisa: 800000, securityDepositPaisa: 1000000 } });
    c.rent = 9000;
    c.submitBooking();
    const req = http.expectOne((r) => r.url.endsWith('/bookings') && r.method === 'POST');
    expect(req.request.body).toEqual({ reservationId: 'res-1', rentPaisa: 900000 });
    req.flush({ success: false, errors: [{ code: 'Bad Request', message: 'BOOKING_RENT_MISMATCH' }] }, { status: 400, statusText: 'Bad Request' });
    expect(c.createErr()).toBe('Rent mismatch: this hold’s quoted rent is ₹8,000. Use the quoted amount.'.replace('’', "'"));
  });
});
