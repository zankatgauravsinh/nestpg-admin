import { Injectable, computed, signal } from '@angular/core';
import { CurrentUser, Role } from '../models/role.model';

const MOCK_USERS: Record<Role, CurrentUser> = {
  SUPER_ADMIN: {
    id: 'u-sa',
    name: 'Aarav Mehta',
    email: 'aarav@nestpg.io',
    role: 'SUPER_ADMIN',
    initials: 'AM',
    organization: 'NestPG Platform',
  },
  OWNER: {
    id: 'u-ow',
    name: 'Priya Sharma',
    email: 'priya@sunrise.co',
    role: 'OWNER',
    initials: 'PS',
    organization: 'Sunrise Living Group',
  },
  MANAGER: {
    id: 'u-mg',
    name: 'Rohan Verma',
    email: 'rohan@sunrise.co',
    role: 'MANAGER',
    initials: 'RV',
    organization: 'Sunrise Residency',
  },
};

/**
 * Session store. In this foundation it holds the active mock user and exposes
 * a signal-based role used for role gating across nav, routes and widgets.
 * Swapping the role lets you preview the entire platform per persona.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly _user = signal<CurrentUser>(MOCK_USERS.SUPER_ADMIN);

  readonly user = this._user.asReadonly();
  readonly role = computed<Role>(() => this._user().role);
  readonly isAuthenticated = computed(() => !!this._user());

  /** Switch the active persona (foundation/demo helper). */
  setRole(role: Role): void {
    this._user.set(MOCK_USERS[role]);
  }

  /** Set the authenticated user returned by the backend. */
  setUser(user: CurrentUser): void {
    this._user.set(user);
  }

  clear(): void {
    this._user.set(MOCK_USERS.MANAGER);
  }

  can(roles?: Role[]): boolean {
    if (!roles || roles.length === 0) return true;
    return roles.includes(this.role());
  }
}
