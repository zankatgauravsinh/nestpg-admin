import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { SessionStore } from './session.store';
import { TokenStore } from '../api/token.store';
import { environment } from '../../../environments/environment';

const url = (p: string) => environment.apiBase + p;

/**
 * A1 — the Admin app authenticates on its OWN channel. The rules pinned here:
 * every admin auth call goes to /admin/auth/* (never /owner/auth/*), the three
 * cookie-bearing calls are credentialed and nothing else is, and rotation is
 * single-flight because refresh tokens are single-use server-side.
 */
describe('AuthService (admin channel)', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let session: SessionStore;
  let tokens: TokenStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionStore);
    tokens = TestBed.inject(TokenStore);
  });
  afterEach(() => { http.verify(); localStorage.clear(); });

  it('logs in on the admin endpoint, credentialed, and adopts the returned session', () => {
    auth.login({ phone: '9876543210', password: 'secret12' }).subscribe();
    const req = http.expectOne(url('/admin/auth/login'));
    expect(req.request.withCredentials).toBe(true);
    req.flush({ data: { accessToken: 'at-1', user: { id: 'u-1', fullName: 'Ops Admin', role: 'OPS_ADMIN' } } });

    expect(tokens.accessToken()).toBe('at-1');
    expect(session.isAuthenticated()).toBe(true);
    expect(session.role()).toBe('SUPER_ADMIN');   // nav persona; authorization no longer uses it

    // A3: login is followed by /users/me, because the capability list is the
    // server's to state — the login response does not carry one.
    http.expectOne(url('/users/me')).flush({ data: {
      id: 'u-1', fullName: 'Ops Admin', role: 'OPS_ADMIN',
      capabilities: ['PROPERTY_REVIEW_VIEW', 'PROPERTY_REVIEW_DECISION'],
    } });
    expect(session.hasCapability('PROPERTY_REVIEW_DECISION')).toBe(true);
    expect(session.hasCapability('ROLE_ADMINISTRATION')).toBe(false);
  });

  it('a session whose hydration fails holds NO capabilities — it fails closed', () => {
    auth.login({ phone: '9876543210', password: 'secret12' }).subscribe();
    http.expectOne(url('/admin/auth/login'))
      .flush({ data: { accessToken: 'at-1', user: { id: 'u-1', role: 'SUPER_ADMIN' } } });
    http.expectOne(url('/users/me')).flush('nope', { status: 500, statusText: 'Server Error' });

    expect(tokens.accessToken()).toBe('at-1');          // the login itself succeeded
    expect(session.capabilities()).toEqual([]);         // but nothing is authorized
    expect(session.hasCapability('PROPERTY_REVIEW_VIEW')).toBe(false);
  });

  it('refreshes on the admin endpoint — never the owner one', () => {
    auth.refresh().subscribe();
    const req = http.expectOne(url('/admin/auth/refresh'));
    expect(req.request.withCredentials).toBe(true);
    req.flush({ data: { accessToken: 'at-2' } });
    expect(tokens.accessToken()).toBe('at-2');
    http.expectNone(url('/owner/auth/refresh'));
  });

  it('logs out on the admin endpoint and drops local state immediately', () => {
    tokens.set('at-1', null);
    session.setUser({ id: 'u-1', name: 'A', email: 'a', role: 'SUPER_ADMIN', backendRole: 'SUPER_ADMIN', initials: 'A', organization: 'N', capabilities: [] });
    auth.logout();
    const req = http.expectOne(url('/admin/auth/logout'));
    expect(req.request.withCredentials).toBe(true);
    req.flush({ data: {} });
    expect(tokens.accessToken()).toBeNull();
    expect(session.user()).toBeNull();
    http.expectNone(url('/owner/auth/logout'));
  });

  it('still clears local state when the logout call fails', () => {
    tokens.set('at-1', null);
    auth.logout();
    http.expectOne(url('/admin/auth/logout')).flush('nope', { status: 500, statusText: 'Server Error' });
    expect(tokens.accessToken()).toBeNull();
  });

  it('refreshOnce() rotates ONCE for concurrent callers — a single-use token cannot be spent twice', () => {
    const seen: string[] = [];
    auth.refreshOnce().subscribe((r) => seen.push(String(r.accessToken)));
    auth.refreshOnce().subscribe((r) => seen.push(String(r.accessToken)));
    auth.refreshOnce().subscribe((r) => seen.push(String(r.accessToken)));

    const req = http.expectOne(url('/admin/auth/refresh')); // exactly one
    req.flush({ data: { accessToken: 'at-shared' } });
    expect(seen).toEqual(['at-shared', 'at-shared', 'at-shared']);
  });

  it('the NEXT expiry starts a fresh rotation, not a replay of the last one', () => {
    auth.refreshOnce().subscribe();
    http.expectOne(url('/admin/auth/refresh')).flush({ data: { accessToken: 'at-1' } });
    auth.refreshOnce().subscribe();
    http.expectOne(url('/admin/auth/refresh')).flush({ data: { accessToken: 'at-2' } });
    expect(tokens.accessToken()).toBe('at-2');
  });

  it('a failed rotation is shared too, and is not cached as a success', () => {
    const errors: number[] = [];
    auth.refreshOnce().subscribe({ error: (e) => errors.push(e.status) });
    auth.refreshOnce().subscribe({ error: (e) => errors.push(e.status) });
    http.expectOne(url('/admin/auth/refresh')).flush('no', { status: 401, statusText: 'Unauthorized' });
    expect(errors).toEqual([401, 401]);

    auth.refreshOnce().subscribe({ error: () => {} });
    http.expectOne(url('/admin/auth/refresh')).flush('no', { status: 401, statusText: 'Unauthorized' });
  });

  it('bootstrap() with no access token makes no request at all', async () => {
    await auth.bootstrap();
    http.expectNone(() => true);
  });

  it('bootstrap() hydrates the real backend user for a held token', async () => {
    tokens.set('at-1', null);
    const done = auth.bootstrap();
    http.expectOne(url('/users/me')).flush({ data: { id: 'u-9', fullName: 'Fin Admin', role: 'FINANCE_ADMIN' } });
    await done;
    expect(session.user()?.name).toBe('Fin Admin');
  });

  it('bootstrap() recovers a stale token via refresh, then re-hydrates', async () => {
    tokens.set('at-old', null);
    const done = auth.bootstrap();
    http.expectOne(url('/users/me')).flush('exp', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(url('/admin/auth/refresh')).flush({ data: { accessToken: 'at-new' } });
    http.expectOne(url('/users/me')).flush({ data: { id: 'u-9', fullName: 'Ops', role: 'OPS_ADMIN' } });
    await done;
    expect(tokens.accessToken()).toBe('at-new');
    expect(session.isAuthenticated()).toBe(true);
  });

  it('bootstrap() gives up cleanly when the refresh cookie is gone', async () => {
    tokens.set('at-old', null);
    const done = auth.bootstrap();
    http.expectOne(url('/users/me')).flush('exp', { status: 401, statusText: 'Unauthorized' });
    http.expectOne(url('/admin/auth/refresh')).flush('no', { status: 401, statusText: 'Unauthorized' });
    await done;
    expect(tokens.accessToken()).toBeNull();
    expect(session.isAuthenticated()).toBe(false);
  });
});
