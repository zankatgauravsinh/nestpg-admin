import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { API_CONFIG } from '../api.config';

/** Injects the Bearer access token into every API request. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Only attach token to requests going to our API
  const config = inject(API_CONFIG);
  if (!req.url.startsWith(config.baseUrl)) {
    return next(req);
  }

  const token = localStorage.getItem('nestpg_access_token');
  if (!token) return next(req);

  return next(
    req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }),
  );
};
