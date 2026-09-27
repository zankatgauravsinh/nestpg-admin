import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { PropertyReviewComponent } from './property-review.component';
import { SessionStore } from '../../core/auth/session.store';
import { CurrentUser } from '../../core/models/role.model';
import { Capability } from '../../core/models/capability.model';
import { environment } from '../../../environments/environment';

const url = (p: string) => environment.apiBase + p;
const QUEUE = url('/admin/properties');

const DECIDER: Capability[] = ['PROPERTY_REVIEW_VIEW', 'PROPERTY_REVIEW_DECISION'];
const VIEWER: Capability[] = ['PROPERTY_REVIEW_VIEW'];   // FINANCE_ADMIN

const user = (capabilities: Capability[], backendRole = 'OPS_ADMIN'): CurrentUser => ({
  id: 'u-1', name: 'Ops', email: 'o@nestpg.test', role: 'SUPER_ADMIN',
  backendRole, initials: 'O', organization: 'NestPG', capabilities,
});

const row = (over: Record<string, unknown> = {}) => ({
  id: 'p-1', name: 'Maple Nivas', propertyType: 'COLIVING', status: 'PENDING_REVIEW',
  city: 'Ahmedabad', areaLocality: 'Bodakdev', addressLine1: '12 Main Rd', state: 'GJ', pincode: '380054',
  createdAt: '2026-09-21T10:00:00.000Z', updatedAt: '2026-09-21T10:00:00.000Z',
  verifiedAt: null, rejectionReason: null,
  owner: { id: 'o-1', phone: '9811000003', status: 'ACTIVE' },
  stats: { totalBeds: 17, occupiedBeds: 0, reservedBeds: 0, availableBeds: 17, maintenanceBeds: 0, occupancyRate: 0 },
  minPricePaisa: 900000, maxPricePaisa: 1200000,
  coverImageUrl: 'https://cdn/x.jpg', photoCount: 2,
  readiness: { hasBeds: true, hasPhotos: true, ready: true },
  ...over,
});

