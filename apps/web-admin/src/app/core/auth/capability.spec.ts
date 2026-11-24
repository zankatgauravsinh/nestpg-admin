import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { SessionStore } from './session.store';
import { capabilityGuard } from './capability.guard';
import { Capability } from '../models/capability.model';
import { CurrentUser } from '../models/role.model';
import { NAV_CONFIG } from '../navigation/nav.config';

const SUPER: Capability[] = ['PROPERTY_OPERATIONS', 'PROPERTY_REVIEW_VIEW', 'PROPERTY_REVIEW_DECISION',
  'PROPERTY_ADMINISTRATION_VIEW', 'OWNER_ADMINISTRATION',
  'USER_OPERATIONS', 'KYC_OPERATIONS', 'BOOKING_OPERATIONS', 'FINANCIAL_OPERATIONS',
  'ROLE_ADMINISTRATION', 'SYSTEM_ADMINISTRATION', 'OPERATIONAL_READ', 'COMMUNITY_OPERATIONS'];
// A4: OPS keeps everything except role administration AND owner administration.
const OPS: Capability[] = SUPER.filter((c) => c !== 'ROLE_ADMINISTRATION' && c !== 'OWNER_ADMINISTRATION');
const FINANCE: Capability[] = ['PROPERTY_REVIEW_VIEW', 'PROPERTY_ADMINISTRATION_VIEW',
  'FINANCIAL_OPERATIONS', 'OPERATIONAL_READ'];

const user = (capabilities: Capability[], backendRole = 'SUPER_ADMIN'): CurrentUser => ({
  id: 'u-1', name: 'A', email: 'a@nestpg.test', role: 'SUPER_ADMIN',
  backendRole, initials: 'A', organization: 'NestPG', capabilities,
});

