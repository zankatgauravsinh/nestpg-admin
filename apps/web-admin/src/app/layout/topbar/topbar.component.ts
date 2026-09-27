import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { Router } from '@angular/router';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SessionStore } from '../../core/auth/session.store';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/theme/theme.service';
import { ROLE_LABELS, Role } from '../../core/models/role.model';
import { IconComponent } from '../../shared/components/icon.component';
import { EntityAvatarComponent } from '../../shared/components/entity-avatar.component';
import { SearchInputComponent } from '../../shared/components/search-input.component';

/** Top application bar: global search, theme, notifications, signed-in user. */
@Component({
  selector: 'os-topbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatMenuModule, MatTooltipModule, IconComponent, EntityAvatarComponent, SearchInputComponent],
  template: `
    <header class="h-16 shrink-0 bg-panel border-b border-border flex items-center gap-3 px-4 sm:px-6">
      <button
        class="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:bg-canvas lg:hidden"
        (click)="menuToggle.emit()" aria-label="Toggle menu">
        <os-icon name="menu" [size]="22" />
      </button>

      <div class="hidden sm:block">
        <os-search placeholder="Search residents, properties, bookings…" width="340px" (submitted)="search($event)" />
      </div>

      <div class="flex-1"></div>

      <!-- The signed-in admin's role, from the real session. The persona
           switcher that used to live here fabricated an identity, which is
           incompatible with a real authenticated session (A1). -->
      @if (session.role(); as role) {
        <span class="hidden sm:flex items-center gap-2 h-9 px-3 rounded-lg border border-border text-sm font-medium text-content">
          <os-icon name="shield_person" [size]="18" />
          <span>{{ roleLabel(role) }}</span>
        </span>
      }

      <button
        class="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:bg-canvas transition"
        (click)="theme.toggle()"
        [matTooltip]="theme.isDark() ? 'Light mode' : 'Dark mode'">
        <os-icon [name]="theme.isDark() ? 'light_mode' : 'dark_mode'" [size]="20" />
      </button>

      <button class="relative w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:bg-canvas transition"
              matTooltip="Notifications">
        <os-icon name="notifications" [size]="20" />
        <span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent ring-2 ring-panel"></span>
      </button>

      <div class="w-px h-6 bg-border mx-1"></div>

      @if (session.user(); as user) {
        <button [matMenuTriggerFor]="userMenu" class="flex items-center gap-2.5 pl-1 pr-2 h-10 rounded-lg hover:bg-canvas transition">
          <os-avatar [name]="user.name" [initials]="user.initials" [size]="32" />
          <div class="hidden md:block text-left leading-tight">
            <p class="text-[13px] font-semibold text-content">{{ user.name }}</p>
            <p class="text-[11px] text-faint">{{ user.organization }}</p>
          </div>
        </button>
        <mat-menu #userMenu="matMenu">
          <div class="px-4 py-2 border-b border-border">
            <p class="text-sm font-semibold text-content">{{ user.name }}</p>
            <p class="text-xs text-muted">{{ user.email }}</p>
          </div>
          <button mat-menu-item><span class="text-sm">Profile</span></button>
          <button mat-menu-item><span class="text-sm">Preferences</span></button>
          <button mat-menu-item (click)="signOut()"><span class="text-sm">Sign out</span></button>
        </mat-menu>
      }
    </header>
  `,
})
export class TopbarComponent {
  protected readonly session = inject(SessionStore);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly menuToggle = output<void>();

  roleLabel(r: Role): string {
    return ROLE_LABELS[r];
  }

  /** Real sign-out: revoke the session server-side, then leave the app. */
  signOut(): void {
    this.auth.logout();
    void this.router.navigate(['/auth/login']);
  }

  search(q: string): void {
    if (q.trim()) this.router.navigate(['/search'], { queryParams: { q: q.trim() } });
  }
}
