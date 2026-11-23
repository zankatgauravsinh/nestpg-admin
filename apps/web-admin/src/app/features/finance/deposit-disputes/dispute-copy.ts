import type { PillTone } from '../../../shared/components/status-pill.component';
import type { ApiErrorInfo } from '../../../core/http/api-error-info';
import type {
  AdminDispute, AdminDisputeEvent, DisputeEffect, DisputeFinding, DisputeSide, DisputeStatus, DisputeTargetType,
} from '../../../core/data/deposit-disputes.service';

/**
 * ADM-D.1 — the console's vocabulary. Every function here maps a SERVER value to
 * words; nothing here decides what an operator may do (the backend does).
 */
export const TARGET_LABEL: Record<DisputeTargetType, string> = {
  OFFLINE_COLLECTION: 'Offline deposit collection',
  OFFLINE_REFUND: 'Offline deposit refund',
  SETTLEMENT: 'Deposit settlement',
  ONLINE_REFUND: 'Online deposit refund',
};
export const STATUS_LABEL: Record<DisputeStatus, string> = { OPEN: 'Open', RESOLVED: 'Resolved', WITHDRAWN: 'Withdrawn' };
export const STATUS_TONE: Record<DisputeStatus, PillTone> = { OPEN: 'warning', RESOLVED: 'success', WITHDRAWN: 'neutral' };
export const SIDE_LABEL: Record<DisputeSide | 'SYSTEM', string> = {
  TENANT: 'Resident', OWNER: 'Property', ADMIN: 'NestPG admin', SYSTEM: 'System',
};
export const FINDING_LABEL: Record<DisputeFinding, string> = { UPHELD: 'Upheld', DISMISSED: 'Dismissed', INCONCLUSIVE: 'Inconclusive' };
export const EFFECT_LABEL: Record<DisputeEffect, string> = {
  NONE: 'No change to the deposit',
  OFFLINE_REFUND_CONFIRMED: 'Mark the refund as returned offline',
  SETTLEMENT_SUPERSEDED: 'Replace the settlement with a revised one',
};
/** What applying the effect does, as the backend implements it (M-C.4.3). No figures are computed here. */
export const EFFECT_APPLY_TEXT: Record<DisputeEffect, string> = {
  NONE: 'Nothing to apply.',
  OFFLINE_REFUND_CONFIRMED: 'Marks this settlement as refunded (returned offline). No gateway refund is made and no money is sent by NestPG.',
  SETTLEMENT_SUPERSEDED: 'Creates a revised settlement under the derivation rule below. The current settlement is kept unchanged as history. Any refund then follows the usual rail.',
};

export type EffectState = 'not-applicable' | 'none' | 'pending' | 'applied';
/** The resolution's execution state, from the server's own fields. */
export function effectState(d: Pick<AdminDispute, 'status' | 'effect' | 'effectExecuted'>): EffectState {
  if (d.status !== 'RESOLVED' || d.effect === null) return 'not-applicable';
  if (d.effect === 'NONE') return 'none';
  return d.effectExecuted ? 'applied' : 'pending';
}
export const EFFECT_STATE_LABEL: Record<EffectState, string> = {
  'not-applicable': '—',
  none: 'No change',
  pending: 'Recorded — not applied',
  applied: 'Applied',
};

export const shortId = (id: string | null | undefined): string => (id ? id.slice(0, 8) : '—');

/**
 * The derivation rule for SETTLEMENT_SUPERSEDED (M-C.4.3, locked): only a deduction-line
 * case, or a whole-settlement case opened by the resident, has a server-derivable figure.
 * Presentation only — the server refuses anything else with DISPUTE_EFFECT_NOT_DERIVABLE.
 */
export function supersedeRule(d: Pick<AdminDispute, 'targetType' | 'target' | 'openedSide'>): { derivable: boolean; text: string } {
  if (d.targetType !== 'SETTLEMENT') return { derivable: false, text: 'A revised settlement can only be derived for a settlement case.' };
  if (d.target.deductionId) return { derivable: true, text: 'Removes the disputed deduction line; every other line is kept.' };
  if (d.openedSide === 'TENANT') return { derivable: true, text: 'Removes every deduction (a resident case on the whole settlement).' };
  return { derivable: false, text: 'Not available: a whole-settlement case opened by the property or an admin has no derivable figure.' };
}

const ACTION_LABEL: Record<AdminDisputeEvent['action'], string> = {
  OPENED: 'Opened', COUNTER_STATEMENT: 'Counter-statement', NOTE_ADDED: 'Internal note', WITHDRAWN: 'Withdrawn',
  FREEZE_BLOCKED: 'Blocked a refund action (freeze)', RESOLVED: 'Resolved', EFFECT_EXECUTED: 'Outcome applied',
  EFFECT_EXECUTION_FAILED: 'Outcome could not be applied',
};
export const eventLabel = (a: AdminDisputeEvent['action']): string => ACTION_LABEL[a] ?? a;

