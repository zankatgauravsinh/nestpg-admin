import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { UsersService, ApiUser, userDisplayName } from '../../core/data/users.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { MetricCardComponent } from '../../shared/components/metric-card.component';
import { EntityAvatarComponent } from '../../shared/components/entity-avatar.component';
import { StatusPillComponent } from '../../shared/components/status-pill.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { IconComponent } from '../../shared/components/icon.component';

@Component({
  selector: 'os-users-admin',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, PageHeaderComponent, MetricCardComponent, EntityAvatarComponent,
    StatusPillComponent, EmptyStateComponent, IconComponent,
  ],
  template: `
    <os-page-header eyebrow="Administration" title="Users & Team"
      subtitle="Manage team members, roles and access across your organization.">
      <div actions>
        <button class="h-9 px-3.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition flex items-center gap-1.5">
          <os-icon name="person_add" [size]="18" /> Invite user
        </button>
      </div>
    </os-page-header>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <os-metric label="Team Members" [value]="users().length" icon="group" />
      <os-metric label="Owners" [value]="byRole('PG_OWNER')" icon="diamond" />
      <os-metric label="Managers" [value]="byRole('PROP_MANAGER')" icon="badge" />
      <os-metric label="Active" [value]="active()" icon="check_circle" />
    </div>

    <div class="bg-panel border border-border rounded-[16px] overflow-hidden">
      @if (users().length) {
        <table class="w-full text-sm">
          <thead><tr class="text-left text-[11px] uppercase tracking-wider text-faint bg-canvas">
            <th class="px-5 py-2.5 font-medium">Member</th><th class="px-5 py-2.5 font-medium">Contact</th>
            <th class="px-5 py-2.5 font-medium">Role</th><th class="px-5 py-2.5 font-medium">Status</th>
            <th class="px-5 py-2.5 font-medium text-right">Actions</th>
          </tr></thead>
          <tbody>
            @for (u of users(); track u.id) {
              <tr class="border-t border-border-subtle hover:bg-canvas/60 transition">
                <td class="px-5 py-3"><div class="flex items-center gap-3"><os-avatar [name]="name(u)" [size]="34" [src]="u.avatarUrl ?? null" /><span class="font-medium text-content">{{ name(u) }}</span></div></td>
                <td class="px-5 py-3 text-muted">{{ u.phone ?? u.email ?? '—' }}</td>
                <td class="px-5 py-3">
                  <select [ngModel]="u.role" (ngModelChange)="changeRole(u, $event)"
                    class="h-8 px-2 rounded-lg border border-border bg-panel text-[13px] text-content outline-none focus:border-accent">
                    @for (r of roleOptions; track r.value) { <option [value]="r.value">{{ r.label }}</option> }
                  </select>
                </td>
                <td class="px-5 py-3">@if (u.status) { <os-status-pill [status]="u.status" /> }</td>
                <td class="px-5 py-3 text-right">
                  <button (click)="toggleStatus(u)" class="h-8 px-3 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas">
                    {{ u.status === 'SUSPENDED' ? 'Activate' : 'Suspend' }}
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      } @else {
        <os-empty-state icon="group" title="No team members" message="Invite teammates to collaborate — they'll appear here from GET /users." />
      }
      @if (msg()) { <p class="px-5 py-3 text-xs text-success border-t border-border-subtle flex items-center gap-1"><os-icon name="check" [size]="14" /> {{ msg() }}</p> }
    </div>
  `,
})
export class UsersAdminComponent {
  private readonly svc = inject(UsersService);
  readonly users = toSignal(this.svc.list(), { initialValue: [] as ApiUser[] });
  readonly msg = signal<string | null>(null);

  protected readonly roleOptions = [
    { value: 'SUPER_ADMIN', label: 'Super Admin' },
    { value: 'OPS_ADMIN', label: 'Ops Admin' },
    { value: 'FINANCE_ADMIN', label: 'Finance Admin' },
    { value: 'PG_OWNER', label: 'PG Owner' },
    { value: 'PROP_MANAGER', label: 'Property Manager' },
    { value: 'CARETAKER', label: 'Caretaker' },
    { value: 'TENANT', label: 'Tenant' },
  ];

  byRole(r: string): number { return this.users().filter((u) => u.role === r).length; }
  active(): number { return this.users().filter((u) => u.status === 'ACTIVE').length; }
  name(u: ApiUser): string { return userDisplayName(u); }

  changeRole(u: ApiUser, role: string): void {
    this.svc.setRole(u.id, role).subscribe({
      next: () => { u.role = role; this.msg.set(`${this.name(u)} role updated to ${role}.`); },
      error: () => this.msg.set('Could not update role (API unavailable).'),
    });
  }
  toggleStatus(u: ApiUser): void {
    const next = u.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    this.svc.setStatus(u.id, next).subscribe({
      next: () => { u.status = next; this.msg.set(`${this.name(u)} ${next.toLowerCase()}.`); },
      error: () => this.msg.set('Could not update status (API unavailable).'),
    });
  }
}
