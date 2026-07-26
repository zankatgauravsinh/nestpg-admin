import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { UserProfile, KycRecord, UserRole, KycStatus, UserStatus, Gender } from '@nestpg/models';
import { AuthStore } from './auth.store';

interface UserState {
  profile: UserProfile | null;
  kycRecord: KycRecord | null;
  isLoading: boolean;
}

// ─── Mock profile factory ─────────────────────────────────────────────────────

function mockProfile(role: UserRole, userId: string): UserProfile {
  const names: Record<UserRole, string> = {
    [UserRole.SUPER_ADMIN]: 'Arjun Sharma',
    [UserRole.OPS_ADMIN]: 'Priya Kapoor',
    [UserRole.OWNER]: 'Vikram Patel',
    [UserRole.PROPERTY_MANAGER]: 'Sneha Reddy',
    [UserRole.TENANT]: 'Rahul Kumar',
  };
  return {
    id: userId,
    phone: '+919000000001',
    email: `${role.toLowerCase()}@nestpg.dev`,
    role,
    status: UserStatus.ACTIVE,
    fullName: names[role] ?? 'NestPG User',
    dateOfBirth: '1990-01-01',
    gender: Gender.MALE,
    addressLine1: '123 Main Street',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560001',
    occupation: 'Software Engineer',
    emergencyContactName: 'Contact Name',
    emergencyContactPhone: '+919876543210',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const UserStore = signalStore(
  { providedIn: 'root' },

  withState<UserState>({ profile: null, kycRecord: null, isLoading: false }),

  withComputed((store) => ({
    displayName: computed(() => store.profile()?.fullName ?? store.profile()?.phone ?? 'User'),
    initials: computed(() => {
      const name = store.profile()?.fullName;
      if (!name) return '?';
      return name
        .split(' ')
        .slice(0, 2)
        .map((n) => n[0])
        .join('')
        .toUpperCase();
    }),
    isProfileComplete: computed(() => {
      const p = store.profile();
      return !!(p?.fullName && p?.city && p?.state);
    }),
    hasRole: computed(() => (roles: UserRole[]) => {
      const r = store.profile()?.role;
      return r ? roles.includes(r) : false;
    }),
  })),

  withMethods((store, auth = inject(AuthStore)) => ({

    /** Load the current user's profile. Replaces with real GET /users/me call in Phase F2. */
    async load(): Promise<void> {
      if (!auth.isAuthenticated()) return;
      patchState(store, { isLoading: true });
      await new Promise<void>((r) => setTimeout(r, 400));
      const role = auth.role();
      const userId = auth.userId();
      if (!role || !userId) {
        patchState(store, { isLoading: false });
        return;
      }
      const profile = mockProfile(role, userId);
      patchState(store, { profile, isLoading: false });
    },

    clear(): void {
      patchState(store, { profile: null, kycRecord: null });
    },
  })),
);

export type UserStoreType = InstanceType<typeof UserStore>;