/** A3 — the frontend authorization model: capabilities, never personas. */
describe('capability authorization', () => {
  let session: SessionStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    session = TestBed.inject(SessionStore);
  });
  afterEach(() => localStorage.clear());

  describe('SessionStore.hasCapability', () => {
    it('is false for every capability when signed out', () => {
      for (const c of SUPER) expect(session.hasCapability(c)).toBe(false);
      expect(session.capabilities()).toEqual([]);
    });

    it('answers from what the SERVER said, not from the persona', () => {
      session.setUser(user(FINANCE, 'FINANCE_ADMIN'));
      // The persona is still the collapsed SUPER_ADMIN one…
      expect(session.role()).toBe('SUPER_ADMIN');
      // …and it no longer decides anything.
      expect(session.hasCapability('PROPERTY_REVIEW_VIEW')).toBe(true);
      expect(session.hasCapability('PROPERTY_REVIEW_DECISION')).toBe(false);
      expect(session.hasCapability('ROLE_ADMINISTRATION')).toBe(false);
      expect(session.hasCapability('SYSTEM_ADMINISTRATION')).toBe(false);
    });

    it('hasAll requires every capability listed', () => {
      session.setUser(user(FINANCE, 'FINANCE_ADMIN'));
      expect(session.hasAll([])).toBe(true);
      expect(session.hasAll(['FINANCIAL_OPERATIONS'])).toBe(true);
      expect(session.hasAll(['FINANCIAL_OPERATIONS', 'ROLE_ADMINISTRATION'])).toBe(false);
    });

    it('clear() takes every capability away', () => {
      session.setUser(user(SUPER));
      session.clear();
      expect(session.hasCapability('ROLE_ADMINISTRATION')).toBe(false);
    });
  });

  describe('capabilityGuard', () => {
    const run = (data: Record<string, unknown>) =>
      TestBed.runInInjectionContext(() =>
        capabilityGuard({ data } as unknown as ActivatedRouteSnapshot, {} as RouterStateSnapshot));

    it('refuses an anonymous visitor on a capability route', () => {
      expect(run({ capabilities: ['ROLE_ADMINISTRATION'] })).toBeInstanceOf(UrlTree);
    });

    it('admits a route with no capability requirement', () => {
      session.setUser(user([]));
      expect(run({})).toBe(true);
    });

    it.each<[string, Capability[], Capability[], boolean]>([
      ['SUPER_ADMIN → owner administration', SUPER, ['OWNER_ADMINISTRATION'], true],
      ['OPS_ADMIN → owner administration', OPS, ['OWNER_ADMINISTRATION'], false],
      ['FINANCE_ADMIN → owner administration', FINANCE, ['OWNER_ADMINISTRATION'], false],
      ['FINANCE_ADMIN → cross-owner property browse', FINANCE, ['PROPERTY_ADMINISTRATION_VIEW'], true],
      ['SUPER_ADMIN → staff management', SUPER, ['ROLE_ADMINISTRATION'], true],
      ['OPS_ADMIN → staff management', OPS, ['ROLE_ADMINISTRATION'], false],
      ['FINANCE_ADMIN → staff management', FINANCE, ['ROLE_ADMINISTRATION'], false],
      ['FINANCE_ADMIN → review queue', FINANCE, ['PROPERTY_REVIEW_VIEW'], true],
      ['FINANCE_ADMIN → KYC', FINANCE, ['KYC_OPERATIONS'], false],
      ['FINANCE_ADMIN → system administration', FINANCE, ['SYSTEM_ADMINISTRATION'], false],
      ['OPS_ADMIN → KYC', OPS, ['KYC_OPERATIONS'], true],
      ['OPS_ADMIN → review queue', OPS, ['PROPERTY_REVIEW_VIEW'], true],
    ])('%s', (_label, caps, required, allowed) => {
      session.setUser(user(caps));
      const res = run({ capabilities: required });
      allowed ? expect(res).toBe(true) : expect(res).toBeInstanceOf(UrlTree);
    });
  });

  describe('navigation visibility', () => {
    const visibleFor = (caps: Capability[]) => {
      session.setUser(user(caps));
      return NAV_CONFIG.filter((i) => session.hasAll(i.capabilities ?? [])).map((i) => i.id);
    };

    it('Property Owners is visible to SUPER_ADMIN only (A4)', () => {
      expect(visibleFor(SUPER)).toContain('owners');
      expect(visibleFor(OPS)).not.toContain('owners');
      expect(visibleFor(FINANCE)).not.toContain('owners');
    });

    it('Staff / Administrators is visible to SUPER_ADMIN only', () => {
      expect(visibleFor(SUPER)).toContain('staff');
      expect(visibleFor(OPS)).not.toContain('staff');
      expect(visibleFor(FINANCE)).not.toContain('staff');
    });

    it('Property Review is visible to all three admin roles (FINANCE view-only)', () => {
      for (const caps of [SUPER, OPS, FINANCE]) expect(visibleFor(caps)).toContain('property-review');
    });

    it('Missing daily rates follows the endpoint (PROPERTY_OPERATIONS): Super and Ops, not Finance', () => {
      expect(visibleFor(SUPER)).toContain('daily-rates');
      expect(visibleFor(OPS)).toContain('daily-rates');
      expect(visibleFor(FINANCE)).not.toContain('daily-rates');
    });

    it('Monthly rent follows the endpoint (FINANCIAL_OPERATIONS): all three admin roles', () => {
      for (const caps of [SUPER, OPS, FINANCE]) expect(visibleFor(caps)).toContain('rent-invoices');
      expect(visibleFor(['OPERATIONAL_READ'])).not.toContain('rent-invoices');
    });

    it('FINANCE_ADMIN sees finance, not KYC / reviews / visitors / roles', () => {
      const nav = visibleFor(FINANCE);
      expect(nav).toEqual(expect.arrayContaining(['invoices', 'payments', 'collections']));
      for (const hidden of ['kyc', 'reviews', 'visitors', 'roles', 'staff', 'settings', 'owners']) {
        expect(nav).not.toContain(hidden);
      }
    });

    it('a signed-out session sees no capability-gated item', () => {
      session.clear();
      const nav = NAV_CONFIG.filter((i) => session.hasAll(i.capabilities ?? [])).map((i) => i.id);
      for (const gated of ['staff', 'owners', 'property-review', 'kyc', 'users', 'roles']) {
        expect(nav).not.toContain(gated);
      }
    });

    it('every capability a nav item requires is a real capability name', () => {
      const known = new Set<string>(SUPER);
      for (const item of NAV_CONFIG) for (const c of item.capabilities ?? []) expect(known.has(c)).toBe(true);
    });
  });
});
