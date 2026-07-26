import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TokenStore } from '../api/token.store';
import { environment } from '../../../environments/environment';

/** Attaches the bearer token to all same-origin API requests. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(TokenStore).accessToken();
  if (token && req.url.startsWith(environment.apiBase)) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }
  return next(req);
};
