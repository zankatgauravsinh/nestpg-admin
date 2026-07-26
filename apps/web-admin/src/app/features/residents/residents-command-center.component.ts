import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { UsersService, ApiUser, userDisplayName } from '../../core/data/users.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { MetricCardComponent } from '../../shared/components/metric-card.component';
import { SearchInputComponent } from '../../shared/components/search-input.component';
import { EntityAvatarComponent } from '../../shared/components/entity-avatar.component';
import { StatusPillComponent } from '../../shared/components/status-pill.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { IconComponent } from '../../shared/components/icon.component';

@Component({
  selector: 'os-residents-command-center',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, PageHeaderComponent, MetricCardComponent, SearchInputComponent,
    EntityAvatarComponent, StatusPillComponent, EmptyStateComponent, IconComponent,
  ],
  template: `
    <os-page-header eyebrow="Residents" title="Residents Command Center"
      subtitle="Everyone living across your properties, with KYC and lifecycle status.">
      <div actions>
        <button (click)="addResident()" class="h-9 px-3.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition flex items-center gap-1.5">
          <os-icon name="person_add" [size]="18" /> Add resident
        </button>
      </div>
    </os-page-header>
    @if (toast()) { <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] bg-[var(--primary-container)] text-white text-sm px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2"><os-icon name="info" [size]="18" /> {{ toast() }}</div> }

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <os-metric label="Total Residents" [value]="residents().length" icon="groups" />
      <os-metric label="Active" [value]="byStatus('ACTIVE')" icon="check_circle" />
      <os-metric label="KYC Pending" [value]="kycPending()" icon="verified_user" />
      <os-metric label="Suspended" [value]="byStatus('SUSPENDED')" icon="block" />
    </div>

    <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
      <os-search [(value)]="query" placeholder="Search by name, phone or email…" width="100%" />
      <div class="flex items-center gap-1.5 shrink-0">
        @for (s of segments; track s) {
          <button (click)="seg.set(s)" class="h-9 px-3 rounded-lg text-[13px] font-medium border transition"
            [class]="seg() === s ? 'bg-accent text-white border-accent' : 'border-border text-muted hover:bg-panel'">{{ s }}</button>
        }
      </div>
    </div>

    <div class="bg-panel border border-border rounded-[16px] overflow-hidden">
      @if (filtered().length) {
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-[11px] uppercase tracking-wider text-faint bg-canvas">
              <th class="px-5 py-2.5 font-medium">Resident</th>
              <th class="px-5 py-2.5 font-medium">Contact</th>
              <th class="px-5 py-2.5 font-medium">Role</th>
              <th class="px-5 py-2.5 font-medium">KYC</th>
              <th class="px-5 py-2.5 font-medium">Status</th>
              <th class="px-5 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            @for (u of filtered(); track u.id) {
              <tr class="border-t border-border-subtle hover:bg-canvas/60 transition">
                <td class="px-5 py-3">
                  <div class="flex items-center gap-3">
                    <os-avatar [name]="name(u)" [size]="36" [src]="u.avatarUrl ?? null" />
                    <span class="font-medium text-content">{{ name(u) }}</span>
                  </div>
                </td>
                <td class="px-5 py-3 text-muted">{{ u.phone ?? u.email ?? '—' }}</td>
                <td class="px-5 py-3 text-muted">{{ u.role ?? 'RESIDENT' }}</td>
                <td class="px-5 py-3">@if (u.kycStatus) { <os-status-pill [status]="u.kycStatus" /> } @else { <span class="text-faint text-xs">—</span> }</td>
                <td class="px-5 py-3">@if (u.status) { <os-status-pill [status]="u.status" /> } @else { <span class="text-faint text-xs">—</span> }</td>
                <td class="px-5 py-3 text-right">
                  <a [routerLink]="['/residents/crm']" [queryParams]="{ id: u.id }" class="text-accent text-sm font-medium hover:underline">Open</a>
                </td>
              </tr>
            }
          </tbody>
        </table>
      } @else {
        <os-empty-state icon="groups" title="No residents found"
          message="Once residents are onboarded they'll appear here with live KYC and lifecycle status." />
      }
    </div>
  `,
})
export class ResidentsCommandCenterComponent {
  private readonly svc = inject(UsersService);
  readonly residents = toSignal(this.svc.list(), { initialValue: [] as ApiUser[] });

  protected readonly segments = ['All', 'Active', 'Pending', 'Suspended'];
  readonly query = signal('');
  readonly seg = signal('All');
  readonly toast = signal<string | null>(null);

  addResident(): void {
    // Residents self-onboard via the phone+OTP flow; there is no admin create-user endpoint yet.
    this.toast.set('Residents onboard via the phone + OTP signup flow — admin invite endpoint is pending.');
    setTimeout(() => this.toast.set(null), 4000);
  }

  readonly filtered = computed(() => {
    const q = this.query().toLowerCase().trim();
    const s = this.seg();
    return this.residents().filter((u) => {
      if (s === 'Active' && u.status !== 'ACTIVE') return false;
      if (s === 'Suspended' && u.status !== 'SUSPENDED') return false;
      if (s === 'Pending' && !(u.status?.includes('PENDING') || u.kycStatus?.includes('PENDING'))) return false;
      if (q && !`${this.name(u)} ${u.phone ?? ''} ${u.email ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  byStatus(s: string): number { return this.residents().filter((u) => u.status === s).length; }
  kycPending(): number { return this.residents().filter((u) => u.kycStatus && u.kycStatus !== 'APPROVED').length; }
  name(u: ApiUser): string { return userDisplayName(u); }
}
