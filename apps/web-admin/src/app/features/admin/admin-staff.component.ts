import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminStaff, AdminStaffService, CreateAdminStaffPayload } from '../../core/data/admin-staff.service';
import { SessionStore } from '../../core/auth/session.store';
import { apiErrorMessage } from '../../core/http/api-error';
import { ADMIN_ROLE_LABELS } from '../../core/models/capability.model';
import { IconComponent } from '../../shared/components/icon.component';

const PAGE_SIZE = 20;
/** The only roles Staff Management administers — mirrors ASSIGNABLE_ADMIN_ROLES. */
const ASSIGNABLE_ROLES = ['SUPER_ADMIN', 'OPS_ADMIN', 'FINANCE_ADMIN'] as const;

/**
 * Admin Staff Management (A3) — SUPER_ADMIN's view of the console's own accounts.
 *
 * Reachable only with ROLE_ADMINISTRATION (route guard + nav), and every call
 * behind it is refused by the backend for anyone else, so the guard is
 * convenience rather than security. An account here is an ordinary user row:
 * the form collects phone, optional email, an initial password and one of the
 * three console roles — no new authentication concept, and nothing on this
 * screen ever displays a credential.
 */
@Component({
  selector: 'os-admin-staff',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, IconComponent],
  template: `
    <div class="p-4 sm:p-6 max-w-[1200px] mx-auto">
      <header class="mb-5 flex items-start justify-between gap-4">
        <div>
          <p class="text-[11px] font-semibold tracking-wider text-accent uppercase">Administration</p>
          <h1 class="text-2xl font-bold text-content">Staff / Administrators</h1>
          <p class="text-sm text-muted mt-1">Admin console accounts. Only a Super Admin can create one or change a role.</p>
        </div>
        <button (click)="showCreate.set(!showCreate())" data-testid="new-staff"
                class="h-10 px-4 rounded-lg bg-accent text-white text-sm font-semibold shrink-0">
          {{ showCreate() ? 'Cancel' : '+ New administrator' }}
        </button>
      </header>

      @if (toast(); as t) {
        <div class="mb-4 rounded-lg border border-border bg-panel px-4 py-3 text-sm text-content" data-testid="toast">{{ t }}</div>
      }

      @if (showCreate()) {
        <form (ngSubmit)="create()" data-testid="create-form"
              class="mb-5 rounded-xl border border-border bg-panel p-4 grid sm:grid-cols-2 gap-3">
          <label class="text-[13px] text-muted">Phone
            <input [(ngModel)]="form.phone" name="phone" data-testid="staff-phone" placeholder="9876543210"
                   class="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-panel text-sm text-content" />
          </label>
          <label class="text-[13px] text-muted">Email (optional)
            <input [(ngModel)]="form.email" name="email" data-testid="staff-email" placeholder="ops@nestpg.in"
                   class="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-panel text-sm text-content" />
          </label>
          <label class="text-[13px] text-muted">Initial password
            <input [(ngModel)]="form.initialPassword" name="initialPassword" type="password" data-testid="staff-password"
                   placeholder="At least 8 characters"
                   class="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-panel text-sm text-content" />
          </label>
          <label class="text-[13px] text-muted">Admin role
            <select [(ngModel)]="form.role" name="role" data-testid="staff-role"
                    class="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-panel text-sm text-content">
              @for (r of assignableRoles; track r) { <option [value]="r">{{ label(r) }}</option> }
            </select>
          </label>
          <div class="sm:col-span-2 flex items-center gap-3">
            <button type="submit" [disabled]="saving() || !formValid()" data-testid="create-submit"
                    class="h-10 px-4 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-60">Create administrator</button>
            <span class="text-[12px] text-faint">The password is sent once, hashed on the server, and never shown again.</span>
          </div>
          @if (createError(); as e) { <p class="sm:col-span-2 text-sm text-danger" data-testid="create-error">{{ e }}</p> }
        </form>
      }

      @if (loading()) {
        <div class="rounded-xl border border-border bg-panel p-10 text-center" data-testid="staff-loading">
          <p class="text-sm text-muted">Loading administrators…</p>
        </div>
      } @else if (error(); as err) {
        <div class="rounded-xl border border-danger/40 bg-danger-subtle p-8 text-center" data-testid="staff-error">
          <os-icon name="error" [size]="28" />
          <p class="mt-2 text-sm font-semibold text-content">The administrator list could not be loaded.</p>
          <p class="text-sm text-muted">{{ err }}</p>
          <button (click)="reload()" class="mt-4 h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold">Try again</button>
        </div>
      } @else if (rows().length === 0) {
        <div class="rounded-xl border border-border bg-panel p-10 text-center" data-testid="staff-empty">
          <p class="text-sm font-semibold text-content">No administrators yet.</p>
        </div>
      } @else {
        <div class="rounded-xl border border-border bg-panel overflow-hidden" data-testid="staff-list">
          <table class="w-full text-sm">
            <thead class="bg-canvas text-[11px] uppercase text-faint">
              <tr>
                <th class="text-left px-4 py-2.5">Administrator</th>
                <th class="text-left px-4 py-2.5">Role</th>
                <th class="text-left px-4 py-2.5">Status</th>
                <th class="text-left px-4 py-2.5">Last login</th>
                <th class="text-right px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (s of rows(); track s.id) {
                <tr class="border-t border-border" [attr.data-testid]="'staff-' + s.id">
                  <td class="px-4 py-3">
                    <p class="font-medium text-content">{{ s.phone }}</p>
                    <p class="text-[12px] text-faint">{{ s.email ?? '—' }}</p>
                  </td>
                  <td class="px-4 py-3">
                    <!-- selected per option, not a value binding on the select:
                         the options render after the property binding, so a
                         bound value silently collapses to the first option. -->
                    <select (change)="changeRole(s, $event)" [disabled]="acting() || isSelf(s)"
                            [attr.data-testid]="'role-' + s.id"
                            class="h-9 px-2 rounded-lg border border-border bg-panel text-[13px] text-content disabled:opacity-60">
                      @for (r of assignableRoles; track r) {
                        <option [value]="r" [selected]="r === s.role">{{ label(r) }}</option>
                      }
                    </select>
                  </td>
                  <td class="px-4 py-3">
                    <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          [class]="s.status === 'ACTIVE' ? 'bg-success-subtle text-success' : 'bg-warning-subtle text-warning'">
                      {{ s.status }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-[13px] text-muted">{{ s.lastLoginAt ? (s.lastLoginAt | date: 'd MMM y, HH:mm') : 'Never' }}</td>
                  <td class="px-4 py-3 text-right">
                    @if (isSelf(s)) {
                      <span class="text-[12px] text-faint">You</span>
                    } @else if (s.status === 'ACTIVE') {
                      <button (click)="setStatus(s, 'SUSPENDED')" [disabled]="acting()" [attr.data-testid]="'suspend-' + s.id"
                              class="h-9 px-3 rounded-lg border border-danger text-danger text-[13px] font-semibold disabled:opacity-60">Suspend</button>
                    } @else {
                      <button (click)="setStatus(s, 'ACTIVE')" [disabled]="acting()" [attr.data-testid]="'activate-' + s.id"
                              class="h-9 px-3 rounded-lg border border-border text-content text-[13px] font-semibold disabled:opacity-60">Reactivate</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (actionError(); as ae) { <p class="mt-3 text-sm text-danger" data-testid="action-error">{{ ae }}</p> }

        <div class="flex items-center justify-between mt-4">
          <p class="text-[13px] text-muted" data-testid="staff-count">{{ total() }} administrator(s) · page {{ page() }} of {{ pages() }}</p>
          <div class="flex gap-2">
            <button (click)="go(page() - 1)" [disabled]="page() <= 1" data-testid="prev-page"
                    class="h-9 px-3 rounded-lg border border-border text-[13px] text-content disabled:opacity-40">Previous</button>
            <button (click)="go(page() + 1)" [disabled]="page() >= pages()" data-testid="next-page"
                    class="h-9 px-3 rounded-lg border border-border text-[13px] text-content disabled:opacity-40">Next</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class AdminStaffComponent {
  private readonly svc = inject(AdminStaffService);
  private readonly session = inject(SessionStore);

  protected readonly assignableRoles = ASSIGNABLE_ROLES;

  readonly rows = signal<AdminStaff[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly toast = signal<string | null>(null);

  readonly showCreate = signal(false);
  readonly saving = signal(false);
  readonly createError = signal<string | null>(null);
  readonly acting = signal(false);
  readonly actionError = signal<string | null>(null);

  protected form: CreateAdminStaffPayload = this.blank();
  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  constructor() { this.reload(); }

  private blank(): CreateAdminStaffPayload {
    return { phone: '', email: '', initialPassword: '', role: 'OPS_ADMIN' };
  }

  label(role: string): string { return ADMIN_ROLE_LABELS[role] ?? role; }
  isSelf(s: AdminStaff): boolean { return s.id === this.session.user()?.id; }

  formValid(): boolean {
    return /^[6-9]\d{9}$/.test(this.form.phone.trim())
      && this.form.initialPassword.length >= 8
      && ASSIGNABLE_ROLES.includes(this.form.role as (typeof ASSIGNABLE_ROLES)[number]);
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.list(this.page(), PAGE_SIZE).subscribe({
      next: (res) => {
        this.rows.set(res.data ?? []);
        this.total.set(res.meta?.total ?? (res.data?.length ?? 0));
        this.loading.set(false);
      },
      error: (e) => { this.error.set(apiErrorMessage(e, 'Could not load administrators.')); this.loading.set(false); },
    });
  }

  go(page: number): void {
    if (page < 1 || page > this.pages()) return;
    this.page.set(page);
    this.reload();
  }

  create(): void {
    if (!this.formValid()) return;
    this.saving.set(true);
    this.createError.set(null);
    const payload: CreateAdminStaffPayload = {
      phone: this.form.phone.trim(),
      initialPassword: this.form.initialPassword,
      role: this.form.role,
      ...(this.form.email?.trim() ? { email: this.form.email.trim() } : {}),
    };
    this.svc.create(payload).subscribe({
      next: (s) => {
        this.saving.set(false);
        this.showCreate.set(false);
        this.form = this.blank();          // the password never lingers in memory
        this.flash(`${s.phone} added as ${this.label(s.role)}.`);
        this.reload();
      },
      error: (e) => { this.saving.set(false); this.createError.set(apiErrorMessage(e, 'Could not create the administrator.')); },
    });
  }

  changeRole(s: AdminStaff, ev: Event): void {
    const role = (ev.target as HTMLSelectElement).value;
    if (role === s.role) return;
    this.act(() => this.svc.assignRole(s.id, role), `${s.phone} is now ${this.label(role)}. Their sessions were revoked.`);
  }

  setStatus(s: AdminStaff, status: 'ACTIVE' | 'SUSPENDED'): void {
    this.act(() => this.svc.setStatus(s.id, status),
      status === 'SUSPENDED' ? `${s.phone} suspended. Their sessions were revoked.` : `${s.phone} reactivated.`);
  }

  private act(call: () => import('rxjs').Observable<unknown>, okMsg: string): void {
    this.acting.set(true);
    this.actionError.set(null);
    call().subscribe({
      next: () => { this.acting.set(false); this.flash(okMsg); this.reload(); },
      error: (e) => { this.acting.set(false); this.actionError.set(apiErrorMessage(e, 'Could not apply that change.')); this.reload(); },
    });
  }

  private flash(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(null), 4000);
  }
}
