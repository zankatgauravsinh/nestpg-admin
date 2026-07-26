import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TokenStore } from '../api/token.store';

/**
 * Blocks the app shell when there is no access token, redirecting to the login
 * screen with a `returnUrl` so the user lands back where they intended.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const tokens = inject(TokenStore);
  const router = inject(Router);
  if (tokens.accessToken()) return true;
  return router.createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
};
