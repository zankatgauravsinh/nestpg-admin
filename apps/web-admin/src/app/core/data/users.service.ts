import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { ApiService } from '../api/api.service';

export interface ApiUserProfile {
  fullName?: string;
  gender?: string;
  city?: string;
  occupation?: string;
}

export interface ApiUser {
  id: string;
  fullName?: string;
  name?: string;
  phone?: string;
  email?: string;
  role?: string;
  status?: string;
  kycStatus?: string;
  createdAt?: string;
  /** Resident avatar (derived public URL) + key, attached by the backend. */
  avatarUrl?: string | null;
  avatarKey?: string | null;
  /** Joined extended profile from the backend (holds the display name). */
  profile?: ApiUserProfile | null;
  [k: string]: unknown;
}

/** Best display name for a user: profile full name → legacy fields → phone. */
export function userDisplayName(u: ApiUser): string {
  return u.profile?.fullName || u.fullName || u.name || u.phone || 'Resident';
}

export interface KycRecord {
  status?: string;
  aadhaarName?: string | null;
  aadhaarFrontUrl?: string | null;
  aadhaarBackUrl?: string | null;
  panName?: string | null;
  panUrl?: string | null;
  selfieUrl?: string | null;
  livenessScore?: string | number | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  [k: string]: unknown;
}

/** A KYC document row (private storage — `s3Key`, never a URL). */
export interface KycDocument {
  id: string;
  docType: string;
  s3Key: string;
  status: string;
  submissionNo: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly api = inject(ApiService);

  list(params?: Record<string, string | number>): Observable<ApiUser[]> {
    return this.api.get<ApiUser[]>('/users', params).pipe(catchError(() => of([])));
  }
  get(id: string): Observable<ApiUser | null> {
    return this.api.get<ApiUser>(`/users/${id}`).pipe(catchError(() => of(null)));
  }
  setRole(id: string, role: string): Observable<unknown> {
    return this.api.put(`/users/${id}/role`, { role });
  }
  setStatus(id: string, status: string): Observable<unknown> {
    return this.api.put(`/users/${id}/status`, { status });
  }
  kyc(userId: string): Observable<KycRecord | null> {
    return this.api.get<KycRecord>(`/kyc/${userId}`).pipe(catchError(() => of(null)));
  }
  /** Private KYC document metadata (keys only) — view via presign-get. */
  kycDocuments(userId: string): Observable<KycDocument[]> {
    return this.api.get<KycDocument[]>(`/kyc/${userId}/documents`).pipe(catchError(() => of([])));
  }
  /** decision is APPROVED | REJECTED; reason is required when REJECTED. */
  reviewKyc(userId: string, decision: 'APPROVED' | 'REJECTED', reason?: string): Observable<unknown> {
    return this.api.post(`/kyc/${userId}/review`, { decision, reason });
  }
}
