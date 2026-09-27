import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { PropertyOwnersComponent } from './property-owners.component';
import { SessionStore } from '../../core/auth/session.store';
import { Capability } from '../../core/models/capability.model';
import { environment } from '../../../environments/environment';

const url = (p: string) => environment.apiBase + p;
const OWNERS = url('/admin/owners');
const PROPS = url('/admin/properties');
const SUPER: Capability[] = ['OWNER_ADMINISTRATION', 'PROPERTY_ADMINISTRATION_VIEW', 'USER_OPERATIONS'];

const owner = (over: Record<string, unknown> = {}) => ({
  id: 'o-1', phone: '9811000001', email: 'owner@nestpg.test', status: 'ACTIVE',
  phoneVerifiedAt: '2026-09-01T00:00:00.000Z', lastLoginAt: null, createdAt: '2026-09-01T00:00:00.000Z',
  onboarding: { phoneVerified: true, hasPassword: true, loginable: true },
  properties: { total: 2, draft: 1, pendingReview: 0, active: 1 },
  ...over,
});

const propertyRow = (over: Record<string, unknown> = {}) => ({
  id: 'p-1', name: 'Maple Nivas', propertyType: 'COLIVING', status: 'DRAFT', city: 'Pune',
  areaLocality: 'Baner', addressLine1: '1 Rd', state: 'MH', pincode: '411045',
  createdAt: '2026-09-02T00:00:00.000Z', updatedAt: '2026-09-02T00:00:00.000Z',
  verifiedAt: null, rejectionReason: null,
  owner: { id: 'o-1', phone: '9811000001', status: 'ACTIVE' },
  stats: { totalBeds: 4, occupiedBeds: 0, reservedBeds: 0, availableBeds: 4, maintenanceBeds: 0, occupancyRate: 0 },
  minPricePaisa: 800000, maxPricePaisa: 900000, coverImageUrl: null, photoCount: 1,
  readiness: { hasBeds: true, hasPhotos: true, ready: true }, ...over,
});

