import { Injectable, inject } from '@angular/core';
import { Observable, tap, map, switchMap, catchError, of, finalize, shareReplay, firstValueFrom } from 'rxjs';
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
  capabilities?: string[];
  fullName?: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  organizationName?: string;
  organization?: string;
}

/**
 * Auth calls are credentialed so the browser will store (login) and send
 * (refresh / logout) the httpOnly refresh cookie. Data requests are not, so the
 * cookie is never attached to ordinary API traffic. The backend allow-lists this
 * origin with `credentials: true`.
 */
const CREDENTIALED = { withCredentials: true } as const;

/** Authentication + current-user bootstrap against the NestPG backend. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  /** The rotation currently in flight, shared by every waiting 401. */
  private refreshInFlight: Observable<AuthResult> | null = null;
  private readonly tokens = inject(TokenStore);
  private readonly session = inject(SessionStore);

  /**
   * Admin login, then a `/users/me` hydration.
   *
   * The login response identifies the user but carries no capability list, and
   * A3 makes the server the only source of that list — so the session is not
   * usable for authorization until `me()` has answered. Chaining it here keeps
   * every caller (login page, tests) on one code path, and a failed hydration
   * fails closed: the tokens are set, the capabilities are empty, and the UI
   * offers nothing.
   */
  login(payload: LoginPayload): Observable<AuthResult> {
    return this.api.post<AuthResult>('/admin/auth/login', payload, CREDENTIALED).pipe(
      tap((r) => this.applyAuth(r)),
      switchMap((r) => this.me().pipe(map(() => r), catchError(() => of(r)))),
    );
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
    return this.api.post<AuthResult>('/admin/auth/refresh', {}, CREDENTIALED).pipe(tap((r) => this.applyAuth(r)));
  }

  /**
   * App-init session restore. If we hold an access token, hydrate the real
   * backend user; if that 401s, try a silent refresh then re-hydrate. Resolves
   * (never rejects) so the app always boots — guards handle redirects.
   */
  /**
   * Single-flight refresh.
   *
   * A 15-minute access token typically expires while several requests are in
   * the air, and each of their 401s would otherwise start its own rotation.
   * Refresh tokens are SINGLE-USE on the server, so the first rotation would
   * invalidate the token the others are still presenting and the session would
   * die on a race it created itself. One shared attempt is therefore not an
   * optimisation — it is what makes concurrent 401s survivable.
   *
   * `refCount: false` keeps the result replayable for latecomers; `finalize`
   * clears the slot so the NEXT expiry starts a fresh rotation.
   */
  refreshOnce(): Observable<AuthResult> {
    this.refreshInFlight ??= this.refresh().pipe(
      finalize(() => { this.refreshInFlight = null; }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.refreshInFlight;
  }

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
    this.api.post('/admin/auth/logout', {}, CREDENTIALED).subscribe({ next: () => {}, error: () => {} });
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
      backendRole: u.role ?? '',
      // Served by GET /users/me (A3). A login response carries no capability
      // list, so a session hydrated from login alone holds none until `me()`
      // resolves — failing closed until the server has spoken.
      capabilities: (u.capabilities ?? []) as CurrentUser['capabilities'],
      initials: initials || 'U',
      organization: u.organizationName || u.organization || 'NestPG',
    };
  }
}
