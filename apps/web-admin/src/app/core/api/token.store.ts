import { Injectable, signal } from '@angular/core';

const ACCESS = 'nestpg.access';
const REFRESH = 'nestpg.refresh';

/** Holds auth tokens (signal + localStorage). */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  readonly accessToken = signal<string | null>(this.read(ACCESS));
  readonly refreshToken = signal<string | null>(this.read(REFRESH));

  set(access: string | null, refresh?: string | null): void {
    this.accessToken.set(access);
    this.write(ACCESS, access);
    if (refresh !== undefined) {
      this.refreshToken.set(refresh);
      this.write(REFRESH, refresh);
    }
  }

  clear(): void {
    this.set(null, null);
  }

  private read(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  }
  private write(k: string, v: string | null): void {
    try {
      if (v) localStorage.setItem(k, v);
      else localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}
