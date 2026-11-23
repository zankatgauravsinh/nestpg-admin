import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../api/api.service';
import { ApiResponse } from '../api/api.types';

/**
 * ADM-D.1 — the Admin deposit-dispute contract (backend M-C.4.0–M-C.4.5), exactly as
 * the controllers and projections define it. Every call PROPAGATES its error: a
 * failed request is never turned into an empty result here.
 *
 * Not called from the UI by design: `POST /payments/ops/reconcile-deposit-refunds`
 * (it runs the refund worker — a money-moving action; ADM-D.0 §9 Option A).
 */
export type DisputeTargetType = 'OFFLINE_COLLECTION' | 'OFFLINE_REFUND' | 'SETTLEMENT' | 'ONLINE_REFUND';
export type DisputeStatus = 'OPEN' | 'RESOLVED' | 'WITHDRAWN';
export type DisputeSide = 'TENANT' | 'OWNER' | 'ADMIN';
export type DisputeFinding = 'UPHELD' | 'DISMISSED' | 'INCONCLUSIVE';
export type DisputeEffect = 'NONE' | 'OFFLINE_REFUND_CONFIRMED' | 'SETTLEMENT_SUPERSEDED';
export type DisputeEventAction =
  | 'OPENED' | 'COUNTER_STATEMENT' | 'NOTE_ADDED' | 'WITHDRAWN' | 'FREEZE_BLOCKED' | 'RESOLVED' | 'EFFECT_EXECUTED' | 'EFFECT_EXECUTION_FAILED';

export const DISPUTE_TARGET_TYPES: readonly DisputeTargetType[] = ['OFFLINE_COLLECTION', 'OFFLINE_REFUND', 'SETTLEMENT', 'ONLINE_REFUND'];
export const DISPUTE_FINDINGS: readonly DisputeFinding[] = ['UPHELD', 'DISMISSED', 'INCONCLUSIVE'];
export const DISPUTE_EFFECTS: readonly DisputeEffect[] = ['NONE', 'OFFLINE_REFUND_CONFIRMED', 'SETTLEMENT_SUPERSEDED'];
/** The backend's reason / note / statement limit (`DEPOSIT_DISPUTE_REASON_MAX`). */
export const DISPUTE_TEXT_MAX = 1000;
/**
 * The acknowledgement-copy version a non-NONE resolution must echo
 * (`DEPOSIT_DISPUTE_RESOLUTION_VERSION`). No endpoint publishes it; a mismatch is a
 * 400 `DISPUTE_RESOLUTION_INVALID:RESOLUTION_VERSION_MISMATCH`.
 */
export const DISPUTE_RESOLUTION_VERSION = 'dispute-resolution-v1';
/**
 * Presentation copy of `DEPOSIT_DISPUTE_ALLOWED_EFFECTS` — used only to offer the
 * choices; the server validates every resolution independently.
 */
export const DISPUTE_ALLOWED_EFFECTS: Readonly<Record<DisputeTargetType, readonly DisputeEffect[]>> = {
  OFFLINE_COLLECTION: ['NONE', 'SETTLEMENT_SUPERSEDED'],
  OFFLINE_REFUND: ['NONE'],
  SETTLEMENT: ['NONE', 'OFFLINE_REFUND_CONFIRMED', 'SETTLEMENT_SUPERSEDED'],
  ONLINE_REFUND: ['NONE'],
};

export interface DisputeTargetRefs {
  offlineEventId: string | null;
  settlementId: string | null;
  deductionId: string | null;
  refundId: string | null;
}

