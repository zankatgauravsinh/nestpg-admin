import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { Booking } from '../../core/data/models';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { MetricCardComponent } from '../../shared/components/metric-card.component';
import { IconComponent } from '../../shared/components/icon.component';
import { EntityAvatarComponent } from '../../shared/components/entity-avatar.component';
import { StatusPillComponent } from '../../shared/components/status-pill.component';

@Component({
  selector: 'os-manager-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeaderComponent, MetricCardComponent, IconComponent, EntityAvatarComponent, StatusPillComponent],
  template: `
    <os-page-header eyebrow="Workspace" title="Manager Dashboard"
      subtitle="Your operational queue for today — arrivals, departures and open work.">
      <div actions>
        <button class="h-9 px-3.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition flex items-center gap-1.5">
          <os-icon name="add" [size]="18" /> New booking
        </button>
      </div>
    </os-page-header>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <os-metric label="Arrivals Today" [value]="arrivals()" icon="login" />
      <os-metric label="Departures Today" [value]="departures()" icon="logout" />
      <os-metric label="Reserved" [value]="reserved()" icon="bookmark_added" />
      <os-metric label="Active Stays" [value]="active()" icon="groups" />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- Operational queue -->
      <div class="lg:col-span-2 bg-panel border border-border rounded-[16px] overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 class="text-base font-semibold text-content">Booking activity</h3>
          <a routerLink="/bookings" class="text-sm text-accent font-medium hover:underline">All bookings</a>
        </div>
        @if (bookings().length) {
          <ul>
            @for (b of bookings(); track b.id) {
              <li class="flex items-center gap-3 px-5 py-3 border-t border-border-subtle hover:bg-canvas/60 transition">
                <os-avatar [name]="b.residentName" [initials]="b.initials" [size]="38" />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-content truncate">{{ b.residentName }}</p>
                  <p class="text-xs text-muted truncate">Bed {{ b.bedLabel }} · check-in {{ b.checkIn }}</p>
                </div>
                <os-status-pill [status]="b.status" />
              </li>
            }
          </ul>
        } @else {
          <div class="px-5 py-10 text-center text-sm text-muted">No booking activity yet.</div>
        }
      </div>

      <!-- Quick actions / focus -->
      <div class="space-y-4">
        <div class="bg-panel border border-border rounded-[16px] p-5">
          <h3 class="text-base font-semibold text-content mb-4">Today's focus</h3>
          <div class="space-y-3">
            @for (f of focus(); track f.label) {
              <a [routerLink]="f.route" class="flex items-center gap-3 rounded-xl border border-border p-3 hover:border-accent transition">
                <span class="w-9 h-9 rounded-lg flex items-center justify-center" [class]="f.bg">
                  <os-icon [name]="f.icon" [size]="18" />
                </span>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-content">{{ f.label }}</p>
                  <p class="text-xs text-muted">{{ f.hint }}</p>
                </div>
                <span class="text-lg font-semibold text-content">{{ f.count }}</span>
              </a>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ManagerDashboardComponent {
  private readonly api = inject(ApiService);

  readonly bookings = toSignal(
    this.api.get<Booking[]>('/bookings').pipe(catchError(() => of([] as Booking[]))),
    { initialValue: [] as Booking[] },
  );

  readonly arrivals = computed(() => this.bookings().filter((b) => b.status === 'RESERVED').length);
  readonly departures = computed(() => this.bookings().filter((b) => b.status === 'NOTICE_GIVEN' || b.status === 'CHECKED_OUT').length);
  readonly reserved = computed(() => this.bookings().filter((b) => b.status === 'RESERVED').length);
  readonly active = computed(() => this.bookings().filter((b) => b.status === 'CHECKED_IN').length);

  readonly focus = computed(() => [
    { label: 'Pending check-ins', hint: 'Confirm arrivals', count: this.arrivals(), icon: 'login', bg: 'bg-info-subtle text-info', route: '/bookings/check-in' },
    { label: 'Open tickets', hint: 'Maintenance & support', count: 12, icon: 'confirmation_number', bg: 'bg-warning-subtle text-warning', route: '/operations/tickets' },
    { label: 'KYC to review', hint: 'Identity verification', count: 5, icon: 'verified_user', bg: 'bg-accent-subtle text-accent', route: '/operations/kyc' },
  ]);
}
