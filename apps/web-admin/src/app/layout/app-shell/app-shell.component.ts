import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';

/**
 * App shell: fixed sidebar + topbar + scrollable content region.
 * Responsive — on < lg the sidebar becomes an overlay drawer.
 */
@Component({
  selector: 'os-app-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent],
  template: `
    <div class="h-screen w-screen overflow-hidden flex bg-canvas">
      <!-- Desktop sidebar -->
      <div class="hidden lg:flex">
        <os-sidebar [(collapsed)]="collapsed" />
      </div>

      <!-- Mobile overlay sidebar -->
      @if (mobileOpen()) {
        <div class="fixed inset-0 z-50 flex lg:hidden">
          <div class="absolute inset-0 bg-black/40" (click)="mobileOpen.set(false)"></div>
          <div class="relative"><os-sidebar /></div>
        </div>
      }

      <div class="flex-1 min-w-0 flex flex-col">
        <os-topbar (menuToggle)="mobileOpen.set(!mobileOpen())" />
        <main class="flex-1 overflow-y-auto os-scroll">
          <div class="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6">
            <router-outlet />
          </div>
        </main>
      </div>
    </div>
  `,
})
export class AppShellComponent {
  protected readonly collapsed = signal(false);
  protected readonly mobileOpen = signal(false);
}
