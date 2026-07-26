import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { ApiService } from '../api/api.service';

export interface CorporateAccount {
  id: string;
  companyName: string;
  gstin?: string | null;
  hrContactUserId: string;
  billingEmail: string;
  billingAddress?: string | null;
  creditLimitPaisa?: number;
  isActive?: boolean;
  createdAt?: string;
}

export interface CorporateAgreement {
  id: string;
  bookingNumber?: string;
  corporateAccountId: string;
  propertyId: string;
  hrUserId: string;
  totalBedsRequested: number;
  totalBedsConfirmed?: number;
  checkInDate: string;
  checkOutDate?: string | null;
  status?: string;
  poNumber?: string | null;
  createdAt?: string;
}

export interface CreateAccountPayload {
  companyName: string;
  hrContactUserId: string;
  billingEmail: string;
  gstin?: string;
  billingAddress?: string;
  creditLimitPaisa?: number;
}

export interface CreateAgreementPayload {
  corporateAccountId: string;
  propertyId: string;
  hrUserId: string;
  totalBedsRequested: number;
  checkInDate: string;
  checkOutDate?: string;
  poNumber?: string;
}

export interface AssignBedPayload {
  employeeTenantId: string;
  bedId: string;
  rentPaisa: number;
  securityDepositPaisa?: number;
  advancePaisa?: number;
}

/** SDK for the backend Corporate module (accounts + agreements). */
@Injectable({ providedIn: 'root' })
export class CorporateService {
  private readonly api = inject(ApiService);

  createAccount(dto: CreateAccountPayload): Observable<CorporateAccount> {
    return this.api.post<CorporateAccount>('/corporate/accounts', dto);
  }
  account(id: string): Observable<CorporateAccount | null> {
    return this.api.get<CorporateAccount>(`/corporate/accounts/${id}`).pipe(catchError(() => of(null)));
  }
  createAgreement(dto: CreateAgreementPayload): Observable<CorporateAgreement> {
    return this.api.post<CorporateAgreement>('/corporate/agreements', dto);
  }
  agreement(id: string): Observable<CorporateAgreement | null> {
    return this.api.get<CorporateAgreement>(`/corporate/agreements/${id}`).pipe(catchError(() => of(null)));
  }
  assignBed(agreementId: string, dto: AssignBedPayload): Observable<unknown> {
    return this.api.post(`/corporate/agreements/${agreementId}/assign-bed`, dto);
  }
  cancelAgreement(agreementId: string, reason: string): Observable<unknown> {
    return this.api.post(`/corporate/agreements/${agreementId}/cancel`, { reason });
  }
}
