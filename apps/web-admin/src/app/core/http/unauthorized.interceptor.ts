import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { TokenStore } from '../api/token.store';
import { AuthService } from '../auth/auth.service';
import { SessionStore } from '../auth/session.store';
import { environment } from '../../../environments/environment';

/** The auth endpoints themselves: their 401s are the answer, not a trigger. */
const AUTH_PATH = '/admin/auth/';

/**
 * Recovers an expired session instead of ending it.
 *
 * Access tokens live 15 minutes, so a normal working session hits 401 regularly.
 * Previously that cleared the session and bounced the admin to the login screen
 * — a forced re-login every quarter hour. Now a 401 triggers ONE shared refresh
 * (`AuthService.refreshOnce`, single-flight because refresh tokens are
 * single-use server-side) and the original request is retried with the new
 * token. Only if that rotation fails is the session ended.
 *
 * Requests to `/admin/auth/*` are excluded: a 401 from login or refresh is a
 * real verdict, and retrying it would recurse.
 */
export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const tokens = inject(TokenStore);
  const session = inject(SessionStore);
  const auth = inject(AuthService);
  const router = inject(Router);

  const isApi = req.url.startsWith(environment.apiBase);
  const isAuthCall = req.url.includes(AUTH_PATH);

  /** Re-issue the request carrying the token minted by the refresh. */
  const withFreshToken = (r: HttpRequest<unknown>) => {
    const token = tokens.accessToken();
    return token ? r.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : r;
  };

  const endSession = () => {
    tokens.clear();
    session.clear();
    const returnUrl = router.url && !router.url.startsWith('/auth') ? router.url : '/dashboard';
    void router.navigate(['/auth/login'], { queryParams: { returnUrl } });
  };

  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401 || !isApi || isAuthCall) {
        return throwError(() => err);
      }
      return auth.refreshOnce().pipe(
        switchMap(() => next(withFreshToken(req))),
        catchError(() => {
          // The rotation itself failed — the session is genuinely over.
          endSession();
          return throwError(() => err);
        }),
      );
    }),
  );
};
