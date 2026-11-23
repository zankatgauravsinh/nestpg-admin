import { ApiReservation } from './bookings.service';

/**
 * D4 — how Ops reads a bed hold. A hold lasts 15 minutes (`expiresAt`); the
 * dates the resident asked for (`reservedFrom` → `reservedUntil`) are the stay,
 * not the hold. The list used to show the stay end as "Reserved until" and no
 * resident or bed, so holds could not be told apart or seen to lapse.
 */
export interface HoldState {
  /** ACTIVE and not yet past its expiry: the only holds that can be confirmed. */
  live: boolean;
  /** Still ACTIVE in the database but past its expiry (the sweep has not run yet). */
  lapsed: boolean;
  expiresAt: Date | null;
  minutesLeft: number | null;
}

export function holdState(r: ApiReservation, now: number = Date.now()): HoldState {
  const active = (r.status ?? 'ACTIVE').toUpperCase() === 'ACTIVE';
  const expiresAt = r.expiresAt ? new Date(r.expiresAt) : null;
  if (!active || !expiresAt || Number.isNaN(expiresAt.getTime())) return { live: false, lapsed: false, expiresAt, minutesLeft: null };
  const ms = expiresAt.getTime() - now;
  return ms > 0
    ? { live: true, lapsed: false, expiresAt, minutesLeft: Math.ceil(ms / 60_000) }
    : { live: false, lapsed: true, expiresAt, minutesLeft: 0 };
}

/** The status to show: a lapsed hold reads Expired even before the sweep marks it. */
export function holdStatus(r: ApiReservation, now: number = Date.now()): string {
  return holdState(r, now).lapsed ? 'EXPIRED' : (r.status ?? 'ACTIVE');
}

export function reservationGuest(r: ApiReservation): string {
  return r.tenantName || r.tenantPhone || 'Resident';
}

export function reservationPlace(r: ApiReservation): string {
  const bed = r.bedLabel || r.bedNumber;
  const parts = [r.propertyName, r.roomNumber ? `Room ${r.roomNumber}` : null, bed ? `Bed ${bed}` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Bed details unavailable';
}

export function clock(d: Date): string {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** "Expires 11:28 · 12 min left" | "Expired at 11:28" | "" for holds that ended another way. */
export function holdExpiryLabel(r: ApiReservation, now: number = Date.now()): string {
  const h = holdState(r, now);
  if (h.live && h.expiresAt) return `Expires ${clock(h.expiresAt)} · ${h.minutesLeft} min left`;
  if (h.lapsed && h.expiresAt) return `Expired at ${clock(h.expiresAt)}`;
  return '';
}

/** One line that identifies a live hold in the New booking picker. */
export function reservationOptionLabel(r: ApiReservation, now: number = Date.now()): string {
  return `${reservationGuest(r)} · ${reservationPlace(r)} · ${holdExpiryLabel(r, now)}`;
}
