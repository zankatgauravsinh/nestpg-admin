import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../api/api.service';
import { ApiResponse } from '../api/api.types';

/** A property owner as `/admin/owners` projects it (A4). */
export interface AdminOwner {
  id: string;
  phone: string;
  email: string | null;
  status: string;
  phoneVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  onboarding: { phoneVerified: boolean; hasPassword: boolean; loginable: boolean };
  properties: { total: number; draft: number; pendingReview: number; active: number };
}

export interface CreateOwnerPayload { phone: string; email?: string }

/** The create response carries the OTP-sent message alongside the new owner. */
export interface CreateOwnerResult { message: string; owner: AdminOwner }

/**
 * Property Owner administration (A4). SUPER_ADMIN only — enforced by the
 * backend's OWNER_ADMINISTRATION capability. Errors propagate so the UI can
 * tell "could not load" from "no owners".
 */
@Injectable({ providedIn: 'root' })
export class AdminOwnersService {
  private readonly api = inject(ApiService);

  list(page = 1, limit = 20): Observable<ApiResponse<AdminOwner[]>> {
    return this.api.getPaged<AdminOwner[]>('/admin/owners', { page, limit });
  }

  get(id: string): Observable<AdminOwner> {
    return this.api.get<AdminOwner>(`/admin/owners/${id}`);
  }

  /** No password is sent or returned: the owner completes OTP onboarding. */
  create(payload: CreateOwnerPayload): Observable<CreateOwnerResult> {
    return this.api.post<CreateOwnerResult>('/admin/owners', payload);
  }

  setStatus(id: string, status: 'ACTIVE' | 'SUSPENDED'): Observable<AdminOwner> {
    return this.api.put<AdminOwner>(`/admin/owners/${id}/status`, { status });
  }
}