/** A2 — the review queue screen. */
describe('PropertyReviewComponent', () => {
  let http: HttpTestingController;
  let session: SessionStore;

  const setup = (capabilities: Capability[] = DECIDER) => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionStore);
    session.setUser(user(capabilities));
    const fixture = TestBed.createComponent(PropertyReviewComponent);
    fixture.detectChanges();          // constructor already issued the request
    return fixture;
  };
  const text = (f: { nativeElement: HTMLElement }) => (f.nativeElement as HTMLElement).textContent ?? '';
  const el = (f: { nativeElement: HTMLElement }, testid: string) =>
    (f.nativeElement as HTMLElement).querySelector<HTMLElement>(`[data-testid="${testid}"]`);

  afterEach(() => { http.verify(); localStorage.clear(); });

  it('asks the ADMIN queue for PENDING_REVIEW, oldest first — not the public list', () => {
    setup();
    const req = http.expectOne((r) => r.url === QUEUE);
    expect(req.request.params.get('status')).toBe('PENDING_REVIEW');
    expect(req.request.params.get('sort')).toBe('oldest');
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ data: [], meta: { page: 1, limit: 20, total: 0 } });
    http.expectNone(url('/properties'));
    http.expectNone(url('/properties/my'));
  });

  it('shows a loading state until the queue answers', () => {
    const f = setup();
    expect(el(f, 'review-loading')).toBeTruthy();
    http.expectOne((r) => r.url === QUEUE).flush({ data: [], meta: { page: 1, limit: 20, total: 0 } });
    f.detectChanges();
    expect(el(f, 'review-loading')).toBeNull();
  });

  it('renders the pending properties with their readiness', () => {
    const f = setup();
    http.expectOne((r) => r.url === QUEUE).flush({ data: [row()], meta: { page: 1, limit: 20, total: 1 } });
    f.detectChanges();
    expect(text(f)).toContain('Maple Nivas');
    expect(text(f)).toContain('9811000003');
    expect(el(f, 'readiness-p-1')?.textContent).toContain('Ready');
    expect(el(f, 'review-empty')).toBeNull();
  });

  it('says a listing without photos is not ready', () => {
    const f = setup();
    http.expectOne((r) => r.url === QUEUE).flush({
      data: [row({ photoCount: 0, readiness: { hasBeds: true, hasPhotos: false, ready: false } })],
      meta: { page: 1, limit: 20, total: 1 },
    });
    f.detectChanges();
    expect(el(f, 'readiness-p-1')?.textContent).toContain('No photos');
  });

  it('renders an EMPTY state when nothing is awaiting review', () => {
    const f = setup();
    http.expectOne((r) => r.url === QUEUE).flush({ data: [], meta: { page: 1, limit: 20, total: 0 } });
    f.detectChanges();
    expect(el(f, 'review-empty')?.textContent).toContain('No properties awaiting review');
    expect(el(f, 'review-error')).toBeNull();
  });

  it('a failed request is an ERROR state, never "nothing to review"', () => {
    const f = setup();
    http.expectOne((r) => r.url === QUEUE).flush('boom', { status: 500, statusText: 'Server Error' });
    f.detectChanges();
    expect(el(f, 'review-error')).toBeTruthy();
    expect(el(f, 'review-empty')).toBeNull();
    expect(el(f, 'review-list')).toBeNull();
  });

  it('retries the queue from the error state', () => {
    const f = setup();
    http.expectOne((r) => r.url === QUEUE).flush('boom', { status: 500, statusText: 'Server Error' });
    f.detectChanges();
    el(f, 'review-error')!.querySelector('button')!.click();
    f.detectChanges();
    http.expectOne((r) => r.url === QUEUE).flush({ data: [row()], meta: { page: 1, limit: 20, total: 1 } });
    f.detectChanges();
    expect(el(f, 'review-error')).toBeNull();
    expect(text(f)).toContain('Maple Nivas');
  });

  it('pages with the existing page/limit convention', () => {
    const f = setup();
    http.expectOne((r) => r.url === QUEUE).flush({ data: [row()], meta: { page: 1, limit: 20, total: 45 } });
    f.detectChanges();
    el(f, 'next-page')!.click();
    f.detectChanges();
    const req = http.expectOne((r) => r.url === QUEUE);
    expect(req.request.params.get('page')).toBe('2');
    req.flush({ data: [row({ id: 'p-2' })], meta: { page: 2, limit: 20, total: 45 } });
  });

  const openDetail = (f: ReturnType<typeof setup>) => {
    http.expectOne((r) => r.url === QUEUE).flush({ data: [row()], meta: { page: 1, limit: 20, total: 1 } });
    f.detectChanges();
    (f.nativeElement as HTMLElement).querySelectorAll('button').forEach((b) => {
      if (b.textContent?.trim() === 'Review') b.click();
    });
    f.detectChanges();
    http.expectOne(url('/properties/p-1')).flush({ data: { id: 'p-1', name: 'Maple Nivas', propertyType: 'COLIVING',
      addressLine1: '12 Main Rd', areaLocality: 'Bodakdev', city: 'Ahmedabad', state: 'GJ', pincode: '380054',
      description: 'A quiet co-living house', securityDepositPaisa: 1000000, noticePeriodDays: 30,
      foodIncluded: true, foodDescription: 'Two meals', houseRules: ['No smoking'],
      amenities: [{ id: 'a1', key: 'wifi', label: 'Wi-Fi' }],
      media: { coverImageUrl: 'https://cdn/x.jpg', coverImageKey: 'k', gallery: [] } } });
    http.expectOne(url('/properties/p-1/buildings')).flush({ data: [{ id: 'b1', name: 'Block A' }] });
    http.match(() => true).forEach((r) => r.flush({ data: [] }));  // nested floors/rooms
    f.detectChanges();
    return f;
  };

  it('opens the review detail from the existing property endpoint', () => {
    const f = openDetail(setup());
    expect(el(f, 'detail-p-1')).toBeTruthy();
    expect(text(f)).toContain('A quiet co-living house');
    expect(text(f)).toContain('Wi-Fi');
    expect(el(f, 'req-beds-p-1')?.textContent).toContain('17 present');
    expect(el(f, 'req-photos-p-1')?.textContent).toContain('2 uploaded');
  });

  it('approves through the real endpoint after a confirmation, then refreshes the queue', () => {
    const f = openDetail(setup());
    el(f, 'approve')!.click(); f.detectChanges();
    el(f, 'approve-confirm')!.click(); f.detectChanges();

    const req = http.expectOne(url('/properties/p-1/verify'));
    expect(req.request.method).toBe('PUT');
    req.flush({ data: { id: 'p-1', status: 'ACTIVE' } });
    f.detectChanges();

    // The decided property leaves the queue on the refresh that follows.
    http.expectOne((r) => r.url === QUEUE).flush({ data: [], meta: { page: 1, limit: 20, total: 0 } });
    f.detectChanges();
    expect(text(f)).toContain('approved and published');
    expect(el(f, 'review-empty')).toBeTruthy();
  });

  it("surfaces the server's refusal instead of claiming success", () => {
    const f = openDetail(setup());
    el(f, 'approve')!.click(); f.detectChanges();
    el(f, 'approve-confirm')!.click(); f.detectChanges();
    http.expectOne(url('/properties/p-1/verify'))
      .flush({ errors: [{ code: 'BAD_REQUEST', message: 'PROPERTY_HAS_NO_PHOTOS' }] },
             { status: 400, statusText: 'Bad Request' });
    f.detectChanges();
    expect(el(f, 'action-error')?.textContent).toContain('Property has no photos');
    expect(el(f, 'detail-p-1')).toBeTruthy();   // still open, nothing pretended to happen
  });

  it('requires a reason before a rejection can be confirmed', () => {
    const f = openDetail(setup());
    el(f, 'reject')!.click(); f.detectChanges();
    expect((el(f, 'reject-confirm') as HTMLButtonElement).disabled).toBe(true);
  });

  it('rejects with the typed reason', () => {
    const f = openDetail(setup());
    el(f, 'reject')!.click(); f.detectChanges();
    const input = el(f, 'reject-reason') as HTMLInputElement;
    expect(input.getAttribute('maxlength')).toBe('500');
    input.value = 'Address could not be verified';
    input.dispatchEvent(new Event('input'));
    f.detectChanges();
    (el(f, 'reject-confirm') as HTMLButtonElement).click();
    f.detectChanges();

    const req = http.expectOne(url('/properties/p-1/reject'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ reason: 'Address could not be verified' });
    req.flush({ data: { message: 'Property rejected' } });
    f.detectChanges();
    http.expectOne((r) => r.url === QUEUE).flush({ data: [], meta: { page: 1, limit: 20, total: 0 } });
  });

  it('a viewer without the decision capability (FINANCE_ADMIN) sees the queue but NO decision controls', () => {
    // A3: FINANCE_ADMIN holds PROPERTY_REVIEW_VIEW and not
    // PROPERTY_REVIEW_DECISION. The backend refuses the decision anyway (403);
    // this stops the UI offering it.
    const f = openDetail(setup(VIEWER));
    expect(el(f, 'detail-p-1')).toBeTruthy();
    expect(el(f, 'decisions-p-1')).toBeNull();
    expect(el(f, 'approve')).toBeNull();
    expect(el(f, 'reject')).toBeNull();
  });
});
