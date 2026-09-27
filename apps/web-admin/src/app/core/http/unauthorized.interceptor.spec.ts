import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { unauthorizedInterceptor } from './unauthorized.interceptor';
import { TokenStore } from '../api/token.store';
import { SessionStore } from '../auth/session.store';
import { environment } from '../../../environments/environment';

const url = (p: string) => environment.apiBase + p;
const UNAUTHORIZED = { status: 401, statusText: 'Unauthorized' };

/**
 * A1 — a 401 on a data request means "the 15-minute access token aged out",
 * which happens several times an hour. The interceptor must rotate and RETRY
 * rather than dump the admin at the login screen; only a failed rotation ends
 * the session.
 */
describe('unauthorizedInterceptor', () => {
  let http: HttpClient;
  let mock: HttpTestingController;
  let tokens: TokenStore;
  let session: SessionStore;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor, unauthorizedInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpClient);
    mock = TestBed.inject(HttpTestingController);
    tokens = TestBed.inject(TokenStore);
    session = TestBed.inject(SessionStore);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    tokens.set('at-expired', null);
    session.setUser({ id: 'u-1', name: 'Ops', email: 'o', role: 'SUPER_ADMIN', backendRole: 'SUPER_ADMIN', initials: 'O', organization: 'N', capabilities: [] });
  });
  afterEach(() => { mock.verify(); localStorage.clear(); });

  it('refreshes and replays the original request with the NEW token', () => {
    let body: unknown;
    http.get(url('/properties')).subscribe((r) => { body = r; });

    mock.expectOne(url('/properties')).flush('exp', UNAUTHORIZED);
    mock.expectOne(url('/admin/auth/refresh')).flush({ data: { accessToken: 'at-fresh' } });

    const retry = mock.expectOne(url('/properties'));
    expect(retry.request.headers.get('Authorization')).toBe('Bearer at-fresh');
    retry.flush({ data: [{ id: 'p-1' }] });

    expect(body).toEqual({ data: [{ id: 'p-1' }] });
    expect(session.isAuthenticated()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ends the session and returns to login when the rotation fails', () => {
    let status = 0;
    http.get(url('/properties')).subscribe({ error: (e) => { status = e.status; } });

    mock.expectOne(url('/properties')).flush('exp', UNAUTHORIZED);
    mock.expectOne(url('/admin/auth/refresh')).flush('no', UNAUTHORIZED);

    expect(status).toBe(401);
    expect(tokens.accessToken()).toBeNull();
    expect(session.user()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/auth/login'], expect.objectContaining({ queryParams: expect.anything() }));
  });

  it('several simultaneous 401s share ONE rotation and all succeed', () => {
    const got: string[] = [];
    http.get<{ data: { id: string } }>(url('/properties')).subscribe((r) => got.push(r.data.id));
    http.get<{ data: { id: string } }>(url('/bookings')).subscribe((r) => got.push(r.data.id));
    http.get<{ data: { id: string } }>(url('/invoices')).subscribe((r) => got.push(r.data.id));

    for (const p of ['/properties', '/bookings', '/invoices']) mock.expectOne(url(p)).flush('exp', UNAUTHORIZED);
    // One rotation only: a second would present an already-spent refresh token.
    mock.expectOne(url('/admin/auth/refresh')).flush({ data: { accessToken: 'at-fresh' } });

    for (const p of ['/properties', '/bookings', '/invoices']) {
      const retry = mock.expectOne(url(p));
      expect(retry.request.headers.get('Authorization')).toBe('Bearer at-fresh');
      retry.flush({ data: { id: p } });
    }
    expect(got.sort()).toEqual(['/bookings', '/invoices', '/properties']);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not retry a 401 from login — bad credentials are the answer', () => {
    let status = 0;
    http.post(url('/admin/auth/login'), {}).subscribe({ error: (e) => { status = e.status; } });
    mock.expectOne(url('/admin/auth/login')).flush('bad', UNAUTHORIZED);
    expect(status).toBe(401);
    mock.expectNone(url('/admin/auth/refresh'));
  });

  it('does not recurse on a 401 from refresh itself', () => {
    http.post(url('/admin/auth/refresh'), {}).subscribe({ error: () => {} });
    mock.expectOne(url('/admin/auth/refresh')).flush('no', UNAUTHORIZED);
    mock.expectNone(url('/admin/auth/refresh'));
  });

  it('leaves other failures alone — a 403 is an authorization verdict, not an expiry', () => {
    let status = 0;
    http.get(url('/system/config')).subscribe({ error: (e) => { status = e.status; } });
    mock.expectOne(url('/system/config')).flush('nope', { status: 403, statusText: 'Forbidden' });
    expect(status).toBe(403);
    mock.expectNone(url('/admin/auth/refresh'));
    expect(session.isAuthenticated()).toBe(true);
  });

  it('ignores a 401 from a non-API origin', () => {
    http.get('https://example.test/thing').subscribe({ error: () => {} });
    mock.expectOne('https://example.test/thing').flush('no', UNAUTHORIZED);
    mock.expectNone(url('/admin/auth/refresh'));
  });
});
