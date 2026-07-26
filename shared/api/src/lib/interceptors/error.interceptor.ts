import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { AppError, ApiErrorItem, APP_ERROR_CODES } from '../app-error.model';

/** Normalizes all HTTP errors into a typed AppError before re-throwing. */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse)) {
        const appError: AppError = {
          status: 0,
          code: APP_ERROR_CODES.NETWORK,
          message: 'Network error — check your connection.',
        };
        return throwError(() => appError);
      }

      const body = err.error as { success?: boolean; errors?: ApiErrorItem[] } | null;
      const firstError = body?.errors?.[0];

      const appError: AppError = {
        status: err.status,
        code: firstError?.code ?? httpStatusToCode(err.status),
        message: firstError?.message ?? err.message ?? 'An unexpected error occurred.',
        field: firstError?.field,
        raw: body?.errors,
      };

      return throwError(() => appError);
    }),
  );
};

function httpStatusToCode(status: number): string {
  switch (status) {
    case 400: return APP_ERROR_CODES.VALIDATION_FAILED;
    case 401: return APP_ERROR_CODES.UNAUTHORIZED;
    case 403: return APP_ERROR_CODES.FORBIDDEN;
    case 404: return APP_ERROR_CODES.NOT_FOUND;
    case 409: return APP_ERROR_CODES.CONFLICT;
    case 500: return APP_ERROR_CODES.INTERNAL;
    default:  return APP_ERROR_CODES.UNKNOWN;
  }
}
