import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { UsersService, ApiUser, userDisplayName } from '../../core/data/users.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EntityAvatarComponent } from '../../shared/components/entity-avatar.component';
import { SearchInputComponent } from '../../shared/components/search-input.component';
import { IconComponent } from '../../shared/components/icon.component';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES } from '../../core/models/role.model';

const MATRIX: { area: string; perms: Record<string, boolean> }[] = [
  { area: 'Properties', perms: { SUPER_ADMIN: true, OWNER: true, MANAGER: true } },
  { area: 'Property settings', perms: { SUPER_ADMIN: true, OWNER: true, MANAGER: false } },
  { area: 'Inventory & beds', perms: { SUPER_ADMIN: true, OWNER: true, MANAGER: true } },
  { area: 'Residents & CRM', perms: { SUPER_ADMIN: true, OWNER: true, MANAGER: true } },
  { area: 'Bookings & check-in', perms: { SUPER_ADMIN: true, OWNER: true, MANAGER: true } },
  { area: 'Finance & collections', perms: { SUPER_ADMIN: true, OWNER: true, MANAGER: false } },
  { area: 'KYC review', perms: { SUPER_ADMIN: true, OWNER: true, MANAGER: true } },
  { area: 'Analytics & revenue', perms: { SUPER_ADMIN: true, OWNER: true, MANAGER: false } },
  { area: 'User management', perms: { SUPER_ADMIN: true, OWNER: true, MANAGER: false } },
  { area: 'Platform operations', perms: { SUPER_ADMIN: true, OWNER: false, MANAGER: false } },
];

const ASSIGNABLE = [
  { value: 'SUPER_ADMIN', label: 'Super Admin' },
  { value: 'OPS_ADMIN', label: 'Ops Admin' },
  { value: 'FINANCE_ADMIN', label: 'Finance Admin' },
  { value: 'PG_OWNER', label: 'PG Owner' },
  { value: 'PROP_MANAGER', label: 'Property Manager' },
  { value: 'CARETAKER', label: 'Caretaker' },
  { value: 'TENANT', label: 'Tenant' },
];

