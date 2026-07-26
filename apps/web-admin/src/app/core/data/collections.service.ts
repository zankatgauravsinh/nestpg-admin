import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { ApiService } from '../api/api.service';
import { ApiResponse } from '../api/api.types';

export interface AgingBucket { count: number; amountPaisa: number }
export interface CollectionDashboard {
  expectedCollectionPaisa: number;
  collectedTodayPaisa: number;
  collectedThisMonthPaisa: number;
  outstandingInvoices: number;
  overdueResidents: number;
  collectionEfficiencyPct: number;
  aging: Record<string, AgingBucket>;
}
export interface LedgerRow {
  id: string; invoice_number: string; customer_user_id: string; property_id: string | null;
  due_date: string; total_paisa: number | string; paid_paisa: number | string; balance_paisa: number | string;
  status: string; days_overdue: number; customer_name: string;
}
export interface RecoveryRow extends LedgerRow { reminders_sent: number }
export interface PropertyCollectionRow {
  property_id: string; property_name: string; outstanding_paisa: number | string; collected_paisa: number | string; overdue_invoices: number;
}

@Injectable({ providedIn: 'root' })
export class CollectionsApiService {
  private readonly api = inject(ApiService);

  dashboard(propertyId?: string): Observable<CollectionDashboard | null> {
    return this.api.get<CollectionDashboard>('/collections/dashboard', { propertyId }).pipe(catchError(() => of(null)));
  }
  aging(propertyId?: string): Observable<Record<string, AgingBucket>> {
    return this.api.get<Record<string, AgingBucket>>('/collections/aging', { propertyId }).pipe(catchError(() => of({})));
  }
  ledger(propertyId?: string, page = 1, limit = 20): Observable<ApiResponse<LedgerRow[]>> {
    return this.api.getPaged<LedgerRow[]>('/collections/ledger', { propertyId, page, limit }).pipe(
      catchError(() => of({ success: true, data: [], meta: { page: 1, limit, total: 0, totalPages: 0 } } as ApiResponse<LedgerRow[]>)));
  }
  recoveryQueue(propertyId?: string): Observable<RecoveryRow[]> {
    return this.api.get<RecoveryRow[]>('/collections/recovery-queue', { propertyId }).pipe(catchError(() => of([])));
  }
  propertyReport(): Observable<PropertyCollectionRow[]> {
    return this.api.get<PropertyCollectionRow[]>('/collections/reports/property').pipe(catchError(() => of([])));
  }
  timeline(userId: string): Observable<{ invoices: unknown[]; payments: unknown[]; reminders: unknown[] } | null> {
    return this.api.get<{ invoices: unknown[]; payments: unknown[]; reminders: unknown[] }>(`/collections/timeline/${userId}`).pipe(catchError(() => of(null)));
  }
  remind(invoiceId: string): Observable<{ reminderId: string; sent: boolean }> {
    return this.api.post(`/collections/${invoiceId}/remind`, {});
  }
}
