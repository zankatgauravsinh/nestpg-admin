import { Injectable, inject } from '@angular/core';
import { Observable, tap, map, switchMap, catchError, of, firstValueFrom } from 'rxjs';
import { ApiService } from '../api/api.service';
import { TokenStore } from '../api/token.store';
import { SessionStore } from './session.store';
import { CurrentUser, Role } from '../models/role.model';

export type OtpPurpose = 'REGISTRATION' | 'LOGIN' | 'PASSWORD_RESET' | 'KYC';

interface LoginPayload {
  phone: string;
  password?: string;
}
interface RegisterPayload {
  phone: string;
  email?: string;
  password?: string;
}
interface AuthResult {
  accessToken?: string;
  refreshToken?: string;
  user?: RawUser;
  [k: string]: unknown;
}
interface RawUser {
  id?: string;
  fullName?: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  organizationName?: string;
  organization?: string;
}

/** Authentication + current-user bootstrap against the NestPG backend. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly tokens = inject(TokenStore);
  private readonly session = inject(SessionStore);

  login(payload: LoginPayload): Observable<AuthResult> {
    return this.api.post<AuthResult>('/auth/login', payload).pipe(tap((r) => this.applyAuth(r)));
  }

  register(payload: RegisterPayload): Observable<AuthResult> {
    return this.api.post<AuthResult>('/auth/register', payload).pipe(tap((r) => this.applyAuth(r)));
  }

  sendOtp(phone: string, purpose: OtpPurpose = 'LOGIN'): Observable<unknown> {
    return this.api.post('/auth/send-otp', { phone, purpose });
  }

  verifyOtp(phone: string, otp: string, purpose: OtpPurpose = 'LOGIN'): Observable<AuthResult> {
    return this.api
      .post<AuthResult>('/auth/verify-otp', { phone, otp, purpose })
      .pipe(tap((r) => this.applyAuth(r)));
  }

  me(): Observable<RawUser> {
    return this.api.get<RawUser>('/users/me').pipe(tap((u) => this.session.setUser(this.mapUser(u))));
  }

  /** Exchange the httpOnly refresh cookie for a fresh access token. */
  refresh(): Observable<AuthResult> {
    return this.api.post<AuthResult>('/auth/refresh', {}).pipe(tap((r) => this.applyAuth(r)));
  }

  /**
   * App-init session restore. If we hold an access token, hydrate the real
   * backend user; if that 401s, try a silent refresh then re-hydrate. Resolves
   * (never rejects) so the app always boots — guards handle redirects.
   */
  bootstrap(): Promise<void> {
    if (!this.tokens.accessToken()) return Promise.resolve();
    return firstValueFrom(
      this.me().pipe(
        map(() => void 0),
        catchError(() =>
          this.refresh().pipe(
            switchMap(() => this.me()),
            map(() => void 0),
            catchError(() => { this.tokens.clear(); return of(void 0); }),
          ),
        ),
      ),
    );
  }

  logout(): void {
    this.api.post('/auth/logout').subscribe({ next: () => {}, error: () => {} });
    this.tokens.clear();
    this.session.clear();
  }

  private applyAuth(r: AuthResult): void {
    if (r.accessToken) this.tokens.set(r.accessToken, r.refreshToken ?? null);
    if (r.user) this.session.setUser(this.mapUser(r.user));
  }

  /** Maps a backend UserRole to the three nav personas used for gating. */
  private mapRole(role?: string): Role {
    switch (role) {
      case 'SUPER_ADMIN':
      case 'OPS_ADMIN':
      case 'FINANCE_ADMIN':
        return 'SUPER_ADMIN';
      case 'PG_OWNER':
        return 'OWNER';
      default:
        return 'MANAGER';
    }
  }

  private mapUser(u: RawUser): CurrentUser {
    const name = u.fullName || u.name || u.phone || 'User';
    const initials = name
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    return {
      id: u.id ?? '',
      name,
      email: u.email ?? u.phone ?? '',
      role: this.mapRole(u.role),
      initials: initials || 'U',
      organization: u.organizationName || u.organization || 'NestPG',
    };
  }
}
