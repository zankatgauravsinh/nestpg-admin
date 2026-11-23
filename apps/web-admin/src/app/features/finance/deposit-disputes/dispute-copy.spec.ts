import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorInfo } from '../../../core/http/api-error-info';
import { disputeErrorCopy, effectState, eventMeta, supersedeRule } from './dispute-copy';
import { NAV_CONFIG } from '../../../core/navigation/nav.config';
import { routes } from '../../../app.routes';

const copy = (status: number, message: string, details?: Record<string, unknown>, code?: string) =>
  disputeErrorCopy(apiErrorInfo(new HttpErrorResponse({ status, error: { errors: [{ code: code ?? message, message, ...(details ? { details } : {}) }] } })));

/** ADM-D.1 — operator copy for the real backend codes (ADM-D.0 §11). */
describe('disputeErrorCopy', () => {
  it('BLOCKED_BY_OPEN_CASE links the blocking case and asks for a refresh', () => {
    const c = copy(409, 'DISPUTE_EFFECT_BLOCKED_BY_OPEN_CASE', { disputeId: 'd-1', blockingDisputeId: 'd-2', blockingTargetType: 'SETTLEMENT' });
    expect(c).toMatchObject({ refresh: true, linkDisputeId: 'd-2', linkLabel: 'Open the blocking case' });
    expect(c.message).toMatch(/another dispute on this booking is open/);
  });
  it('DISPUTE_ALREADY_OPEN links the existing case; LIFETIME_CAP explains the limit', () => {
    expect(copy(409, 'DISPUTE_ALREADY_OPEN', { disputeId: 'd-9' })).toMatchObject({ linkDisputeId: 'd-9' });
    expect(copy(409, 'DISPUTE_LIFETIME_CAP_REACHED', { cap: 2, side: 'ADMIN' }).message).toMatch(/maximum number of cases \(2\)/);
  });
  it('resolution tokens become sentences', () => {
    const c = copy(400, 'DISPUTE_RESOLUTION_INVALID:EFFECT_REQUIRES_UPHELD,EFFECT_NOT_ALLOWED_FOR_TARGET', undefined, 'Bad Request');
    expect(c.message).toMatch(/Only an upheld finding/);
    expect(c.message).toMatch(/not allowed for this case type/);
    expect(c.refresh).toBe(false);
  });
  it('target-ineligible reasons and state conflicts', () => {
    expect(copy(400, 'DISPUTE_TARGET_INELIGIBLE:NOT_CONFIRMED', undefined, 'Bad Request').message).toMatch(/confirmed offline records/);
    expect(copy(409, 'DISPUTE_NOT_OPEN', { disputeId: 'd-1', status: 'RESOLVED' })).toMatchObject({ refresh: true, message: 'This case is no longer open (now resolved).' });
    expect(copy(409, 'DISPUTE_TARGET_CHANGED', { disputeId: 'd-1' }).refresh).toBe(true);
    expect(copy(409, 'DISPUTE_EFFECT_NOT_DERIVABLE', { disputeId: 'd-1' }).refresh).toBe(false);
  });
  it('authorization: withdrawal restrictions and role refusals', () => {
    expect(copy(403, 'DISPUTE_NOT_OPENER', undefined, 'Forbidden').message).toMatch(/Only the admin who opened/);
    expect(copy(403, 'DISPUTE_NOT_ADMIN_OPENED', undefined, 'Forbidden').message).toMatch(/cannot be withdrawn here/);
    expect(copy(403, 'Forbidden resource', undefined, 'Forbidden').message).toBe('Your role cannot do this.');
  });
  it('network and server failures are UNCERTAIN (no retry; refresh first)', () => {
    expect(disputeErrorCopy(apiErrorInfo(new HttpErrorResponse({ status: 0 })))).toMatchObject({ uncertain: true, refresh: true });
    expect(copy(500, 'An unexpected error occurred', undefined, 'INTERNAL_ERROR')).toMatchObject({ uncertain: true, refresh: true });
  });
  it('a validation sentence is shown; an unknown code falls back without leaking it', () => {
    expect(copy(400, 'reason must be shorter than or equal to 1000 characters', undefined, 'Bad Request').message).toBe('reason must be shorter than or equal to 1000 characters');
    expect(copy(409, 'SOME_NEW_CODE').message).toBe('The request could not be completed.');
  });
});

