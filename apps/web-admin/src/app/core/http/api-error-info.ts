import { HttpErrorResponse } from '@angular/common/http';

/**
 * ADM-D.1 — structured reading of the NestPG error envelope.
 *
 * `AllExceptionsFilter` always puts the DOMAIN code in `errors[0].message`:
 *   • `new BadRequestException('CODE')`      → code = reason phrase ("Bad Request"), message = "CODE"
 *   • `new ConflictException({error, message, details})` → code = message = "CODE", plus `details`
 *   • ValidationPipe                          → code = "Bad Request", message = class-validator text
 *   • RolesGuard                              → 403, message = "Forbidden resource"
 * Some codes carry a suffix after ':' (`DISPUTE_RESOLUTION_INVALID:EFFECT_REQUIRES_UPHELD`).
 *
 * `apiErrorMessage` (core/http/api-error.ts) is left unchanged for existing screens.
 */
export type ApiErrorKind = 'network' | 'auth' | 'forbidden' | 'not-found' | 'validation' | 'conflict' | 'server' | 'unknown';

export interface ApiErrorInfo {
  kind: ApiErrorKind;
  /** HTTP status; 0 for a transport failure (outcome of a mutation is then UNKNOWN). */
  status: number;
  /** The domain code (prefix before ':'), or null when the message is prose (validation text). */
  code: string | null;
  /** The ':'-suffix of the domain code, e.g. `EFFECT_REQUIRES_UPHELD,RESOLUTION_VERSION_REQUIRED`. */
  detail: string | null;
  /** The structured `details` object, when the backend supplied one. */
  details: Record<string, unknown> | null;
  /** The backend message, safe to show only when it is a validation sentence. */
  message: string | null;
}

const DOMAIN_CODE = /^([A-Z][A-Z0-9_]{2,})(?::(.+))?$/;

export function apiErrorInfo(e: unknown): ApiErrorInfo {
  const status = e instanceof HttpErrorResponse ? e.status : ((e as { status?: number })?.status ?? -1);
  const body = (e as { error?: unknown })?.error as
    | { errors?: Array<{ code?: string; message?: string; details?: unknown }>; message?: string | string[] }
    | undefined;
  const first = body?.errors?.[0];
  const rawMessage = typeof first?.message === 'string' ? first.message
    : Array.isArray(body?.message) ? body!.message[0] : typeof body?.message === 'string' ? body.message : null;
  const m = rawMessage ? DOMAIN_CODE.exec(rawMessage.trim()) : null;
  const details = first?.details && typeof first.details === 'object' && !Array.isArray(first.details)
    ? (first.details as Record<string, unknown>) : null;
  return {
    kind: kindOf(status),
    status,
    code: m ? m[1]! : null,
    detail: m && m[2] ? m[2] : null,
    details,
    message: rawMessage,
  };
}

function kindOf(status: number): ApiErrorKind {
  if (status === 0) return 'network';
  if (status === 401) return 'auth';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 400 || status === 422) return 'validation';
  if (status === 409) return 'conflict';
  if (status >= 500) return 'server';
  return 'unknown';
}
