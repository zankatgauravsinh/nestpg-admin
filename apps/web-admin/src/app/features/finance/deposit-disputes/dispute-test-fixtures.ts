import type { AdminDisputeDetail, BookingDepositHistory } from '../../../core/data/deposit-disputes.service';
import type { CurrentUser } from '../../../core/models/role.model';
import type { Capability } from '../../../core/models/capability.model';

/** ADM-D.1 test fixtures shaped exactly like the backend admin projection. */
export const SUPER_OR_FINANCE: Capability[] = ['OPERATIONAL_READ', 'DEPOSIT_DISPUTE_OPERATIONS', 'DEPOSIT_DISPUTE_RESOLUTION', 'FINANCIAL_OPERATIONS'];
export const OPS: Capability[] = ['OPERATIONAL_READ', 'DEPOSIT_DISPUTE_OPERATIONS', 'FINANCIAL_OPERATIONS'];
export const READ_ONLY: Capability[] = ['OPERATIONAL_READ'];

export const adminUser = (capabilities: Capability[], id = 'admin-me', backendRole = 'FINANCE_ADMIN'): CurrentUser => ({
  id, name: 'Admin', email: 'a@nestpg.test', role: 'SUPER_ADMIN', backendRole, initials: 'A', organization: 'NestPG', capabilities,
});

export function detail(over: Partial<AdminDisputeDetail> = {}): AdminDisputeDetail {
  return {
    id: 'd-1', bookingId: 'b-1', bookingNumber: 'NPG2610-000514', bookingStatus: 'CHECKED_OUT', bookingDepositId: 'dep-1',
    propertyId: 'p-1', tenantId: 'tenant-uuid-1111', targetType: 'SETTLEMENT',
    target: { offlineEventId: null, settlementId: 's-1', deductionId: 'dd-1', refundId: null },
    openedSide: 'TENANT', openedBy: 'tenant-uuid-1111', reason: 'The wall was already damaged', status: 'OPEN',
    finding: null, effect: null, resolutionReason: null, resolutionVersion: null, resolvedBy: null, resolvedAt: null, withdrawnAt: null,
    supersedesDisputeId: null, supersededByDisputeId: null, effectExecuted: null, effectExecutedAt: null, effectExecutionRef: null,
    createdAt: '2026-10-08T10:00:00.000Z', updatedAt: '2026-10-08T10:00:00.000Z', deletedAt: null,
    targetFacts: {
      offlineEvent: null,
      settlement: {
        id: 's-1', status: 'PENDING', depositAmountPaisa: 1500000, totalDeductionsPaisa: 600000, refundablePaisa: 900000,
        settledBy: 'owner-uuid-2222', settledAt: '2026-10-07T10:00:00.000Z', automatic: false, refundExceptionCode: null, refundExceptionAt: null,
        deletedAt: null, supersedesSettlementId: null, supersedingDisputeId: null,
        deductions: [
          { id: 'dd-1', amountPaisa: 500000, reason: 'Wall damage', category: 'Damage', createdBy: 'owner-uuid-2222', createdAt: '2026-10-07T10:00:00.000Z', deletedAt: null },
          { id: 'dd-2', amountPaisa: 100000, reason: 'Cleaning', category: null, createdBy: 'owner-uuid-2222', createdAt: '2026-10-07T10:00:00.001Z', deletedAt: null },
        ],
      },
      deduction: { id: 'dd-1', amountPaisa: 500000, reason: 'Wall damage', category: 'Damage', createdBy: 'owner-uuid-2222', createdAt: '2026-10-07T10:00:00.000Z', deletedAt: null },
      refund: null,
    },
    events: [
      { id: 'e-1', actorId: 'tenant-uuid-1111', actorSide: 'TENANT', action: 'OPENED', note: 'The wall was already damaged', metadata: { targetType: 'SETTLEMENT' }, createdAt: '2026-10-08T10:00:00.000Z' },
      { id: 'e-2', actorId: 'owner-uuid-2222', actorSide: 'OWNER', action: 'COUNTER_STATEMENT', note: 'Fresh damage at inspection', metadata: {}, createdAt: '2026-10-08T11:00:00.000Z' },
      { id: 'e-3', actorId: 'ops-uuid-3333', actorSide: 'ADMIN', action: 'NOTE_ADDED', note: 'INTERNAL: photos reviewed', metadata: {}, createdAt: '2026-10-08T12:00:00.000Z' },
      { id: 'e-4', actorId: null, actorSide: 'SYSTEM', action: 'FREEZE_BLOCKED', note: null, metadata: { chokepoint: 'ONLINE_REFUND_WORKER', settlementId: 's-1', remainingPaisa: 900000 }, createdAt: '2026-10-08T12:05:00.000Z' },
    ],
    ...over,
  };
}

