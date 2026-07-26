import { Injectable } from '@angular/core';
import { AuthTokens } from '@nestpg/models';

const KEYS = {
  ACCESS:  'nestpg_access_token',
  REFRESH: 'nestpg_refresh_token',
  EXPIRES: 'nestpg_token_expires',
} as const;

@Injectable({ providedIn: 'root' })
export class TokenService {
  save(tokens: AuthTokens): void {
    localStorage.setItem(KEYS.ACCESS,  tokens.accessToken);
    localStorage.setItem(KEYS.REFRESH, tokens.refreshToken);
    localStorage.setItem(KEYS.EXPIRES, tokens.expiresAt.toString());
  }

  getAccessToken(): string | null {
    return localStorage.getItem(KEYS.ACCESS);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(KEYS.REFRESH);
  }

  getExpiresAt(): number | null {
    const val = localStorage.getItem(KEYS.EXPIRES);
    return val ? parseInt(val, 10) : null;
  }

  isExpired(): boolean {
    const exp = this.getExpiresAt();
    if (!exp) return true;
    return Date.now() >= exp - 30_000; // 30 s buffer
  }

  clear(): void {
    localStorage.removeItem(KEYS.ACCESS);
    localStorage.removeItem(KEYS.REFRESH);
    localStorage.removeItem(KEYS.EXPIRES);
  }

  hasTokens(): boolean {
    return !!this.getAccessToken() && !!this.getRefreshToken();
  }
}
