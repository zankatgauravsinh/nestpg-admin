import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionStore } from './session.store';
import { Role } from '../models/role.model';

/**
 * Route guard: allows activation only when the active role is permitted.
 * Attach allowed roles via route data: `data: { roles: ['SUPER_ADMIN'] }`.
 */
export const roleGuard: CanActivateFn = (route) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  const roles = route.data['roles'] as Role[] | undefined;
  if (session.can(roles)) return true;
  return router.createUrlTree(['/dashboard']);
};
