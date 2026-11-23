import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ReservationsComponent } from './reservations.component';
import { SessionStore } from '../../core/auth/session.store';
import { CurrentUser } from '../../core/models/role.model';
import { environment } from '../../../environments/environment';
import { clock } from '../../core/data/reservation-display';

const LIST = environment.apiBase + '/reservations';
const user: CurrentUser = {
  id: 'u-1', name: 'Ops', email: 'o@nestpg.test', role: 'SUPER_ADMIN',
  backendRole: 'OPS_ADMIN', initials: 'O', organization: 'NestPG', capabilities: [],
};

/** Exactly what `GET /reservations` returns since D4: the hold plus its labels. */
const row = (over: Record<string, unknown> = {}) => ({
  id: 'res-1', bedId: 'bed-1', tenantId: 'tnt-1', status: 'ACTIVE',
  reservedFrom: '2026-11-12', reservedUntil: '2026-12-12', expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  convertedToBookingId: null, createdAt: '2026-11-12T05:00:00.000Z', updatedAt: '2026-11-12T05:00:00.000Z',
  tenantName: 'Riya Shah', tenantPhone: '9000000001', propertyName: 'Sunrise House', roomNumber: '101', bedNumber: 'B1', bedLabel: null,
  ...over,
});

describe('ReservationsComponent (D4)', () => {
  let http: HttpTestingController;
  afterEach(() => http.verify());

  const setup = (rows: unknown[]) => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(SessionStore).setUser(user);
    const fixture = TestBed.createComponent(ReservationsComponent);
    fixture.detectChanges();
    http.expectOne((r) => r.url === LIST).flush({ success: true, data: rows, meta: { page: 1, limit: 20, total: rows.length, totalPages: 1 } });
    // The page also loads the property list for its New reservation form.
    for (const req of http.match((r) => r.url.endsWith('/properties'))) req.flush({ success: true, data: [], meta: { page: 1, limit: 50, total: 0, totalPages: 0 } });
    fixture.detectChanges();
    return fixture;
  };
  const rows = (f: ReturnType<typeof setup>) => [...f.nativeElement.querySelectorAll('tbody tr')].map((tr: Element) => (tr.textContent ?? '').replace(/\s+/g, ' '));

  it('names the resident and the bed, and shows the 15-minute hold expiry, not the stay end, as when it lapses', () => {
    const r = row();
    const [line] = rows(setup([r]));
    expect(line).toContain('Riya Shah');
    expect(line).toContain('Sunrise House · Room 101 · Bed B1');
    expect(line).toContain(`Expires ${clock(new Date(r.expiresAt))}`);
    expect(line).toMatch(/\d+ min left/);
    expect(line).toContain('2026-11-12 → 2026-12-12');
    expect(line).not.toContain('Reservation');
  });

  it('a hold past its expiry reads Expired even while the row is still ACTIVE', () => {
    const [line] = rows(setup([row({ expiresAt: new Date(Date.now() - 60_000).toISOString() })]));
    expect(line).toMatch(/Expired at \d\d:\d\d/);
    expect(line.toLowerCase()).toContain('expired');
    expect(line).not.toContain('min left');
  });

  it('falls back to the phone when the resident has no name', () => {
    const [line] = rows(setup([row({ tenantName: null })]));
    expect(line).toContain('9000000001');
  });
});
