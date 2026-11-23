import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { ApiService } from '../api/api.service';
import { ApiResponse } from '../api/api.types';
import { environment } from '../../../environments/environment';

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'VOID';

/** The API's invoice projection (BK81 / BK82, `toInvoiceView`): camelCase, numeric money, calendar dates. */
export interface ApiInvoice {
  id: string;
  invoiceNumber: string;
  bookingId: string | null;
  corporateBookingId: string | null;
  customerUserId: string;
  propertyId: string | null;
  status: InvoiceStatus;
  billingUnit: string | null;
  issueDate: string | null;
  dueDate: string;
  periodStart: string | null;
  periodEnd: string | null;
  subtotalPaisa: number;
  taxPaisa: number;
  totalPaisa: number;
  paidPaisa: number;
  balancePaisa: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceDetail extends ApiInvoice {
  lines: { id: string; kind: string; description: string; quantity: number; unitPaisa: number; amountPaisa: number; taxRateBps: number }[];
  payments: { id: string; paymentId: string; amountPaisa: number; createdAt: string }[];
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
