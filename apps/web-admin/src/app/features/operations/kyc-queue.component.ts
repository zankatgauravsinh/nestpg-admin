import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { UsersService, ApiUser, userDisplayName } from '../../core/data/users.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { MetricCardComponent } from '../../shared/components/metric-card.component';
import { EntityAvatarComponent } from '../../shared/components/entity-avatar.component';
import { StatusPillComponent } from '../../shared/components/status-pill.component';
import { DrawerShellComponent } from '../../shared/components/drawer-shell.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { IconComponent } from '../../shared/components/icon.component';

@Component({
  selector: 'os-kyc-queue',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent, MetricCardComponent, EntityAvatarComponent, StatusPillComponent,
    DrawerShellComponent, EmptyStateComponent, IconComponent,
  ],
  template: `
    <os-page-header eyebrow="Operations" title="KYC Verification"
      subtitle="Identity verification queue across all residents." />

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <os-metric label="In Queue" [value]="queue().length" icon="verified_user" />
      <os-metric label="Needs Review" [value]="count('NEEDS_REVIEW')" icon="gpp_maybe" />
      <os-metric label="Submitted" [value]="count('SUBMITTED')" icon="upload_file" />
      <os-metric label="Approved" [value]="count('APPROVED')" icon="verified" />
    </div>

    <div class="bg-panel border border-border rounded-[16px] overflow-hidden">
      @if (queue().length) {
        <ul>
          @for (u of queue(); track u.id) {
            <li class="flex items-center gap-3 px-5 py-3 border-t border-border-subtle first:border-t-0 hover:bg-canvas/60 transition cursor-pointer" (click)="select.set(u)">
              <os-avatar [name]="name(u)" [size]="38" />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-content truncate">{{ name(u) }}</p>
                <p class="text-xs text-muted truncate">{{ u.phone ?? u.email ?? '' }}</p>
              </div>
              <os-status-pill [status]="u.kycStatus ?? 'PENDING'" />
            </li>
          }
        </ul>
      } @else {
        <os-empty-state icon="verified_user" title="Queue is clear"
          message="Residents with pending identity verification (from GET /users) appear here." />
      }
    </div>

    <os-drawer [open]="!!select()" [title]="select() ? name(select()!) : ''" subtitle="Identity review" (closed)="select.set(null)">
      @if (select(); as u) {
        <div class="space-y-4">
          <div class="flex items-center justify-between"><span class="text-sm text-muted">Status</span><os-status-pill [status]="u.kycStatus ?? 'PENDING'" /></div>
          <div class="rounded-xl border border-border p-3"><p class="text-[11px] text-faint mb-0.5">Contact</p><p class="text-sm text-content">{{ u.phone ?? u.email ?? '—' }}</p></div>
        </div>
      }
      <div footer class="flex gap-2">
        <button (click)="review('REJECTED')" class="flex-1 h-10 rounded-lg bg-danger text-white text-sm font-semibold">Reject</button>
        <button (click)="review('APPROVED')" class="flex-1 h-10 rounded-lg bg-success text-white text-sm font-semibold">Approve identity</button>
      </div>
    </os-drawer>
    @if (msg()) { <p class="mt-3 text-xs text-success flex items-center gap-1"><os-icon name="check" [size]="14" /> {{ msg() }}</p> }
  `,
})
export class KycQueueComponent {
  private readonly svc = inject(UsersService);
  private readonly users = toSignal(this.svc.list(), { initialValue: [] as ApiUser[] });
  readonly select = signal<ApiUser | null>(null);
  readonly msg = signal<string | null>(null);

  readonly queue = computed(() => this.users().filter((u) => u.kycStatus && u.kycStatus !== 'APPROVED' && u.kycStatus !== 'REJECTED'));
  count(s: string): number { return this.users().filter((u) => u.kycStatus === s).length; }
  name(u: ApiUser): string { return userDisplayName(u); }

  review(decision: 'APPROVED' | 'REJECTED'): void {
    const u = this.select();
    if (!u) return;
    const reason = decision === 'REJECTED' ? 'Documents did not pass verification' : undefined;
    this.svc.reviewKyc(u.id, decision, reason).subscribe({
      next: () => { this.msg.set(`${this.name(u)}: ${decision}`); this.select.set(null); },
      error: () => this.msg.set('Could not submit (API unavailable).'),
    });
  }
}
