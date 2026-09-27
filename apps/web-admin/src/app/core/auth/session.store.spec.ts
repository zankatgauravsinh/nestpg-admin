import { TestBed } from '@angular/core/testing';
import { SessionStore } from './session.store';
import { CurrentUser } from '../models/role.model';

const ADMIN: CurrentUser = {
  id: 'u-1', name: 'Ops Admin', email: 'ops@nestpg.test',
  role: 'SUPER_ADMIN', backendRole: 'OPS_ADMIN', initials: 'OA', organization: 'NestPG',
  capabilities: ['PROPERTY_REVIEW_VIEW', 'PROPERTY_REVIEW_DECISION', 'OPERATIONAL_READ'],
};

/**
 * A1 — the session is the real authenticated admin or nothing. These pin the
 * behaviour that replaced the mock persona: the store used to start as a
 * fabricated SUPER_ADMIN and `clear()` left a MANAGER behind, so the UI gated
 * on an identity nobody had signed in as.
 */
describe('SessionStore', () => {
  let store: SessionStore;
  beforeEach(() => { store = TestBed.configureTestingModule({}).inject(SessionStore); });

  it('starts with NO user — there is no default persona', () => {
    expect(store.user()).toBeNull();
    expect(store.role()).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
  });

  it('holds no capability before sign-in (A3 — authorization is capability-based)', () => {
    expect(store.capabilities()).toEqual([]);
    expect(store.hasCapability('PROPERTY_REVIEW_VIEW')).toBe(false);
    expect(store.hasAll(['OPERATIONAL_READ'])).toBe(false);
    expect(store.hasAll([])).toBe(true);   // an unrestricted route has nothing to check
  });

  it('adopts the backend user and gates on its real role', () => {
    store.setUser(ADMIN);
    expect(store.isAuthenticated()).toBe(true);
    expect(store.role()).toBe('SUPER_ADMIN');
    expect(store.hasCapability('PROPERTY_REVIEW_DECISION')).toBe(true);
    expect(store.hasCapability('ROLE_ADMINISTRATION')).toBe(false);
  });

  it('answers from the served capabilities, whatever the nav persona is', () => {
    store.setUser({ ...ADMIN, role: 'MANAGER', capabilities: ['OPERATIONAL_READ'] });
    expect(store.hasCapability('OPERATIONAL_READ')).toBe(true);
    expect(store.hasCapability('PROPERTY_REVIEW_DECISION')).toBe(false);
  });

  it('clear() leaves no identity behind — logged out means logged out', () => {
    store.setUser(ADMIN);
    store.clear();
    expect(store.user()).toBeNull();
    expect(store.role()).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
    expect(store.hasCapability('PROPERTY_REVIEW_DECISION')).toBe(false);
  });
});
