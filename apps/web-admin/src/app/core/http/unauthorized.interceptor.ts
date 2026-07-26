import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { TokenStore } from '../api/token.store';
import { environment } from '../../../environments/environment';

/**
 * On a 401 from an API call (expired/invalid token), clears the session and
 * redirects to login with a returnUrl — except for the auth endpoints
 * themselves (whose 401s are handled inline by the auth screens).
 */
export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const tokens = inject(TokenStore);
  const router = inject(Router);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (
        err instanceof HttpErrorResponse &&
        err.status === 401 &&
        req.url.startsWith(environment.apiBase) &&
        !req.url.includes('/auth/')
      ) {
        tokens.clear();
        const returnUrl = router.url && !router.url.startsWith('/auth') ? router.url : '/dashboard';
        router.navigate(['/auth/login'], { queryParams: { returnUrl } });
      }
      return throwError(() => err);
    }),
  );
};
