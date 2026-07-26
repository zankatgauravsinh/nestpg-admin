import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from '@nestpg/ui';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'nestpg-auth-shell',
  standalone: true,
  imports: [RouterOutlet, MatButtonModule, MatIconModule],
  template: `
    <div class="min-h-screen bg-[var(--color-bg-base)] flex flex-col">

      <!-- Minimal topbar -->
      <header class="h-14 flex items-center justify-between px-6 border-b border-[var(--color-border)]
                     bg-[var(--color-bg-surface)]">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <span class="text-white font-bold text-sm leading-none">N</span>
          </div>
          <span class="font-semibold text-[var(--color-text-primary)] text-sm tracking-tight">NestPG</span>
        </div>

        <button
          mat-icon-button
          (click)="theme.toggle()"
          [attr.aria-label]="theme.isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
          class="text-[var(--color-text-secondary)]"
        >
          <mat-icon>{{ theme.isDark() ? 'light_mode' : 'dark_mode' }}</mat-icon>
        </button>
      </header>

      <!-- Content -->
      <main class="flex-1 flex items-center justify-center p-4">
        <router-outlet />
      </main>

      <!-- Footer -->
      <footer class="py-4 text-center text-xs text-[var(--color-text-disabled)]">
        © {{ year }} NestPG. All rights reserved.
      </footer>
    </div>
  `,
})
export class AuthShellComponent {
  protected readonly theme = inject(ThemeService);
  readonly year = new Date().getFullYear();
}