/** Whitelisted metadata per action (ADM-D.0 §6.1). Anything else is never rendered. */
const META_KEYS: Partial<Record<AdminDisputeEvent['action'], readonly string[]>> = {
  OPENED: ['supersedesDisputeId'],
  FREEZE_BLOCKED: ['chokepoint'],
  RESOLVED: ['finding', 'effect'],
  EFFECT_EXECUTED: ['effect', 'executionRef', 'refundablePaisa', 'newStatus', 'keptDeductions', 'removedDeductions', 'supersededSettlementId', 'newSettlementId'],
  EFFECT_EXECUTION_FAILED: ['code'],
};
const META_LABEL: Record<string, string> = {
  supersedesDisputeId: 'Reconsiders', chokepoint: 'Blocked action', finding: 'Finding', effect: 'Effect',
  executionRef: 'Settlement acted on', refundablePaisa: 'Refundable (server figure)', newStatus: 'New settlement status',
  keptDeductions: 'Deductions kept', removedDeductions: 'Deductions removed', supersededSettlementId: 'Superseded settlement',
  newSettlementId: 'New settlement', code: 'Reason code',
};
export function eventMeta(e: AdminDisputeEvent): Array<{ key: string; label: string; value: string | number }> {
  const keys = META_KEYS[e.action] ?? [];
  const out: Array<{ key: string; label: string; value: string | number }> = [];
  for (const k of keys) {
    const v = e.metadata?.[k];
    if (v === undefined || v === null || typeof v === 'object') continue; // primitives only
    out.push({ key: k, label: META_LABEL[k] ?? k, value: typeof v === 'number' ? v : String(v) });
  }
  return out;
}

// ── Error copy (ADM-D.0 §11) ──────────────────────────────────────────────────
export interface DisputeErrorCopy {
  message: string;
  /** Refetch the case / queue to show the server's current state. */
  refresh: boolean;
  /** A case the operator should look at (from `details`). */
  linkDisputeId?: string;
  linkLabel?: string;
  /** The outcome of the mutation is unknown (transport / server failure). */
  uncertain?: boolean;
}

const INELIGIBLE: Record<string, string> = {
  NOT_CONFIRMED: 'Only confirmed offline records can be disputed.',
  EVENT_TYPE: 'That record is not of the selected type.',
  NO_SETTLEMENT: 'There is no live settlement for this item.',
  SETTLEMENT_REFUNDED: 'This settlement is already refunded. Open a case on the refund instead.',
  SETTLEMENT_SUPERSEDED: 'This settlement was revised. Use the current settlement.',
  REFUND_IN_FLIGHT: 'The refund is still in progress at the gateway.',
  REFUND_NOT_PROCESSED: 'Only a processed refund can be disputed.',
};
const RESOLUTION: Record<string, string> = {
  INVALID_FINDING: 'Choose a finding.',
  INVALID_EFFECT: 'Choose an effect.',
  INVALID_RESOLUTION_REASON: 'Enter a resolution reason (up to 1000 characters).',
  RESOLUTION_VERSION_REQUIRED: 'Confirm the approval statement before recording this outcome.',
  RESOLUTION_VERSION_MISMATCH: 'The approval text has changed. Reload the page and try again.',
  EFFECT_NOT_ALLOWED_FOR_TARGET: 'This outcome is not allowed for this case type.',
  EFFECT_REQUIRES_UPHELD: 'Only an upheld finding can change the deposit.',
};

