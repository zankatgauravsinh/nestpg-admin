import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../api/api.service';
import { ApiResponse } from '../api/api.types';

/** An Admin console account, exactly as `/admin/staff` projects it (A3). */
export interface AdminStaff {
  id: string;
  phone: string;
  email: string | null;
  role: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAdminStaffPayload {
  phone: string;
  email?: string;
  initialPassword: string;
  role: string;
}

/**
 * Admin Staff Management (A3). SUPER_ADMIN only — enforced by the backend's
 * ROLE_ADMINISTRATION capability; the UI merely avoids offering what the server
 * would refuse. Errors are propagated, never swallowed into empty lists.
 */
@Injectable({ providedIn: 'root' })
export class AdminStaffService {
  private readonly api = inject(ApiService);

  list(page = 1, limit = 20): Observable<ApiResponse<AdminStaff[]>> {
    return this.api.getPaged<AdminStaff[]>('/admin/staff', { page, limit });
  }

  create(payload: CreateAdminStaffPayload): Observable<AdminStaff> {
    return this.api.post<AdminStaff>('/admin/staff', payload);
  }

  assignRole(id: string, role: string): Observable<AdminStaff> {
    return this.api.put<AdminStaff>(`/admin/staff/${id}/role`, { role });
  }

  setStatus(id: string, status: 'ACTIVE' | 'SUSPENDED'): Observable<AdminStaff> {
    return this.api.put<AdminStaff>(`/admin/staff/${id}/status`, { status });
  }
}
