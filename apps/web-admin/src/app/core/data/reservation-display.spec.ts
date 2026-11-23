import { ApiReservation } from './bookings.service';
import { clock, holdExpiryLabel, holdState, holdStatus, reservationGuest, reservationOptionLabel, reservationPlace } from './reservation-display';

const NOW = Date.parse('2026-11-12T06:00:00.000Z');
const hold = (over: Partial<ApiReservation> = {}): ApiReservation => ({
  id: 'res-1', status: 'ACTIVE', tenantName: 'Riya Shah', tenantPhone: '9000000001', propertyName: 'Sunrise House',
  roomNumber: '101', bedNumber: 'B1', bedLabel: null, reservedFrom: '2026-11-12', reservedUntil: '2026-12-12',
  expiresAt: '2026-11-12T06:12:00.000Z', ...over,
});

describe('reservation display (D4)', () => {
  it('a live hold counts down to its 15-minute expiry, not the stay end', () => {
    const s = holdState(hold(), NOW);
    expect(s).toMatchObject({ live: true, lapsed: false, minutesLeft: 12 });
    expect(holdExpiryLabel(hold(), NOW)).toBe(`Expires ${clock(new Date('2026-11-12T06:12:00.000Z'))} · 12 min left`);
    expect(holdExpiryLabel(hold(), NOW)).not.toContain('2026-12-12');
  });

  it('a hold past its expiry reads Expired even while the database still says ACTIVE', () => {
    const r = hold({ expiresAt: '2026-11-12T05:59:00.000Z' });
    expect(holdState(r, NOW)).toMatchObject({ live: false, lapsed: true });
    expect(holdStatus(r, NOW)).toBe('EXPIRED');
    expect(holdExpiryLabel(r, NOW)).toMatch(/^Expired at /);
  });

  it('converted and cancelled holds are neither live nor lapsed', () => {
    for (const status of ['CONVERTED', 'CANCELLED', 'EXPIRED']) {
      expect(holdState(hold({ status }), NOW)).toMatchObject({ live: false, lapsed: false });
      expect(holdStatus(hold({ status }), NOW)).toBe(status);
      expect(holdExpiryLabel(hold({ status }), NOW)).toBe('');
    }
  });

  it('names the resident, falling back to the phone, never "Reservation"', () => {
    expect(reservationGuest(hold())).toBe('Riya Shah');
    expect(reservationGuest(hold({ tenantName: null }))).toBe('9000000001');
    expect(reservationGuest(hold({ tenantName: null, tenantPhone: null }))).toBe('Resident');
  });

  it('places the bed: property, room and bed (label preferred)', () => {
    expect(reservationPlace(hold())).toBe('Sunrise House · Room 101 · Bed B1');
    expect(reservationPlace(hold({ bedLabel: 'Window' }))).toBe('Sunrise House · Room 101 · Bed Window');
    expect(reservationPlace(hold({ propertyName: null, roomNumber: null, bedNumber: undefined }))).toBe('Bed details unavailable');
  });

  it('the picker line identifies the hold by resident, bed and expiry', () => {
    expect(reservationOptionLabel(hold(), NOW)).toBe(`Riya Shah · Sunrise House · Room 101 · Bed B1 · Expires ${clock(new Date('2026-11-12T06:12:00.000Z'))} · 12 min left`);
  });
});
