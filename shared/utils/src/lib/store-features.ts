import { computed, signal } from '@angular/core';
import { signalStoreFeature, withComputed, withMethods, withState } from '@ngrx/signals';

// ─── withLoading ─────────────────────────────────────────────────────────────

export function withLoading() {
  return signalStoreFeature(
    withState({ isLoading: false, error: null as string | null }),
    withMethods((store) => ({
      setLoading(loading: boolean): void {
        (store as any)._setLoading(loading);
      },
      setError(err: string | null): void {
        (store as any)._setError(err);
      },
    })),
  );
}

// ─── withPagination ──────────────────────────────────────────────────────────

export interface PaginationState {
  page: number;
  limit: number;
  total: number;
}

export function withPagination(defaults: Partial<PaginationState> = {}) {
  return signalStoreFeature(
    withState<PaginationState>({ page: 1, limit: 20, total: 0, ...defaults }),
    withComputed((store) => ({
      totalPages: computed(() => Math.ceil(store.total() / store.limit())),
      hasPrevPage: computed(() => store.page() > 1),
      hasNextPage: computed(() => store.page() < Math.ceil(store.total() / store.limit())),
    })),
  );
}
