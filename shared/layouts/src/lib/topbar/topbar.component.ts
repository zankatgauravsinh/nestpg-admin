import { Component, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { AuthStore } from '@nestpg/auth';
import { UserStore } from '@nestpg/auth';
import { ThemeService } from '@nestpg/ui';

@Component({
  selector: 'nestpg-topbar',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatDividerModule,
  ],
  template: `
    <header class="h-14 flex items-center gap-3 px-4 border-b border-[var(--color-border)]
                   bg-[var(--color-bg-surface)] shrink-0 z-10">

      <!-- Hamburger (mobile only) ──────────────────────── -->
      <button
        mat-icon-button
        class="lg:hidden"
        (click)="menuClick.emit()"
        aria-label="Open navigation"
      >
        <mat-icon>menu</mat-icon>
      </button>

      <!-- Portal label ─────────────────────────────────── -->
      <span class="text-sm font-semibold text-[var(--color-text-secondary)] hidden lg:block">
        {{ portalLabel() }}
      </span>

      <!-- Spacer ───────────────────────────────────────── -->
      <div class="flex-1"></div>

      <!-- Theme toggle ─────────────────────────────────── -->
      <button
        mat-icon-button
        (click)="theme.toggle()"
        [matTooltip]="theme.isDark() ? 'Switch to light mode' : 'Switch to dark mode'"
        aria-label="Toggle theme"
        class="text-[var(--color-text-secondary)]"
      >
        <mat-icon>{{ theme.isDark() ? 'light_mode' : 'dark_mode' }}</mat-icon>
      </button>

      <!-- User avatar + menu ───────────────────────────── -->
      <button
        mat-icon-button
        [matMenuTriggerFor]="userMenu"
        aria-label="User menu"
        class="relative"
      >
        <div
          class="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center
                 text-indigo-700 dark:text-indigo-300 text-xs font-semibold"
        >
          {{ user.initials() }}
        </div>
      </button>

      <mat-menu #userMenu="matMenu" xPosition="before" class="!mt-2">
        <!-- User info header -->
        <div class="px-4 py-3 border-b border-[var(--color-border)] pointer-events-none">
          <p class="text-sm font-semibold text-[var(--color-text-primary)]">{{ user.displayName() }}</p>
          <p class="text-xs text-[var(--color-text-secondary)] mt-0.5">{{ auth.role() }}</p>
        </div>

        <button mat-menu-item [routerLink]="profileRoute()">
          <mat-icon>person_outline</mat-icon>
          <span>Profile</span>
        </button>

        <button mat-menu-item [routerLink]="settingsRoute()">
          <mat-icon>settings</mat-icon>
          <span>Settings</span>
        </button>

        <mat-divider></mat-divider>

        <button mat-menu-item (click)="handleLogout()" class="text-red-600 dark:text-red-400">
          <mat-icon class="text-red-600 dark:text-red-400">logout</mat-icon>
          <span>Sign out</span>
        </button>
      </mat-menu>
    </header>
  `,
})
export class TopbarComponent {
  protected readonly auth  = inject(AuthStore);
  protected readonly user  = inject(UserStore);
  protected readonly theme = inject(ThemeService);
  private readonly router  = inject(Router);

  readonly portalLabel  = input<string>('Admin');
  readonly loginRoute   = input<string>('/login');
  readonly profileRoute = input<string>('/profile');
  readonly settingsRoute = input<string>('/settings');

  readonly menuClick = output<void>();

  protected handleLogout(): void {
    this.auth.logout();
    this.user.clear();
    this.router.navigateByUrl(this.loginRoute());
  }
}