/** A4 — Property Owner administration UI. */
describe('PropertyOwnersComponent', () => {
  let http: HttpTestingController;
  let session: SessionStore;

  const setup = (capabilities: Capability[] = SUPER) => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionStore);
    session.setUser({ id: 'me-1', name: 'Super', email: 's@nestpg.test', role: 'SUPER_ADMIN',
      backendRole: 'SUPER_ADMIN', initials: 'S', organization: 'NestPG', capabilities });
    const f = TestBed.createComponent(PropertyOwnersComponent);
    f.detectChanges();
    return f;
  };
  const el = (f: { nativeElement: HTMLElement }, id: string) =>
    (f.nativeElement as HTMLElement).querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const text = (f: { nativeElement: HTMLElement }) => (f.nativeElement as HTMLElement).textContent ?? '';
  const flushList = (f: ReturnType<typeof setup>, rows = [owner()]) => {
    http.expectOne((r) => r.url === OWNERS).flush({ data: rows, meta: { page: 1, limit: 20, total: rows.length } });
    f.detectChanges();
  };

  afterEach(() => { http.verify(); localStorage.clear(); });

  it('lists owners with their onboarding state and portfolio counts', () => {
    const f = setup();
    const req = http.expectOne((r) => r.url === OWNERS);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [owner()], meta: { page: 1, limit: 20, total: 1 } });
    f.detectChanges();
    expect(text(f)).toContain('9811000001');
    expect(el(f, 'onboarding-o-1')?.textContent).toContain('Phone verified');
    expect(text(f)).toContain('2 properties');
    expect(text(f)).toContain('1 active');
  });

  it('marks an owner who has not verified their code yet', () => {
    const f = setup();
    flushList(f, [owner({ onboarding: { phoneVerified: false, hasPassword: false, loginable: false }, status: 'PENDING' })]);
    expect(el(f, 'onboarding-o-1')?.textContent).toContain('Awaiting code');
    expect(text(f)).toContain('signs in by code');
  });

  it('shows loading, then a distinct error state with retry', () => {
    const f = setup();
    expect(el(f, 'owners-loading')).toBeTruthy();
    http.expectOne((r) => r.url === OWNERS).flush('boom', { status: 500, statusText: 'Server Error' });
    f.detectChanges();
    expect(el(f, 'owners-error')).toBeTruthy();
    expect(el(f, 'owners-empty')).toBeNull();
    el(f, 'owners-error')!.querySelector('button')!.click();
    f.detectChanges();
    http.expectOne((r) => r.url === OWNERS).flush({ data: [], meta: { page: 1, limit: 20, total: 0 } });
    f.detectChanges();
    expect(el(f, 'owners-empty')).toBeTruthy();
  });

  const openForm = async (f: ReturnType<typeof setup>) => {
    el(f, 'new-owner')!.click();
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
  };
  const type = (f: ReturnType<typeof setup>, id: string, v: string) => {
    const input = el(f, id) as HTMLInputElement;
    input.value = v; input.dispatchEvent(new Event('input', { bubbles: true }));
    f.detectChanges();
  };

  it('collects NO password and explains the owner-led onboarding', async () => {
    const f = setup();
    flushList(f);
    await openForm(f);
    const inputs = [...(f.nativeElement as HTMLElement).querySelectorAll('input')];
    expect(inputs.some((i) => i.type === 'password')).toBe(false);
    expect(el(f, 'onboarding-note')?.textContent).toContain('one-time code');
    expect(el(f, 'onboarding-note')?.textContent).toContain('do not set, see, or hold their password');
  });

  it('creates an owner with phone + email only', async () => {
    const f = setup();
    flushList(f, []);
    await openForm(f);
    type(f, 'owner-phone', '9812345678');
    type(f, 'owner-email', 'new@nestpg.test');
    await f.whenStable();
    (el(f, 'create-form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    f.detectChanges();

    const req = http.expectOne((r) => r.url === OWNERS && r.method === 'POST');
    expect(req.request.body).toEqual({ phone: '9812345678', email: 'new@nestpg.test' });
    expect(JSON.stringify(req.request.body)).not.toMatch(/password|role/i);
    req.flush({ data: { message: 'OTP sent to 9812345678', owner: owner({ id: 'o-2', phone: '9812345678' }) } });
    f.detectChanges();
    flushList(f, [owner({ id: 'o-2', phone: '9812345678' })]);
    expect(el(f, 'toast')?.textContent).toContain('OTP sent to 9812345678');
  });

  it('refuses an invalid phone before calling the API', async () => {
    const f = setup();
    flushList(f, []);
    await openForm(f);
    type(f, 'owner-phone', '12345');
    await f.whenStable();
    expect((el(f, 'create-submit') as HTMLButtonElement).disabled).toBe(true);
  });

  it("surfaces the server's refusal instead of claiming success", async () => {
    const f = setup();
    flushList(f, []);
    await openForm(f);
    type(f, 'owner-phone', '9812345678');
    await f.whenStable();
    (el(f, 'create-form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    f.detectChanges();
    http.expectOne((r) => r.method === 'POST')
      .flush({ errors: [{ code: 'Conflict', message: 'PHONE_ALREADY_REGISTERED' }] }, { status: 409, statusText: 'Conflict' });
    f.detectChanges();
    expect(el(f, 'create-error')?.textContent).toContain('already exists');
  });

  it("opens an owner's portfolio through the existing admin property contract", () => {
    const f = setup();
    flushList(f);
    el(f, 'portfolio-o-1')!.click();
    f.detectChanges();
    const req = http.expectOne((r) => r.url === PROPS);
    expect(req.request.params.get('ownerId')).toBe('o-1');
    expect(req.request.params.get('status')).toBeNull();     // every status, not the review default
    req.flush({ data: [propertyRow(), propertyRow({ id: 'p-2', status: 'ACTIVE' })], meta: { page: 1, limit: 100, total: 2 } });
    f.detectChanges();
    expect(el(f, 'portfolio-list')).toBeTruthy();
    expect(text(f)).toContain('Maple Nivas');
    expect(text(f)).toContain('DRAFT');
    expect(el(f, 'create-for-owner')?.getAttribute('href')).toContain('ownerId=o-1');
  });

  it('shows a portfolio error rather than an empty portfolio', () => {
    const f = setup();
    flushList(f);
    el(f, 'portfolio-o-1')!.click();
    f.detectChanges();
    http.expectOne((r) => r.url === PROPS).flush('no', { status: 500, statusText: 'Server Error' });
    f.detectChanges();
    expect(el(f, 'portfolio-error')).toBeTruthy();
    expect(el(f, 'portfolio-empty')).toBeNull();
  });

  it('suspends and reactivates an owner through the status endpoint', () => {
    const f = setup();
    flushList(f);
    el(f, 'suspend-o-1')!.click();
    f.detectChanges();
    const req = http.expectOne(url('/admin/owners/o-1/status'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ status: 'SUSPENDED' });
    req.flush({ data: owner({ status: 'SUSPENDED' }) });
    f.detectChanges();
    flushList(f, [owner({ status: 'SUSPENDED' })]);
    expect(text(f)).toContain('sessions were revoked');
    expect(el(f, 'activate-o-1')).toBeTruthy();
  });

  it('offers no role control — promoting an account is the Staff workflow', () => {
    const f = setup();
    flushList(f);
    expect((f.nativeElement as HTMLElement).querySelectorAll('select').length).toBe(0);
    expect(text(f)).not.toContain('SUPER_ADMIN');
    expect(text(f)).not.toContain('OPS_ADMIN');
  });
});
