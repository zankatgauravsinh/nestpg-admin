import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { ApiService } from '../api/api.service';
import { ApiResponse } from '../api/api.types';

export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'REFUNDED' | 'PARTIAL' | 'CANCELLED';

export interface ApiPayment {
  id: string;
  payment_number: string;
  booking_id: string | null;
  invoice_id: string | null;
  payer_user_id: string;
  property_id: string | null;
  purpose: string;
  method: string;
  status: PaymentStatus;
  amount_paisa: number | string;
  allocated_paisa: number | string;
  refunded_paisa: number | string;
  gateway: string;
  gateway_order_id: string | null;
  gateway_payment_id: string | null;
  notes: string | null;
  paid_at: string | null;
  created_at: string;
  [k: string]: unknown;
}

export interface PaymentDetail extends ApiPayment {
  allocations: { id: string; invoice_id: string | null; component: string; amount_paisa: number | string }[];
  transactions: { id: string; kind: string; gateway_ref: string | null; created_at: string }[];
  refunds: { id: string; refund_number: string; amount_paisa: number | string; reason: string | null; status: string; created_at: string }[];
}

export interface PaymentQuery { bookingId?: string; payerUserId?: string; status?: string; page?: number; limit?: number }

/** SDK for the backend Payments module. */
@Injectable({ providedIn: 'root' })
export class PaymentsService {
  private readonly api = inject(ApiService);

  list(q: PaymentQuery = {}): Observable<ApiResponse<ApiPayment[]>> {
    return this.api.getPaged<ApiPayment[]>('/payments', { ...q }).pipe(
      catchError(() => of({ success: true, data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } } as ApiResponse<ApiPayment[]>)),
    );
  }
  get(id: string): Observable<PaymentDetail | null> {
    return this.api.get<PaymentDetail>(`/payments/${id}`).pipe(catchError(() => of(null)));
  }
  record(body: {
    bookingId?: string; invoiceId?: string; payerUserId?: string; propertyId?: string;
    purpose: string; method: string; amountPaisa: number; notes?: string;
  }): Observable<PaymentDetail> {
    return this.api.post<PaymentDetail>('/payments', body);
  }
  refund(id: string, amountPaisa: number, reason?: string): Observable<PaymentDetail> {
    return this.api.post<PaymentDetail>(`/payments/${id}/refund`, { amountPaisa, reason });
  }
  createOrder(body: { bookingId?: string; invoiceId?: string; purpose: string; amountPaisa: number }): Observable<{ paymentId: string; orderId: string; key: string; amountPaisa: number }> {
    return this.api.post('/payments/razorpay/order', body);
  }
}

export const paise = (v: number | string | null | undefined) => Number(v ?? 0);
