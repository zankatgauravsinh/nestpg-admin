import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStore } from '../auth.store';

/**
 * Redirects unauthenticated users to /login.
 * Usage: canActivate: [authGuard]
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  // Attempt rehydrate before redirecting
  auth.rehydrate();
  if (auth.isAuthenticated()) return true;

  return router.createUrlTree(['/login']);
};