/** Map a structured API error from the dispute routes to operator copy. */
export function disputeErrorCopy(e: ApiErrorInfo): DisputeErrorCopy {
  const detail = e.detail ?? '';
  const link = (key: string) => (typeof e.details?.[key] === 'string' ? (e.details![key] as string) : undefined);
  if (e.kind === 'network') return { message: 'We could not confirm the result (connection problem). Refreshing to check what the server recorded.', refresh: true, uncertain: true };
  if (e.kind === 'server') return { message: 'Something went wrong on the server. Refreshing to check whether the action was applied.', refresh: true, uncertain: true };
  if (e.kind === 'auth') return { message: 'Your session has expired. Sign in again.', refresh: false };
  switch (e.code) {
    case 'ACCESS_DENIED': return { message: 'Your role cannot do this.', refresh: false };
    case 'DISPUTE_NOT_OPENER': return { message: 'Only the admin who opened this case, or a finance or super admin, can withdraw it.', refresh: false };
    case 'DISPUTE_NOT_ADMIN_OPENED': return { message: 'Cases raised by a resident or the property cannot be withdrawn here. Resolve the case instead.', refresh: false };
    case 'DEPOSIT_DISPUTE_NOT_FOUND': return { message: 'This dispute does not exist.', refresh: false };
    case 'BOOKING_NOT_FOUND': return { message: 'Booking not found. It may have been deleted.', refresh: false };
    case 'OFFLINE_EVENT_NOT_FOUND': case 'SETTLEMENT_NOT_FOUND': case 'DEDUCTION_NOT_FOUND': case 'REFUND_NOT_FOUND':
      return { message: 'That item is not part of this booking’s deposit.', refresh: true };
    case 'DISPUTE_REASON_REQUIRED': return { message: 'Enter a reason.', refresh: false };
    case 'DISPUTE_NOTE_REQUIRED': return { message: 'Enter a note.', refresh: false };
    case 'NO_DEPOSIT_DUE': return { message: 'This booking has no security deposit.', refresh: false };
    case 'DISPUTE_TARGET_INVALID': return { message: 'The selected item does not match the case type.', refresh: false };
    case 'DISPUTE_TARGET_INELIGIBLE': return { message: INELIGIBLE[detail] ?? 'This item cannot be disputed right now.', refresh: true };
    case 'DISPUTE_ALREADY_OPEN': return { message: 'A case is already open on this item.', refresh: true, linkDisputeId: link('disputeId'), linkLabel: 'Open the existing case' };
    case 'DISPUTE_LIFETIME_CAP_REACHED': return { message: 'NestPG admins have already opened the maximum number of cases (2) on this item.', refresh: false };
    case 'DISPUTE_PARENT_NOT_RESOLVED': return { message: 'Only a resolved case can be reconsidered.', refresh: true };
    case 'DISPUTE_CHAIN_LIMIT': return { message: 'This case is already a reconsideration and cannot be reconsidered again.', refresh: true };
    case 'DISPUTE_ALREADY_SUPERSEDED': return { message: 'A reconsideration of this case already exists.', refresh: true, linkDisputeId: link('disputeId'), linkLabel: 'Open the reconsideration' };
    case 'DISPUTE_SUPERSEDE_TARGET_MISMATCH': return { message: 'A reconsideration must be about the same item as the original case.', refresh: false };
    case 'DISPUTE_NOT_OPEN': {
      const status = typeof e.details?.['status'] === 'string' ? ` (now ${String(e.details['status']).toLowerCase()})` : '';
      return { message: `This case is no longer open${status}.`, refresh: true };
    }
    case 'DISPUTE_RESOLUTION_INVALID': {
      const lines = detail.split(',').map((t) => RESOLUTION[t.trim()]).filter(Boolean);
      return { message: lines.length ? lines.join(' ') : 'This resolution is not valid.', refresh: false };
    }
    case 'DISPUTE_TARGET_GONE': return { message: 'The disputed item no longer exists.', refresh: true };
    case 'DISPUTE_TARGET_CHANGED': return { message: 'The disputed item changed since the case was opened (for example, the settlement was revised). Review the case before choosing an outcome.', refresh: true };
    case 'DISPUTE_EFFECT_NOT_DERIVABLE': return { message: 'A revised settlement cannot be derived for this case. Choose another outcome.', refresh: false };
    case 'DISPUTE_EFFECT_NO_SETTLEMENT': return { message: 'There is no settlement to act on, so this outcome cannot be applied.', refresh: true };
    case 'DISPUTE_EFFECT_SETTLEMENT_REFUNDED': return { message: 'The settlement is already refunded, so this outcome cannot be applied.', refresh: true };
    case 'DISPUTE_EFFECT_SETTLEMENT_NOT_PENDING': return { message: 'The settlement is not awaiting a refund, so this outcome cannot be applied.', refresh: true };
    case 'DISPUTE_EFFECT_REFUND_IN_FLIGHT': return { message: 'A gateway refund is already under way for this deposit. Wait for it to finish, then try again.', refresh: true };
    case 'DISPUTE_EFFECT_REFUND_EVENT_PENDING': return { message: 'An offline refund record is awaiting confirmation. It must be confirmed, rejected or withdrawn first.', refresh: true };
    case 'DISPUTE_EFFECT_NOT_OFFLINE_RAIL': return { message: 'This deposit was paid online, so it cannot be marked as returned offline.', refresh: false };
    case 'DISPUTE_EFFECT_BLOCKED_BY_OPEN_CASE':
      return { message: 'This outcome cannot be applied while another dispute on this booking is open. Resolve or withdraw that case first, then apply this outcome.', refresh: true, linkDisputeId: link('blockingDisputeId'), linkLabel: 'Open the blocking case' };
    case 'DISPUTE_NOT_RESOLVED': return { message: 'Resolve the case before applying an outcome.', refresh: true };
    case 'DISPUTE_EFFECT_INVALID': return { message: 'This outcome cannot be applied. Contact engineering.', refresh: true };
    case 'DISPUTE_EFFECT_ALREADY_EXECUTED': return { message: 'This outcome was already applied.', refresh: true };
    default:
      break;
  }
  if (e.kind === 'forbidden') return { message: 'Your role cannot do this.', refresh: false };
  if (e.kind === 'not-found') return { message: 'Not found.', refresh: false };
  // A validation sentence (class-validator / UUID pipe) is safe, user-facing text.
  if (e.kind === 'validation' && e.message && !e.code) return { message: e.message, refresh: false };
  return { message: 'The request could not be completed.', refresh: true };
}
