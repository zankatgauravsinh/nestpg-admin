import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorInfo } from './api-error-info';

/** ADM-D.1 — reading the real AllExceptionsFilter envelope shapes. */
const err = (status: number, errors: unknown[]) => new HttpErrorResponse({ status, error: { success: false, data: null, errors } });

describe('apiErrorInfo', () => {
  it('a bare HttpException: the domain code is in `message`, the reason phrase in `code`', () => {
    const i = apiErrorInfo(err(400, [{ code: 'Bad Request', message: 'DISPUTE_NOT_OPEN' }]));
    expect(i).toMatchObject({ kind: 'validation', status: 400, code: 'DISPUTE_NOT_OPEN', detail: null, details: null });
  });

  it('a structured refusal keeps `details` (the blocking case id)', () => {
    const i = apiErrorInfo(err(409, [{ code: 'DISPUTE_EFFECT_BLOCKED_BY_OPEN_CASE', message: 'DISPUTE_EFFECT_BLOCKED_BY_OPEN_CASE', details: { disputeId: 'd-1', blockingDisputeId: 'd-2', blockingTargetType: 'SETTLEMENT' } }]));
    expect(i).toMatchObject({ kind: 'conflict', code: 'DISPUTE_EFFECT_BLOCKED_BY_OPEN_CASE', details: { blockingDisputeId: 'd-2' } });
  });

  it('splits a colon-suffixed code into code + detail', () => {
    const i = apiErrorInfo(err(400, [{ code: 'Bad Request', message: 'DISPUTE_RESOLUTION_INVALID:EFFECT_REQUIRES_UPHELD,RESOLUTION_VERSION_REQUIRED' }]));
    expect(i.code).toBe('DISPUTE_RESOLUTION_INVALID');
    expect(i.detail).toBe('EFFECT_REQUIRES_UPHELD,RESOLUTION_VERSION_REQUIRED');
    expect(apiErrorInfo(err(400, [{ code: 'Bad Request', message: 'DISPUTE_TARGET_INVALID:MISSING:settlementId' }]))).toMatchObject({ code: 'DISPUTE_TARGET_INVALID', detail: 'MISSING:settlementId' });
  });

  it('a validation sentence is not a domain code', () => {
    const i = apiErrorInfo(err(400, [{ code: 'Bad Request', message: 'property amountPaisa should not exist' }]));
    expect(i).toMatchObject({ kind: 'validation', code: null, message: 'property amountPaisa should not exist' });
    expect(apiErrorInfo(err(403, [{ code: 'Forbidden', message: 'Forbidden resource' }]))).toMatchObject({ kind: 'forbidden', code: null });
  });

  it('classifies transport, auth, not-found and server failures; ignores non-object details', () => {
    expect(apiErrorInfo(new HttpErrorResponse({ status: 0 })).kind).toBe('network');
    expect(apiErrorInfo(err(401, [{ code: 'Unauthorized', message: 'Unauthorized' }])).kind).toBe('auth');
    expect(apiErrorInfo(err(404, [{ code: 'Not Found', message: 'DEPOSIT_DISPUTE_NOT_FOUND' }]))).toMatchObject({ kind: 'not-found', code: 'DEPOSIT_DISPUTE_NOT_FOUND' });
    expect(apiErrorInfo(err(500, [{ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' }])).kind).toBe('server');
    expect(apiErrorInfo(err(409, [{ code: 'X_Y', message: 'X_Y', details: ['a'] }])).details).toBeNull();
  });
});