describe('effectState / supersedeRule / eventMeta', () => {
  it('effect state comes from the server fields only', () => {
    expect(effectState({ status: 'OPEN', effect: null, effectExecuted: null })).toBe('not-applicable');
    expect(effectState({ status: 'RESOLVED', effect: 'NONE', effectExecuted: true })).toBe('none');
    expect(effectState({ status: 'RESOLVED', effect: 'SETTLEMENT_SUPERSEDED', effectExecuted: false })).toBe('pending');
    expect(effectState({ status: 'RESOLVED', effect: 'SETTLEMENT_SUPERSEDED', effectExecuted: true })).toBe('applied');
  });
  it('the supersession rule mirrors the locked backend derivation (no broadening)', () => {
    const t = (o: object) => ({ targetType: 'SETTLEMENT' as const, target: { offlineEventId: null, settlementId: 's', deductionId: null, refundId: null }, openedSide: 'TENANT' as const, ...o });
    expect(supersedeRule(t({ target: { offlineEventId: null, settlementId: 's', deductionId: 'dd', refundId: null }, openedSide: 'ADMIN' })).derivable).toBe(true);
    expect(supersedeRule(t({})).derivable).toBe(true);
    expect(supersedeRule(t({ openedSide: 'OWNER' })).derivable).toBe(false);
    expect(supersedeRule(t({ openedSide: 'ADMIN' })).derivable).toBe(false);
    expect(supersedeRule(t({ targetType: 'OFFLINE_COLLECTION' })).derivable).toBe(false);
  });
  it('event metadata is whitelisted per action; objects and unknown keys are dropped', () => {
    const base = { id: 'e', actorId: null, actorSide: 'SYSTEM' as const, note: null, createdAt: 'x' };
    expect(eventMeta({ ...base, action: 'FREEZE_BLOCKED', metadata: { chokepoint: 'ONLINE_REFUND_WORKER', settlementId: 's', remainingPaisa: 5, raw: { secret: 1 } } }))
      .toEqual([{ key: 'chokepoint', label: 'Blocked action', value: 'ONLINE_REFUND_WORKER' }]);
    expect(eventMeta({ ...base, action: 'NOTE_ADDED', metadata: { anything: 'x' } })).toEqual([]);
    expect(eventMeta({ ...base, action: 'EFFECT_EXECUTION_FAILED', metadata: { code: 'DISPUTE_EFFECT_BLOCKED_BY_OPEN_CASE' } })[0]!.value).toBe('DISPUTE_EFFECT_BLOCKED_BY_OPEN_CASE');
  });
});

describe('navigation and routes', () => {
  it('"Deposit disputes" sits in the Finance section, gated by OPERATIONAL_READ', () => {
    const i = NAV_CONFIG.findIndex((n) => n.id === 'deposit-disputes');
    const finance = NAV_CONFIG.findIndex((n) => n.id === 'sec-finance');
    const next = NAV_CONFIG.findIndex((n, k) => k > finance && n.isSection);
    expect(i).toBeGreaterThan(finance);
    expect(i).toBeLessThan(next);
    expect(NAV_CONFIG[i]).toMatchObject({ route: '/finance/deposit-disputes', capabilities: ['OPERATIONAL_READ'] });
  });
  it('the three routes require OPERATIONAL_READ', () => {
    const shell = routes.find((r) => r.path === '' && r.children)!;
    for (const p of ['finance/deposit-disputes', 'finance/deposit-disputes/:id', 'finance/deposits/:bookingId']) {
      const r = shell.children!.find((c) => c.path === p);
      expect(r?.data?.['capabilities']).toEqual(['OPERATIONAL_READ']);
      expect(r?.canActivate?.length).toBe(1);
    }
  });
});
