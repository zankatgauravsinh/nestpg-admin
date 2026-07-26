import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { ApiService } from '../api/api.service';
import { ApiResponse } from '../api/api.types';
import { environment } from '../../../environments/environment';

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'VOID';

export interface ApiInvoice {
  id: string;
  invoice_number: string;
  booking_id: string | null;
  customer_user_id: string;
  property_id: string | null;
  status: InvoiceStatus;
  issue_date: string | null;
  due_date: string;
  subtotal_paisa: number | string;
  tax_paisa: number | string;
  total_paisa: number | string;
  paid_paisa: number | string;
  balance_paisa: number | string;
  notes: string | null;
  created_at: string;
  [k: string]: unknown;
}

export interface InvoiceDetail extends ApiInvoice {
  lines: { id: string; kind: string; description: string; quantity: number; unit_paisa: number | string; amount_paisa: number | string; tax_rate_bps: number }[];
  payments: { id: string; payment_id: string; amount_paisa: number | string; created_at: string }[];
}

export interface InvoiceLineInput { kind: string; description: string; quantity?: number; unitPaisa: number; taxRateBps?: number }
export interface InvoiceQuery { customerUserId?: string; propertyId?: string; status?: string; page?: number; limit?: number }

@Injectable({ providedIn: 'root' })
export class InvoicesService {
  private readonly api = inject(ApiService);

  list(q: InvoiceQuery = {}): Observable<ApiResponse<ApiInvoice[]>> {
    return this.api.getPaged<ApiInvoice[]>('/invoices', { ...q }).pipe(
      catchError(() => of({ success: true, data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } } as ApiResponse<ApiInvoice[]>)),
    );
  }
  get(id: string): Observable<InvoiceDetail | null> {
    return this.api.get<InvoiceDetail>(`/invoices/${id}`).pipe(catchError(() => of(null)));
  }
  create(body: { bookingId?: string; customerUserId: string; propertyId?: string; dueDate: string; notes?: string; lines: InvoiceLineInput[] }): Observable<InvoiceDetail> {
    return this.api.post<InvoiceDetail>('/invoices', body);
  }
  issue(id: string): Observable<InvoiceDetail> { return this.api.post<InvoiceDetail>(`/invoices/${id}/issue`, {}); }
  void(id: string): Observable<InvoiceDetail> { return this.api.post<InvoiceDetail>(`/invoices/${id}/void`, {}); }
  /** Absolute URL for the invoice PDF (served with bearer via the auth interceptor on /api). */
  pdfUrl(id: string): string { return `${environment.apiBase}/invoices/${id}/pdf`; }
}