export function history(over: Partial<BookingDepositHistory> = {}): BookingDepositHistory {
  return {
    booking: { id: 'b-1', bookingNumber: 'NPG2610-000514', status: 'CHECKED_OUT', tenantId: 't-1', propertyId: 'p-1', checkInDate: '2026-09-01', checkOutDate: '2026-10-05',
      actualCheckInAt: null, actualCheckOutAt: null, cancelledBy: null, cancelledAt: null, cancellationReason: null, noShowAt: null, deletedAt: null },
    deposit: { id: 'dep-1', amountPaisa: 1500000, status: 'COLLECTED', collectedAt: '2026-09-01T10:00:00.000Z', updatedBy: null, updatedAt: null, deletedAt: null },
    offlineEvents: [
      { id: 'oe-1', settlementId: null, eventType: 'DEPOSIT_COLLECTION', status: 'CONFIRMED', initiatorSide: 'OWNER', confirmRequiredFrom: 'TENANT', amountPaisa: 1500000, method: 'CASH', eventDate: '2026-09-01',
        recordedBy: 'o-1', recordedAt: '2026-09-01T10:00:00.000Z', confirmedBy: 't-1', confirmedAt: '2026-09-01T11:00:00.000Z', confirmationVersion: 'offline-financial-v1',
        rejectedBy: null, rejectedAt: null, rejectionReason: null, withdrawnBy: null, withdrawnAt: null, updatedBy: null, updatedAt: null, deletedAt: null },
      { id: 'oe-2', settlementId: 's-2', eventType: 'DEPOSIT_REFUND', status: 'WAITING_FOR_COUNTERPARTY', initiatorSide: 'OWNER', confirmRequiredFrom: 'TENANT', amountPaisa: 1400000, method: 'CASH', eventDate: '2026-10-06',
        recordedBy: 'o-1', recordedAt: '2026-10-06T10:00:00.000Z', confirmedBy: null, confirmedAt: null, confirmationVersion: null,
        rejectedBy: null, rejectedAt: null, rejectionReason: null, withdrawnBy: null, withdrawnAt: null, updatedBy: null, updatedAt: null, deletedAt: null },
    ],
    settlements: [
      { id: 's-1', status: 'PENDING', depositAmountPaisa: 1500000, totalDeductionsPaisa: 600000, refundablePaisa: 900000, settledBy: 'o-1', settledAt: '2026-10-05T10:00:00.000Z', automatic: false,
        refundExceptionCode: null, refundExceptionAt: null, supersedesSettlementId: null, supersedingDisputeId: null, createdBy: 'o-1', createdAt: '2026-10-05T10:00:00.000Z', updatedBy: null, updatedAt: null, deletedAt: null,
        deductions: [{ id: 'dd-1', amountPaisa: 500000, reason: 'Wall damage', category: 'Damage', createdBy: 'o-1', createdAt: '2026-10-05T10:00:00.000Z', deletedAt: null },
                     { id: 'dd-2', amountPaisa: 100000, reason: 'Cleaning', category: null, createdBy: 'o-1', createdAt: '2026-10-05T10:00:00.001Z', deletedAt: null }] },
      { id: 's-2', status: 'PENDING', depositAmountPaisa: 1500000, totalDeductionsPaisa: 100000, refundablePaisa: 1400000, settledBy: 'fin-1', settledAt: '2026-10-06T10:00:00.000Z', automatic: false,
        refundExceptionCode: null, refundExceptionAt: null, supersedesSettlementId: 's-1', supersedingDisputeId: 'd-1', createdBy: 'fin-1', createdAt: '2026-10-06T10:00:00.000Z', updatedBy: null, updatedAt: null, deletedAt: null,
        deductions: [{ id: 'dd-3', amountPaisa: 100000, reason: 'Cleaning', category: null, createdBy: 'fin-1', createdAt: '2026-10-06T10:00:00.000Z', deletedAt: null }] },
    ],
    refunds: [],
    bookingHistory: [{ id: 'h-1', fromStatus: 'CHECKED_IN', toStatus: 'CHECKED_OUT', changedBy: 'o-1', reason: null, metadata: { secretKey: 'should-not-render' }, createdAt: '2026-10-05T09:00:00.000Z' }],
    disputes: [],
    ...over,
  };
}
