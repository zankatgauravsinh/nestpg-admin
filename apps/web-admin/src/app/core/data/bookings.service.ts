import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { ApiService } from '../api/api.service';

export interface ApiBooking {
  id: string;
  bookingNumber?: string;
  tenantName?: string | null;
  residentName?: string;
  guestName?: string;
  userName?: string;
  tenantId?: string;
  bedLabel?: string | null;
  bedNumber?: string;
  bedId?: string;
  roomNumber?: string | null;
  roomType?: string | null;
  floorNumber?: number | null;
  propertyName?: string | null;
  propertyId?: string;
  status?: string;
  checkInDate?: string;
  checkIn?: string;
  checkOutDate?: string | null;
  amountPaise?: number;
  rentPaisa?: number;
  totalPaidPaisa?: number;
  advancePaisa?: number;
  securityDepositPaisa?: number;
  paymentMode?: string;
  bookingDate?: string;
  createdAt?: string;
  [k: string]: unknown;
}

export type PaymentStatus = 'PAID' | 'PARTIAL' | 'DUE' | 'OVERDUE';

export interface DerivedPayment {
  id: string;
  tenantName: string;
  unit: string;
  duePaisa: number;
  paidPaisa: number;
  balancePaisa: number;
  status: PaymentStatus;
  method: string;
  dueDate: string;
  daysOverdue: number;
}

/** Derives a payment/dues record from a booking's rent vs paid amounts. */
export function paymentFromBooking(b: ApiBooking, today = new Date()): DerivedPayment {
  const due = b.rentPaisa ?? 0;
  const paid = b.totalPaidPaisa ?? 0;
  const balance = Math.max(0, due - paid);
  const dueDate = b.checkInDate ?? b.checkIn ?? '';
  const days = dueDate ? Math.floor((today.getTime() - new Date(dueDate).getTime()) / 86400000) : 0;
  let status: PaymentStatus;
  if (balance <= 0 && due > 0) status = 'PAID';
  else if (paid > 0) status = 'PARTIAL';
  else if (days > 0) status = 'OVERDUE';
  else status = 'DUE';
  return {
    id: b.id,
    tenantName: b.tenantName || b.residentName || b.bookingNumber || 'Guest',
    unit: b.roomNumber ? `${b.roomNumber}${b.bedLabel ? '-' + b.bedLabel : ''}` : (b.bedLabel ?? '—'),
    duePaisa: due,
    paidPaisa: paid,
    balancePaisa: balance,
    status,
    method: b.paymentMode ?? '—',
    dueDate,
    daysOverdue: status === 'OVERDUE' || (status === 'PARTIAL' && days > 0) ? days : 0,
  };
}
/** `GET /reservations` row: the hold plus the names it is read by (D4). */
export interface ApiReservation extends ApiBooking {
  tenantPhone?: string | null;
  bedNumber?: string;
  reservedFrom?: string;
  reservedUntil?: string;
  /** End of the 15-minute hold. */
  expiresAt?: string;
  convertedToBookingId?: string | null;
}
export interface ApiWaitlistEntry {
  id: string;
  name?: string;
  tenantId?: string;
  propertyId?: string;
  propertyName?: string;
  roomType?: string;
  genderPreference?: string;
  maxPricePaisa?: number;
  preferredMoveIn?: string;
  status?: string;
  createdAt?: string;
  [k: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class BookingsService {
  private readonly api = inject(ApiService);

  bookings(params?: Record<string, string | number>): Observable<ApiBooking[]> {
    return this.api.get<ApiBooking[]>('/bookings', params).pipe(catchError(() => of([])));
  }
  reservations(): Observable<ApiReservation[]> {
    return this.api.get<ApiReservation[]>('/reservations').pipe(catchError(() => of([])));
  }
  waitlist(): Observable<ApiWaitlistEntry[]> {
    return this.api.get<ApiWaitlistEntry[]>('/waitlist').pipe(catchError(() => of([])));
  }
  checkIn(id: string): Observable<unknown> { return this.api.post(`/bookings/${id}/check-in`, {}); }
  checkOut(id: string): Observable<unknown> { return this.api.post(`/bookings/${id}/check-out`, {}); }
  giveNotice(id: string, body: unknown): Observable<unknown> { return this.api.post(`/bookings/${id}/notice`, body); }
  cancel(id: string, body: unknown): Observable<unknown> { return this.api.post(`/bookings/${id}/cancel`, body); }
  noShow(id: string, body: unknown): Observable<unknown> { return this.api.post(`/bookings/${id}/no-show`, body); }
  removeWaitlist(id: string): Observable<unknown> { return this.api.delete(`/waitlist/${id}`); }
  joinWaitlist(dto: JoinWaitlistPayload): Observable<unknown> { return this.api.post('/waitlist', dto); }
  createReservation(dto: { bedId: string; reservedFrom: string }): Observable<unknown> { return this.api.post('/reservations', dto); }
  cancelReservation(id: string): Observable<unknown> { return this.api.post(`/reservations/${id}/cancel`, {}); }
  createBooking(dto: { reservationId: string; rentPaisa: number; paymentMode?: string }): Observable<unknown> { return this.api.post('/bookings', dto); }
}

export interface JoinWaitlistPayload {
  propertyId: string;
  roomType?: string;
  genderPreference?: string;
  maxPricePaisa?: number;
  preferredMoveIn?: string;
}
