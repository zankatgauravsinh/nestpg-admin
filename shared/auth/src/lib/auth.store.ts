import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { UserRole, UserStatus } from '@nestpg/models';
import { TokenService } from './token.service';

// ─── State shape ─────────────────────────────────────────────────────────────

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  role: UserRole | null;
  userId: string | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: AuthState = {
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  role: null,
  userId: null,
  isLoading: false,
  error: null,
};

// ─── Mock credentials ─────────────────────────────────────────────────────────
// In Phase F2 this will be replaced with real API calls via AuthService.
// For now any phone+password combination succeeds; role is determined by phone prefix.

function mockLogin(phone: string): { role: UserRole; userId: string } {
  // Dev convention: use these test numbers per role
  const map: Record<string, UserRole> = {
    '9000000001': UserRole.SUPER_ADMIN,
    '9000000002': UserRole.OPS_ADMIN,
    '9000000003': UserRole.OWNER,
    '9000000004': UserRole.PROPERTY_MANAGER,
    '9000000005': UserRole.TENANT,
  };
  const digits = phone.replace(/\D/g, '').slice(-10);
  const role = map[digits] ?? UserRole.SUPER_ADMIN;
  return { role, userId: `mock-${digits}` };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const AuthStore = signalStore(
  { providedIn: 'root' },

  withState<AuthState>(initialState),

  withComputed((store) => ({
    isAuthenticated: computed(
      () => !!store.accessToken() && !!store.expiresAt() && Date.now() < (store.expiresAt() ?? 0),
    ),
    isAdmin: computed(
      () => store.role() === UserRole.SUPER_ADMIN || store.role() === UserRole.OPS_ADMIN,
    ),
  })),

  withMethods((store, tokens = inject(TokenService)) => ({

    /** Rehydrate from localStorage on app init */
    rehydrate(): void {
      if (!tokens.hasTokens() || tokens.isExpired()) {
        tokens.clear();
        return;
      }
      // In real impl, decode JWT to get role/userId. For mock, read from localStorage.
      const role = localStorage.getItem('nestpg_role') as UserRole | null;
      const userId = localStorage.getItem('nestpg_user_id');
      patchState(store, {
        accessToken:  tokens.getAccessToken(),
        refreshToken: tokens.getRefreshToken(),
        expiresAt:    tokens.getExpiresAt(),
        role,
        userId,
      });
    },

    /** Mock login — replace with real API call in Phase F2 */
    async login(phone: string, _password: string): Promise<void> {
      patchState(store, { isLoading: true, error: null });
      // Simulate network latency
      await new Promise<void>((r) => setTimeout(r, 800));
      try {
        const { role, userId } = mockLogin(phone);
        const expiresAt = Date.now() + 15 * 60 * 1000; // 15 min
        const mockTokens = {
          accessToken:  `mock.access.${userId}`,
          refreshToken: `mock.refresh.${userId}`,
          expiresAt,
        };
        tokens.save(mockTokens);
        localStorage.setItem('nestpg_role', role);
        localStorage.setItem('nestpg_user_id', userId);
        patchState(store, { ...mockTokens, role, userId, isLoading: false });
      } catch {
        patchState(store, { isLoading: false, error: 'Login failed. Please try again.' });
      }
    },

    logout(): void {
      tokens.clear();
      localStorage.removeItem('nestpg_role');
      localStorage.removeItem('nestpg_user_id');
      patchState(store, { ...initialState });
    },

    clearError(): void {
      patchState(store, { error: null });
    },
  })),
);

export type AuthStoreType = InstanceType<typeof AuthStore>;
