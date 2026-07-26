import { ChangeDetectionStrategy, Component, computed, inject, model } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NAV_CONFIG } from '../../core/navigation/nav.config';
import { SessionStore } from '../../core/auth/session.store';
import { IconComponent } from '../../shared/components/icon.component';

/**
 * Operations OS primary navigation. Deep-navy rail (#091426), 260px wide,
 * role-filtered, collapsible to a 72px icon rail.
 */
@Component({
  selector: 'os-sidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterModule, MatTooltipModule, IconComponent],
  template: `
    <aside
      class="h-full bg-[var(--sidebar-bg)] flex flex-col transition-[width] duration-200 ease-in-out shrink-0"
      [style.width]="collapsed() ? '72px' : '260px'"
    >
      <!-- Brand -->
      <div class="h-16 flex items-center gap-3 px-4 shrink-0 border-b border-white/5">
        <div class="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shrink-0">
          <span class="text-white font-bold text-base leading-none">N</span>
        </div>
        @if (!collapsed()) {
          <div class="min-w-0">
            <p class="text-white font-semibold text-sm leading-tight truncate">NestPG</p>
            <p class="text-[11px] text-[var(--sidebar-text)] leading-tight truncate">Operations OS</p>
          </div>
        }
      </div>

      <!-- Nav -->
      <nav class="flex-1 overflow-y-auto overflow-x-hidden os-scroll py-3 px-2.5 space-y-0.5">
        @for (item of items(); track item.id) {
          @if (item.isSection) {
            @if (!collapsed()) {
              <p class="px-2.5 pt-4 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--sidebar-text)]/60">
                {{ item.label }}
              </p>
            } @else {
              <div class="my-2 mx-2 border-t border-white/5"></div>
            }
          } @else {
            <a
              [routerLink]="item.route"
              routerLinkActive="nav-active"
              [routerLinkActiveOptions]="{ exact: item.route === '/dashboard' }"
              class="nav-link group flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium text-[var(--sidebar-text)] hover:text-white hover:bg-white/5 transition-colors"
              [class.justify-center]="collapsed()"
              [matTooltip]="collapsed() ? item.label : ''"
              matTooltipPosition="right"
            >
              <os-icon [name]="item.icon ?? 'circle'" [size]="20" />
              @if (!collapsed()) {
                <span class="truncate flex-1">{{ item.label }}</span>
                @if (item.badge) {
                  <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-accent text-white leading-none">
                    {{ item.badge }}
                  </span>
                }
              }
            </a>
          }
        }
      </nav>

      <!-- Collapse toggle -->
      <div class="shrink-0 p-2.5 border-t border-white/5">
        <button
          (click)="collapsed.set(!collapsed())"
          class="w-full flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] font-medium text-[var(--sidebar-text)] hover:text-white hover:bg-white/5 transition-colors"
          [class.justify-center]="collapsed()"
          aria-label="Toggle navigation"
        >
          <os-icon [name]="collapsed() ? 'chevron_right' : 'chevron_left'" [size]="20" />
          @if (!collapsed()) { <span>Collapse</span> }
        </button>
      </div>
    </aside>
  `,
  styles: [`
    .nav-link.nav-active {
      background: var(--sidebar-active);
      color: #fff;
    }
  `],
})
export class SidebarComponent {
  private readonly session = inject(SessionStore);
  readonly collapsed = model<boolean>(false);

  readonly items = computed(() =>
    NAV_CONFIG.filter((i) => this.session.can(i.roles)),
  );
}