/** `GET /admin/deposit-disputes` row (the admin `projectDispute`). */
export interface AdminDispute {
  id: string;
  bookingId: string;
  bookingNumber?: string;
  bookingStatus?: string;
  bookingDepositId: string;
  propertyId: string;
  tenantId: string;
  targetType: DisputeTargetType;
  target: DisputeTargetRefs;
  openedSide: DisputeSide;
  openedBy: string;
  reason: string;
  status: DisputeStatus;
  finding: DisputeFinding | null;
  effect: DisputeEffect | null;
  resolutionReason: string | null;
  resolutionVersion: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  withdrawnAt: string | null;
  supersedesDisputeId: string | null;
  /** null while OPEN / WITHDRAWN; false = recorded, not applied; true = applied (NONE: at resolution). */
  effectExecuted: boolean | null;
  effectExecutedAt: string | null;
  effectExecutionRef: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface AdminDisputeEvent {
  id: string;
  actorId: string | null;
  actorSide: DisputeSide | 'SYSTEM';
  action: DisputeEventAction;
  note: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface DeductionFact {
  id: string;
  amountPaisa: number;
  reason: string;
  category: string | null;
  createdBy: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface TargetFacts {
  offlineEvent: {
    id: string; eventType: string; status: string; amountPaisa: number; method: string; eventDate: string;
    initiatorSide: string; confirmRequiredFrom: string; recordedBy: string | null; recordedAt: string | null;
    confirmedBy: string | null; confirmedAt: string | null; confirmationVersion: string | null;
    rejectedBy: string | null; rejectedAt: string | null; rejectionReason: string | null;
    withdrawnBy: string | null; withdrawnAt: string | null; settlementId: string | null; deletedAt: string | null;
  } | null;
  settlement: {
    id: string; status: string; depositAmountPaisa: number; totalDeductionsPaisa: number; refundablePaisa: number;
    settledBy: string | null; settledAt: string | null; automatic: boolean;
    refundExceptionCode: string | null; refundExceptionAt: string | null; deletedAt: string | null;
    supersedesSettlementId: string | null; supersedingDisputeId: string | null; deductions: DeductionFact[];
  } | null;
  deduction: DeductionFact | null;
  refund: {
    id: string; refundNumber: string; paymentId: string; gatewayPaymentId: string | null; amountPaisa: number;
    status: string; gatewayRefundId: string | null; processedAt: string | null; createdAt: string; deletedAt: string | null;
    transactions: Array<{ id: string; kind: string; gatewayRef: string | null; createdAt: string }>;
  } | null;
}

/** `GET /admin/deposit-disputes/:id`. */
export interface AdminDisputeDetail extends AdminDispute {
  supersededByDisputeId: string | null;
  targetFacts: TargetFacts;
  events: AdminDisputeEvent[];
}

/** Response of resolve / execute-effect (the backend `resolutionView`). */
export interface DisputeResolutionResult {
  id: string;
  bookingId: string;
  targetType: DisputeTargetType;
  status: DisputeStatus;
  finding: DisputeFinding | null;
  effect: DisputeEffect | null;
  effectExecuted: boolean;
  effectExecutedAt: string | null;
  effectExecutionRef: string | null;
  resolutionReason: string | null;
  resolutionVersion: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  supersedesDisputeId: string | null;
}

/** `GET /admin/bookings/:id/deposit-history`. */
export interface BookingDepositHistory {
  booking: {
    id: string; bookingNumber: string; status: string; tenantId: string; propertyId: string;
    checkInDate: string | null; checkOutDate: string | null; actualCheckInAt: string | null; actualCheckOutAt: string | null;
    cancelledBy: string | null; cancelledAt: string | null; cancellationReason: string | null; noShowAt: string | null; deletedAt: string | null;
  };
  deposit: { id: string; amountPaisa: number; status: string; collectedAt: string | null; updatedBy: string | null; updatedAt: string | null; deletedAt: string | null } | null;
  offlineEvents: Array<{
    id: string; settlementId: string | null; eventType: string; status: string; initiatorSide: string; confirmRequiredFrom: string;
    amountPaisa: number; method: string; eventDate: string; recordedBy: string | null; recordedAt: string | null;
    confirmedBy: string | null; confirmedAt: string | null; confirmationVersion: string | null;
    rejectedBy: string | null; rejectedAt: string | null; rejectionReason: string | null;
    withdrawnBy: string | null; withdrawnAt: string | null; updatedBy: string | null; updatedAt: string | null; deletedAt: string | null;
  }>;
  settlements: Array<{
    id: string; status: string; depositAmountPaisa: number; totalDeductionsPaisa: number; refundablePaisa: number;
    settledBy: string | null; settledAt: string | null; automatic: boolean; refundExceptionCode: string | null; refundExceptionAt: string | null;
    supersedesSettlementId: string | null; supersedingDisputeId: string | null;
    createdBy: string | null; createdAt: string; updatedBy: string | null; updatedAt: string | null; deletedAt: string | null;
    deductions: DeductionFact[];
  }>;
  refunds: Array<{
    id: string; refundNumber: string; paymentId: string; gatewayPaymentId: string | null; amountPaisa: number; status: string;
    gatewayRefundId: string | null; processedAt: string | null; createdBy: string | null; createdAt: string; updatedAt: string | null; deletedAt: string | null;
    transactions: Array<{ id: string; kind: string; gatewayRef: string | null; createdAt: string }>;
  }>;
  bookingHistory: Array<{ id: string; fromStatus: string | null; toStatus: string; changedBy: string | null; reason: string | null; metadata: Record<string, unknown>; createdAt: string }>;
  disputes: AdminDispute[];
}

/** The subset of `GET /bookings/:id` the console reads (labels + the derived refund state). */
export interface BookingContext {
  id: string;
  bookingNumber: string;
  status: string;
  tenantName?: string | null;
  propertyName?: string | null;
  buildingName?: string | null;
  roomNumber?: string | null;
  bedLabel?: string | null;
  depositRefund?: { rail: 'ONLINE' | 'OFFLINE'; state: string; amountPaisa: number; completedAt: string | null } | null;
}

export interface DisputeQueueQuery {
  status?: DisputeStatus;
  targetType?: DisputeTargetType;
  propertyId?: string;
  bookingId?: string;
  page?: number;
  limit?: number;
}

/** Body of `POST /admin/deposit-disputes` — exactly the ids the target type requires. */
export interface AdminOpenDisputeBody {
  bookingId: string;
  targetType: DisputeTargetType;
  offlineEventId?: string;
  settlementId?: string;
  deductionId?: string;
  refundId?: string;
  reason: string;
  supersedesDisputeId?: string;
}

export interface ResolveDisputeBody {
  finding: DisputeFinding;
  effect: DisputeEffect;
  resolutionReason: string;
  resolutionVersion?: string;
}

/**
 * The creation body for a target: the backend refuses any id the type does not take
 * (`DISPUTE_TARGET_INVALID:FORBIDDEN:extra ids`) — e.g. an OFFLINE_REFUND / ONLINE_REFUND
 * case's settlement is derived server-side and must NOT be sent.
 */
export function openBodyFor(
  bookingId: string, targetType: DisputeTargetType, refs: Partial<DisputeTargetRefs>, reason: string, supersedesDisputeId?: string | null,
): AdminOpenDisputeBody {
  const base: AdminOpenDisputeBody = { bookingId, targetType, reason, ...(supersedesDisputeId ? { supersedesDisputeId } : {}) };
  switch (targetType) {
    case 'OFFLINE_COLLECTION':
    case 'OFFLINE_REFUND':
      return { ...base, offlineEventId: refs.offlineEventId ?? undefined };
    case 'SETTLEMENT':
      return { ...base, settlementId: refs.settlementId ?? undefined, ...(refs.deductionId ? { deductionId: refs.deductionId } : {}) };
    case 'ONLINE_REFUND':
      return { ...base, refundId: refs.refundId ?? undefined };
  }
}

@Injectable({ providedIn: 'root' })
export class DepositDisputesService {
  private readonly api = inject(ApiService);

  queue(q: DisputeQueueQuery = {}): Observable<ApiResponse<AdminDispute[]>> {
    return this.api.getPaged<AdminDispute[]>('/admin/deposit-disputes', {
      status: q.status, targetType: q.targetType, propertyId: q.propertyId, bookingId: q.bookingId,
      page: q.page ?? 1, limit: q.limit ?? 20,
    });
  }

  detail(id: string): Observable<AdminDisputeDetail> {
    return this.api.get<AdminDisputeDetail>(`/admin/deposit-disputes/${id}`);
  }

  depositHistory(bookingId: string): Observable<BookingDepositHistory> {
    return this.api.get<BookingDepositHistory>(`/admin/bookings/${bookingId}/deposit-history`);
  }

  bookingContext(bookingId: string): Observable<BookingContext> {
    return this.api.get<BookingContext>(`/bookings/${bookingId}`);
  }

  /** NOT idempotent: a retry appends a second note. */
  addNote(id: string, note: string): Observable<{ disputeId: string; eventId: string }> {
    return this.api.post(`/admin/deposit-disputes/${id}/notes`, { note });
  }

  /** Starts a refund-execution freeze on the booking while the case is OPEN. */
  open(body: AdminOpenDisputeBody): Observable<{ id: string }> {
    return this.api.post(`/admin/deposit-disputes`, body);
  }

  withdraw(id: string): Observable<{ id: string; status: DisputeStatus }> {
    return this.api.post(`/admin/deposit-disputes/${id}/withdraw`);
  }

  /** Records the decision only — no money moves. */
  resolve(id: string, body: ResolveDisputeBody): Observable<DisputeResolutionResult> {
    return this.api.post(`/admin/deposit-disputes/${id}/resolve`, body);
  }

  /** Applies the recorded effect. The body is EMPTY by contract — nothing is sent. */
  executeEffect(id: string): Observable<DisputeResolutionResult> {
    return this.api.post(`/admin/deposit-disputes/${id}/execute-effect`, {});
  }
}
