import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { UserRole } from '@nestpg/models';
import { AuthStore } from '../auth.store';

/**
 * Checks that the authenticated user has one of the required roles.
 *
 * Usage:
 *   canActivate: [authGuard, roleGuard],
 *   data: { roles: ['SUPER_ADMIN', 'OPS_ADMIN'] }
 */
export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthStore);
  const router = inject(Router);

  const requiredRoles = (route.data['roles'] ?? []) as UserRole[];
  if (requiredRoles.length === 0) return true;

  const userRole = auth.role();
  if (userRole && requiredRoles.includes(userRole)) return true;

  return router.createUrlTree(['/unauthorized']);
};
