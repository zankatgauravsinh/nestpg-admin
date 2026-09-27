import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { authGuard } from './auth.guard';
import { reviewGuard } from './review.guard';
import { SessionStore } from './session.store';
import { TokenStore } from '../api/token.store';

const run = (fn: typeof authGuard, route: object, state: object) =>
  TestBed.runInInjectionContext(() =>
    fn(route as ActivatedRouteSnapshot, state as RouterStateSnapshot),
  );

/** A1 — both guards must read the real session, not a fabricated persona. */
describe('route guards', () => {
  let tokens: TokenStore;
  let session: SessionStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    tokens = TestBed.inject(TokenStore);
    session = TestBed.inject(SessionStore);
    tokens.clear();
  });
  afterEach(() => localStorage.clear());

  it('authGuard sends an anonymous visitor to login, keeping the intended URL', () => {
    const res = run(authGuard, {}, { url: '/finance/invoices' });
    expect(res).toBeInstanceOf(UrlTree);
    expect(String(res)).toContain('/auth/login');
    expect(String(res)).toContain('returnUrl');
  });

  it('authGuard admits a session that holds an access token', () => {
    tokens.set('at-1', null);
    expect(run(authGuard, {}, { url: '/dashboard' })).toBe(true);
  });

  it('reviewGuard refuses an unauthenticated visitor', () => {
    expect(run(reviewGuard, {}, { url: '/properties/review' })).toBeInstanceOf(UrlTree);
  });

  it.each(['SUPER_ADMIN', 'OPS_ADMIN'])('reviewGuard admits a %s', (backendRole) => {
    session.setUser({ id: 'u-1', name: 'A', email: 'a', role: 'SUPER_ADMIN', backendRole, initials: 'A', organization: 'N', capabilities: ['PROPERTY_REVIEW_VIEW'] });
    expect(run(reviewGuard, {}, { url: '/properties/review' })).toBe(true);
  });

  it('reviewGuard ADMITS a FINANCE_ADMIN — A3 gives it view, not decision', () => {
    session.setUser({ id: 'u-1', name: 'F', email: 'f', role: 'SUPER_ADMIN', backendRole: 'FINANCE_ADMIN', initials: 'F', organization: 'N', capabilities: ['PROPERTY_REVIEW_VIEW', 'FINANCIAL_OPERATIONS'] });
    expect(run(reviewGuard, {}, { url: '/properties/review' })).toBe(true);
    // …and the decision capability it does not hold is what hides the controls.
    expect(session.hasCapability('PROPERTY_REVIEW_DECISION')).toBe(false);
  });

  it('reviewGuard refuses a session that holds no review capability', () => {
    session.setUser({ id: 'u-1', name: 'X', email: 'x', role: 'SUPER_ADMIN', backendRole: 'UNKNOWN_ROLE', initials: 'X', organization: 'N', capabilities: [] });
    expect(run(reviewGuard, {}, { url: '/properties/review' })).toBeInstanceOf(UrlTree);
  });

  it('reviewGuard refuses a PG_OWNER session', () => {
    session.setUser({ id: 'u-1', name: 'O', email: 'o', role: 'OWNER', backendRole: 'PG_OWNER', initials: 'O', organization: 'N', capabilities: [] });
    expect(run(reviewGuard, {}, { url: '/properties/review' })).toBeInstanceOf(UrlTree);
  });
});
