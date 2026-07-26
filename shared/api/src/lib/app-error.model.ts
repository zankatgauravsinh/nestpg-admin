export interface AppError {
  status: number;
  code: string;
  message: string;
  field?: string;
  raw?: ApiErrorItem[];
}

export interface ApiErrorItem {
  code: string;
  message: string;
  field?: string;
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value
  );
}

export const APP_ERROR_CODES = {
  NETWORK: 'NETWORK_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  CONFLICT: 'CONFLICT',
  INTERNAL: 'INTERNAL',
} as const;
