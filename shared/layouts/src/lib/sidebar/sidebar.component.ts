import {
  Component,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { filter } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavItem } from '../nav-item.model';
import { AuthStore } from '@nestpg/auth';

@Component({
  selector: 'nestpg-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatTooltipModule, MatButtonModule],
  template: `
    <aside
      class="sidebar flex flex-col h-full bg-[var(--color-bg-surface)] border-r border-[var(--color-border)] transition-all duration-200 ease-in-out"
      [class.sidebar--collapsed]="collapsed()"
    >
      <!-- Logo ─────────────────────────────────────────── -->
      <div class="flex items-center h-14 px-4 border-b border-[var(--color-border)] shrink-0">
        @if (!collapsed()) {
          <div class="flex items-center gap-2 overflow-hidden">
            <div class="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
              <span class="text-white font-bold text-sm leading-none">N</span>
            </div>
            <span class="font-semibold text-[var(--color-text-primary)] text-sm tracking-tight truncate">
              NestPG Admin
            </span>
          </div>
        } @else {
          <div class="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center mx-auto">
            <span class="text-white font-bold text-sm leading-none">N</span>
          </div>
        }
      </div>

      <!-- Nav Items ─────────────────────────────────────── -->
      <nav class="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-0.5 px-2">
        @for (item of visibleItems(); track item.id) {
          @if (item.isSectionLabel && !collapsed()) {
            <div class="px-2 pt-4 pb-1">
              <span class="text-[10px] font-medium uppercase tracking-widest text-[var(--color-text-disabled)]">
                {{ item.label }}
              </span>
            </div>
          } @else if (!item.isSectionLabel) {
            @if (item.children && item.children.length > 0) {
              <!-- Grouped nav item -->
              <div>
                <button
                  class="nav-item w-full"
                  [class.nav-item--active]="isGroupActive(item)"
                  [class.nav-item--collapsed]="collapsed()"
                  (click)="toggleGroup(item.id)"
                  [matTooltip]="collapsed() ? item.label : ''"
                  matTooltipPosition="right"
                >
                  <mat-icon class="nav-item__icon">{{ item.icon }}</mat-icon>
                  @if (!collapsed()) {
                    <span class="nav-item__label">{{ item.label }}</span>
                    <mat-icon class="nav-item__chevron ml-auto text-base transition-transform duration-200"
                      [class.rotate-180]="expandedGroups().has(item.id)">
                      expand_more
                    </mat-icon>
                  }
                </button>

                @if (expandedGroups().has(item.id) && !collapsed()) {
                  <div class="ml-3 mt-0.5 space-y-0.5 border-l border-[var(--color-border)] pl-3">
                    @for (child of item.children; track child.id) {
                      <a
                        [routerLink]="child.route"
                        class="nav-item nav-item--child"
                        [class.nav-item--active]="isActive(child)"
                        routerLinkActive="nav-item--active"
                        [routerLinkActiveOptions]="{ exact: false }"
                      >
                        <span class="nav-item__label">{{ child.label }}</span>
                        @if (child.badge) {
                          <span class="ml-auto nav-item__badge">{{ child.badge }}</span>
                        }
                      </a>
                    }
                  </div>
                }
              </div>
            } @else if (item.route) {
              <!-- Simple nav item -->
              <a
                [routerLink]="item.route"
                class="nav-item"
                [class.nav-item--collapsed]="collapsed()"
                routerLinkActive="nav-item--active"
                [routerLinkActiveOptions]="{ exact: item.route === '/dashboard' }"
                [matTooltip]="collapsed() ? item.label : ''"
                matTooltipPosition="right"
              >
                <mat-icon class="nav-item__icon">{{ item.icon }}</mat-icon>
                @if (!collapsed()) {
                  <span class="nav-item__label">{{ item.label }}</span>
                  @if (item.badge) {
                    <span class="ml-auto nav-item__badge">{{ item.badge }}</span>
                  }
                }
              </a>
            }
          }
        }
      </nav>

      <!-- Collapse Toggle ──────────────────────────────── -->
      <div class="shrink-0 border-t border-[var(--color-border)] p-2">
        <button
          class="nav-item w-full justify-center"
          [class.nav-item--collapsed]="collapsed()"
          (click)="toggleCollapsed()"
          [matTooltip]="collapsed() ? 'Expand sidebar' : ''"
          matTooltipPosition="right"
          aria-label="Toggle sidebar"
        >
          <mat-icon class="nav-item__icon transition-transform duration-200"
            [class.rotate-180]="collapsed()">
            chevron_left
          </mat-icon>
          @if (!collapsed()) {
            <span class="nav-item__label text-xs">Collapse</span>
          }
        </button>
      </div>
    </aside>
  `,
  styles: [`
    :host {
      display: contents;
    }

    .sidebar {
      width: 240px;
    }

    .sidebar--collapsed {
      width: 56px;
    }

    .nav-item {
      @apply flex items-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium
             text-[var(--color-text-secondary)] cursor-pointer select-none
             transition-colors duration-100 no-underline;
    }

    .nav-item:hover {
      @apply bg-[var(--color-bg-subtle)] text-[var(--color-text-primary)];
    }

    .nav-item--active {
      @apply bg-[var(--color-brand-subtle)] text-[var(--color-brand)]
             border-l-2 border-[var(--color-brand)] !-ml-px !pl-[7px];
    }

    .nav-item--collapsed {
      @apply justify-center px-0;
    }

    .nav-item--child {
      @apply py-1.5 text-xs;
    }

    .nav-item__icon {
      @apply shrink-0 text-[18px] !w-[18px] !h-[18px] leading-none;
    }

    .nav-item__label {
      @apply truncate min-w-0;
    }

    .nav-item__badge {
      @apply text-[10px] font-semibold px-1.5 py-0.5 rounded-full
             bg-[var(--color-brand)] text-white leading-none;
    }

    .nav-item__chevron {
      @apply text-[var(--color-text-disabled)];
    }
  `],
})
export class SidebarComponent {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  readonly items    = input.required<NavItem[]>();
  readonly collapsed = model<boolean>(false);

  private readonly _expandedGroups = signal<Set<string>>(new Set());
  readonly expandedGroups = this._expandedGroups.asReadonly();

  /** Filter items the current user's role can see */
  readonly visibleItems = computed(() => {
    const role = this.auth.role();
    return this.items().filter((item) => {
      if (!item.roles || item.roles.length === 0) return true;
      return role ? item.roles.includes(role) : false;
    });
  });

  toggleCollapsed(): void {
    this.collapsed.update((v) => !v);
  }

  toggleGroup(id: string): void {
    this._expandedGroups.update((set) => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  isActive(item: NavItem): boolean {
    if (!item.route) return false;
    return this.router.isActive(item.route, { paths: 'subset', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored' });
  }

  isGroupActive(item: NavItem): boolean {
    return item.children?.some((c) => this.isActive(c)) ?? false;
  }
}
