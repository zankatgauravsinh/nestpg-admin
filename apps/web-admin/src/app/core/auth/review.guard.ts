import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionStore } from './session.store';

/**
 * Property-review route (A2, re-based on capabilities in A3).
 *
 * Opening the queue needs PROPERTY_REVIEW_VIEW, which since A3 includes
 * FINANCE_ADMIN — it may look at what it cannot decide. Deciding needs
 * PROPERTY_REVIEW_DECISION, checked on the controls themselves, not here.
 * Pair with `authGuard`, which owns "is anyone signed in at all".
 */
export const reviewGuard: CanActivateFn = () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  if (session.hasCapability('PROPERTY_REVIEW_VIEW')) return true;
  return router.createUrlTree(['/dashboard']);
};
