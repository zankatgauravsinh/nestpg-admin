import { Injectable, computed, signal } from '@angular/core';
import { CurrentUser, Role } from '../models/role.model';
import { Capability } from '../models/capability.model';

/**
 * The authenticated admin, and the role gating derives from it.
 *
 * It used to hold a MOCK persona: it initialised to a fabricated SUPER_ADMIN and
 * `clear()` set a MANAGER, so `isAuthenticated` was permanently true and every
 * role check passed for anyone. Authorization was never actually at risk — the
 * backend is the real gate — but the UI showed controls the signed-in admin may
 * not be entitled to, and "logged out" still had a persona.
 *
 * It is now **null until the real session says otherwise**: `setUser` is fed by
 * `/admin/auth/login` and by `GET /users/me` on restore, and `clear()` returns
 * it to null. A capability check before a session exists answers false, which
 * is the honest answer (A3).
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly _user = signal<CurrentUser | null>(null);

  readonly user = this._user.asReadonly();
  /** The signed-in admin's role, or null when there is no session. */
  readonly role = computed<Role | null>(() => this._user()?.role ?? null);
  readonly isAuthenticated = computed(() => this._user() !== null);
  /** The backend's own role string, or null when signed out. */
  readonly backendRole = computed<string | null>(() => this._user()?.backendRole ?? null);

  /**
   * The capabilities this session holds, as served by the backend (A3).
   *
   * The client does not own a role→capability table: `GET /users/me` returns
   * the canonical list, so the UI and the API can never disagree about what a
   * role means. No session, or a role the backend grants nothing, ⇒ `[]`.
   */
  readonly capabilities = computed<readonly Capability[]>(() => this._user()?.capabilities ?? []);

  /**
   * Capability check — the single authorization question the UI asks.
   *
   * This replaced the persona checks scattered through components
   * (`role() === 'SUPER_ADMIN'`, `can(['SUPER_ADMIN','OWNER'])`), which were
   * lossy: three backend admin roles share one persona, so a FINANCE_ADMIN was
   * shown Approve, notification-template and gate controls that the server
   * answers 403 to. Presentation only — the backend remains the boundary.
   */
  hasCapability(capability: Capability): boolean {
    return this.capabilities().includes(capability);
  }

  /** True when the session holds every capability listed. */
  hasAll(capabilities: readonly Capability[]): boolean {
    return capabilities.every((c) => this.hasCapability(c));
  }

  /** Set the authenticated user returned by the backend. */
  setUser(user: CurrentUser): void {
    this._user.set(user);
  }

  clear(): void {
    this._user.set(null);
  }

}
