import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionStore } from './session.store';
import { Capability } from '../models/capability.model';

/**
 * A3 — the capability route guard.
 *
 * Attach required capabilities via route data: `data: { capabilities: [...] }`.
 * A route with none is open to any authenticated session (`authGuard` still
 * owns "is anyone signed in"). This replaces `roleGuard`'s persona check on
 * every route that represents a real backend capability, so the UI and the API
 * answer the same question — the server remains authoritative either way.
 */
export const capabilityGuard: CanActivateFn = (route) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  const required = (route.data['capabilities'] ?? []) as Capability[];
  if (session.hasAll(required)) return true;
  return router.createUrlTree(['/dashboard']);
};
