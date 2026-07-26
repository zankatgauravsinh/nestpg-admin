import { effect, Injectable, signal, computed, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'nestpg_theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** User preference: light | dark | system */
  readonly theme = signal<Theme>(this.readStoredTheme());

  /** The resolved theme, respecting system preference when theme = 'system' */
  readonly resolvedTheme = computed<ResolvedTheme>(() => {
    const t = this.theme();
    if (t !== 'system') return t;
    return this.isBrowser && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });

  readonly isDark = computed(() => this.resolvedTheme() === 'dark');

  constructor() {
    // Apply theme to DOM whenever resolvedTheme changes
    effect(() => {
      this.applyTheme(this.resolvedTheme());
    });

    // Listen to OS-level theme changes when preference is 'system'
    if (this.isBrowser) {
      window
        .matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', () => {
          if (this.theme() === 'system') {
            this.applyTheme(this.resolvedTheme());
          }
        });
    }
  }

  setTheme(theme: Theme): void {
    this.theme.set(theme);
    if (this.isBrowser) localStorage.setItem(STORAGE_KEY, theme);
  }

  toggle(): void {
    this.setTheme(this.isDark() ? 'light' : 'dark');
  }

  private readStoredTheme(): Theme {
    if (!this.isBrowser) return 'system';
    return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'system';
  }

  private applyTheme(resolved: ResolvedTheme): void {
    if (!this.isBrowser) return;
    const html = document.documentElement;
    html.setAttribute('data-theme', resolved);
    // Angular Material dark mode class
    document.body.classList.toggle('dark-theme', resolved === 'dark');
  }
}
