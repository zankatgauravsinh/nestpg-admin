import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { ApiService } from '../api/api.service';
import { ApiResponse } from '../api/api.types';

export type VisitorStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED';

export interface ApiVisitor {
  id: string; host_user_id: string; property_id: string; name: string; phone: string;
  purpose: string | null; vehicle_no: string | null; expected_at: string | null;
  status: VisitorStatus; approved_by: string | null; checked_in_at: string | null; checked_out_at: string | null;
  created_at: string;
}
export interface VisitorPass {
  visitor: ApiVisitor;
  pass: { id: string; passCode: string; validFrom: string; validUntil: string; status: string };
  qr: string;
}
export interface VisitorLog { id: string; action: string; gate: string | null; actor_user_id: string | null; note: string | null; created_at: string }
export interface VisitorValidation { valid: boolean; reason: string | null; visitor?: { id: string; name: string; phone: string; status: string; propertyId: string } }
export interface VisitorQuery { propertyId?: string; status?: string; search?: string; page?: number; limit?: number }

@Injectable({ providedIn: 'root' })
export class VisitorsService {
  private readonly api = inject(ApiService);

  list(q: VisitorQuery = {}): Observable<ApiResponse<ApiVisitor[]>> {
    return this.api.getPaged<ApiVisitor[]>('/visitors', { ...q }).pipe(
      catchError(() => of({ success: true, data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } } as ApiResponse<ApiVisitor[]>)));
  }
  get(id: string): Observable<ApiVisitor | null> { return this.api.get<ApiVisitor>(`/visitors/${id}`).pipe(catchError(() => of(null))); }
  create(body: { propertyId: string; name: string; phone: string; purpose?: string; vehicleNo?: string; expectedAt?: string; validHours?: number }): Observable<ApiVisitor> {
    return this.api.post<ApiVisitor>('/visitors', body);
  }
  pass(id: string): Observable<VisitorPass | null> { return this.api.get<VisitorPass>(`/visitors/${id}/pass`).pipe(catchError(() => of(null))); }
  logs(id: string): Observable<VisitorLog[]> { return this.api.get<VisitorLog[]>(`/visitors/${id}/logs`).pipe(catchError(() => of([]))); }
  validate(passCode: string, gate?: string): Observable<VisitorValidation> { return this.api.post<VisitorValidation>('/visitors/validate', { passCode, gate }); }
  approve(id: string): Observable<ApiVisitor> { return this.api.post<ApiVisitor>(`/visitors/${id}/approve`, {}); }
  reject(id: string, reason?: string): Observable<ApiVisitor> { return this.api.post<ApiVisitor>(`/visitors/${id}/reject`, { reason }); }
  cancel(id: string): Observable<ApiVisitor> { return this.api.post<ApiVisitor>(`/visitors/${id}/cancel`, {}); }
  checkIn(id: string, gate?: string): Observable<ApiVisitor> { return this.api.post<ApiVisitor>(`/visitors/${id}/check-in`, { gate }); }
  checkOut(id: string, gate?: string): Observable<ApiVisitor> { return this.api.post<ApiVisitor>(`/visitors/${id}/check-out`, { gate }); }
}