@Component({
  selector: 'os-roles-admin',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, PageHeaderComponent, EntityAvatarComponent, SearchInputComponent, IconComponent],
  template: `
    <os-page-header eyebrow="Administration" title="Roles & Permissions"
      subtitle="How access is granted, and who holds which role." />

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      @for (r of roles; track r) {
        <div class="bg-panel border border-border rounded-[16px] p-5">
          <div class="w-10 h-10 rounded-xl bg-accent-subtle text-accent flex items-center justify-center mb-3"><os-icon name="shield_person" [size]="20" /></div>
          <h3 class="text-base font-semibold text-content">{{ label(r) }}</h3>
          <p class="text-sm text-muted mt-1">{{ desc(r) }}</p>
        </div>
      }
    </div>

    <!-- Capability matrix -->
    <div class="bg-panel border border-border rounded-[16px] overflow-hidden mb-6">
      <div class="px-5 py-4 border-b border-border"><h3 class="text-base font-semibold text-content">Capability matrix</h3></div>
      <table class="w-full text-sm">
        <thead><tr class="text-left text-[11px] uppercase tracking-wider text-faint bg-canvas">
          <th class="px-5 py-3 font-medium">Capability</th>
          @for (r of roles; track r) { <th class="px-5 py-3 font-medium text-center">{{ label(r) }}</th> }
        </tr></thead>
        <tbody>
          @for (row of matrix; track row.area) {
            <tr class="border-t border-border-subtle">
              <td class="px-5 py-3 font-medium text-content">{{ row.area }}</td>
              @for (r of roles; track r) {
                <td class="px-5 py-3 text-center">
                  @if (row.perms[r]) { <os-icon name="check_circle" [size]="18" class="text-success" /> }
                  @else { <os-icon name="remove" [size]="18" class="text-faint" /> }
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>

    <!-- Role assignment / management -->
    <div class="bg-panel border border-border rounded-[16px] overflow-hidden">
      <div class="px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 class="text-base font-semibold text-content">Role assignments</h3>
          <p class="text-xs text-muted">Change a member's role — applies immediately and revokes their active sessions.</p>
        </div>
        <os-search [(value)]="query" placeholder="Search members…" width="260px" />
      </div>
      @if (filtered().length) {
        <table class="w-full text-sm">
          <thead><tr class="text-left text-[11px] uppercase tracking-wider text-faint bg-canvas">
            <th class="px-5 py-2.5 font-medium">Member</th><th class="px-5 py-2.5 font-medium">Contact</th>
            <th class="px-5 py-2.5 font-medium">Current role</th><th class="px-5 py-2.5 font-medium text-right">Assign role</th>
          </tr></thead>
          <tbody>
            @for (u of filtered(); track u.id) {
              <tr class="border-t border-border-subtle hover:bg-canvas/60 transition">
                <td class="px-5 py-3"><div class="flex items-center gap-3"><os-avatar [name]="name(u)" [size]="34" /><span class="font-medium text-content">{{ name(u) }}</span></div></td>
                <td class="px-5 py-3 text-muted">{{ u.phone ?? u.email ?? '—' }}</td>
                <td class="px-5 py-3"><span class="text-[12px] font-semibold px-2 py-1 rounded-full bg-accent-subtle text-accent">{{ roleLabel(u.role) }}</span></td>
                <td class="px-5 py-3 text-right">
                  <select [ngModel]="u.role" (ngModelChange)="changeRole(u, $event)"
                    class="h-8 px-2 rounded-lg border border-border bg-panel text-[13px] text-content outline-none focus:border-accent">
                    @for (o of assignable; track o.value) { <option [value]="o.value">{{ o.label }}</option> }
                  </select>
                </td>
              </tr>
            }
          </tbody>
        </table>
      } @else {
        <p class="px-5 py-8 text-center text-sm text-muted">No members found.</p>
      }
      @if (msg()) { <p class="px-5 py-3 text-xs border-t border-border-subtle flex items-center gap-1" [class.text-success]="!err()" [class.text-danger]="err()"><os-icon [name]="err()?'error':'check'" [size]="14" /> {{ msg() }}</p> }
    </div>
  `,
})
export class RolesAdminComponent {
  private readonly svc = inject(UsersService);
  protected readonly roles = ROLES;
  protected readonly matrix = MATRIX;
  protected readonly assignable = ASSIGNABLE;

  readonly users = toSignal(this.svc.list({ limit: 100 }), { initialValue: [] as ApiUser[] });
  readonly query = signal('');
  readonly msg = signal<string | null>(null);
  readonly err = signal(false);

  readonly filtered = computed(() => {
    const q = this.query().toLowerCase().trim();
    return this.users().filter((u) => !q || `${userDisplayName(u)} ${u.phone ?? ''} ${u.role ?? ''}`.toLowerCase().includes(q));
  });

  label(r: string): string { return ROLE_LABELS[r as keyof typeof ROLE_LABELS]; }
  desc(r: string): string { return ROLE_DESCRIPTIONS[r as keyof typeof ROLE_DESCRIPTIONS]; }
  name(u: ApiUser): string { return userDisplayName(u); }
  roleLabel(r?: string): string { return ASSIGNABLE.find((a) => a.value === r)?.label ?? r ?? '—'; }

  changeRole(u: ApiUser, role: string): void {
    const prev = u.role;
    this.svc.setRole(u.id, role).subscribe({
      next: () => { u.role = role; this.err.set(false); this.msg.set(`${this.name(u)} is now ${this.roleLabel(role)}.`); },
      error: (e) => { u.role = prev; this.err.set(true); this.msg.set(apiErrorMessage(e, 'Could not change role.')); },
    });
  }
}
