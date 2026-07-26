import {
  Component,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { MatDrawerMode, MatSidenavModule } from '@angular/material/sidenav';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { NavItem } from '../nav-item.model';
import { NAV_ITEMS } from '../nav-items.token';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';
import { UserStore } from '@nestpg/auth';

@Component({
  selector: 'nestpg-app-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    MatSidenavModule,
    SidebarComponent,
    TopbarComponent,
  ],
  template: `
    <mat-drawer-container
      class="h-screen w-full bg-[var(--color-bg-base)]"
      [hasBackdrop]="isMobile()"
    >
      <!-- Sidebar drawer ─────────────────────────────── -->
      <mat-drawer
        #drawer
        [mode]="drawerMode()"
        [opened]="!isMobile()"
        class="!overflow-visible !border-none"
        [style.width]="sidebarWidth"
      >
        <nestpg-sidebar
          [items]="navItems()"
          [(collapsed)]="sidebarCollapsed"
          class="h-full"
        />
      </mat-drawer>

      <!-- Main content area ──────────────────────────── -->
      <mat-drawer-content class="flex flex-col !overflow-auto">

        <!-- Topbar -->
        <nestpg-topbar
          [portalLabel]="portalLabel()"
          [loginRoute]="loginRoute()"
          [profileRoute]="profileRoute()"
          [settingsRoute]="settingsRoute()"
          (menuClick)="drawer.toggle()"
        />

        <!-- Page content -->
        <main class="flex-1 overflow-y-auto">
          <div class="max-w-screen-xl mx-auto p-6">
            <router-outlet />
          </div>
        </main>
      </mat-drawer-content>
    </mat-drawer-container>
  `,
  styles: [`
    :host { display: contents; }

    mat-drawer {
      background: transparent !important;
    }

    mat-drawer-container, mat-drawer-content {
      height: 100% !important;
    }
  `],
})
export class AppShellComponent implements OnInit {
  private readonly bp     = inject(BreakpointObserver);
  private readonly user   = inject(UserStore);
  private readonly _navItems = inject(NAV_ITEMS);

  readonly portalLabel   = input<string>('Admin');
  readonly loginRoute    = input<string>('/login');
  readonly profileRoute  = input<string>('/profile');
  readonly settingsRoute = input<string>('/settings');

  readonly isMobile = toSignal(
    this.bp.observe([Breakpoints.XSmall, Breakpoints.Small]).pipe(
      map((r) => r.matches),
    ),
    { initialValue: false },
  );

  readonly drawerMode = toSignal(
    this.bp.observe([Breakpoints.XSmall, Breakpoints.Small]).pipe(
      map((r): MatDrawerMode => (r.matches ? 'over' : 'side')),
    ),
    { initialValue: 'side' as MatDrawerMode },
  );

  sidebarCollapsed = false;

  get sidebarWidth(): string {
    return this.sidebarCollapsed ? '56px' : '240px';
  }

  readonly navItems = signal<NavItem[]>(this._navItems ?? []);

  ngOnInit(): void {
    this.user.load();
  }
}
