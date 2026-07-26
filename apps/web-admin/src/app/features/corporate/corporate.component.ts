import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  CorporateService, CorporateAccount, CorporateAgreement,
  CreateAccountPayload, CreateAgreementPayload,
} from '../../core/data/corporate.service';
import { PropertiesService } from '../../core/data/properties.service';
import { Property } from '../../core/data/models';
import { apiErrorMessage } from '../../core/http/api-error';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { IconComponent } from '../../shared/components/icon.component';
import { StatusPillComponent } from '../../shared/components/status-pill.component';

/**
 * Corporate accounts + agreements. The backend exposes create + get-by-id only
 * (no list endpoint), so this screen creates records, keeps the ones made this
 * session, and supports lookup-by-id, assign-bed and cancel.
 */
@Component({
  selector: 'os-corporate',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, PageHeaderComponent, IconComponent, StatusPillComponent],
  template: `
    <os-page-header eyebrow="Corporate" title="Corporate Bookings"
      subtitle="Company accounts and bulk bed agreements." />

    @if (toast()) { <div class="mb-4 rounded-lg bg-success-subtle text-success text-sm px-4 py-2.5 flex items-center gap-2"><os-icon name="check_circle" [size]="18" /> {{ toast() }}</div> }
    @if (error()) { <div class="mb-4 rounded-lg bg-danger-subtle text-danger text-sm px-4 py-2.5 flex items-center gap-2"><os-icon name="error" [size]="18" /> {{ error() }}</div> }

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- Accounts -->
      <div class="bg-panel border border-border rounded-[16px] p-5">
        <h3 class="text-base font-semibold text-content mb-4">New corporate account</h3>
        <div class="space-y-3">
          <input [(ngModel)]="acc.companyName" placeholder="Company name *" class="fld" />
          <input [(ngModel)]="acc.billingEmail" type="email" placeholder="Billing email *" class="fld" />
          <input [(ngModel)]="acc.hrContactUserId" placeholder="HR contact user id (UUID) *" class="fld" />
          <div class="grid grid-cols-2 gap-3">
            <input [(ngModel)]="acc.gstin" placeholder="GSTIN" class="fld" />
            <input [(ngModel)]="creditLimitRupees" type="number" placeholder="Credit limit (₹)" class="fld" />
          </div>
          <input [(ngModel)]="acc.billingAddress" placeholder="Billing address" class="fld" />
          <button (click)="createAccount()" [disabled]="busy()" class="w-full h-10 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-1.5">
            <os-icon name="add_business" [size]="16" /> Create account
          </button>
        </div>

        @if (accounts().length) {
          <div class="mt-5 border-t border-border pt-4 space-y-2">
            <p class="text-[12px] uppercase tracking-wider text-faint">Accounts (this session)</p>
            @for (a of accounts(); track a.id) {
              <div class="rounded-xl border border-border p-3">
                <div class="flex items-center justify-between"><p class="text-sm font-semibold text-content">{{ a.companyName }}</p>
                  <span class="text-[11px] text-faint font-mono">{{ a.id.slice(0,8) }}</span></div>
                <p class="text-xs text-muted">{{ a.billingEmail }}{{ a.gstin ? ' · ' + a.gstin : '' }}</p>
                <button (click)="useAccount(a)" class="mt-1.5 text-[12px] text-accent font-medium">Use for agreement →</button>
              </div>
            }
          </div>
        }
      </div>

      <!-- Agreements -->
      <div class="bg-panel border border-border rounded-[16px] p-5">
        <h3 class="text-base font-semibold text-content mb-4">New agreement</h3>
        <div class="space-y-3">
          <input [(ngModel)]="agr.corporateAccountId" placeholder="Corporate account id (UUID) *" class="fld" />
          <select [(ngModel)]="agr.propertyId" class="fld">
            <option value="">Select property *</option>
            @for (p of properties(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
          </select>
          <input [(ngModel)]="agr.hrUserId" placeholder="HR user id (UUID) *" class="fld" />
          <div class="grid grid-cols-2 gap-3">
            <input [(ngModel)]="agr.totalBedsRequested" type="number" placeholder="Beds requested *" class="fld" />
            <input [(ngModel)]="agr.checkInDate" type="date" class="fld" />
          </div>
          <input [(ngModel)]="agr.poNumber" placeholder="PO number" class="fld" />
          <button (click)="createAgreement()" [disabled]="busy()" class="w-full h-10 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-1.5">
            <os-icon name="description" [size]="16" /> Create agreement
          </button>
        </div>

        @if (agreements().length) {
          <div class="mt-5 border-t border-border pt-4 space-y-2">
            <p class="text-[12px] uppercase tracking-wider text-faint">Agreements (this session)</p>
            @for (g of agreements(); track g.id) {
              <div class="rounded-xl border border-border p-3 space-y-2">
                <div class="flex items-center justify-between">
                  <p class="text-sm font-semibold text-content">{{ g.bookingNumber ?? g.id.slice(0,8) }}</p>
                  @if (g.status) { <os-status-pill [status]="g.status" /> }
                </div>
                <p class="text-xs text-muted">{{ g.totalBedsConfirmed ?? 0 }}/{{ g.totalBedsRequested }} beds · from {{ g.checkInDate }}</p>
                <div class="grid grid-cols-3 gap-2">
                  <input [(ngModel)]="assign.employeeTenantId" placeholder="Tenant id" class="fld !h-9 col-span-3" />
                  <input [(ngModel)]="assign.bedId" placeholder="Bed id" class="fld !h-9 col-span-2" />
                  <input [(ngModel)]="assignRentRupees" type="number" placeholder="Rent ₹" class="fld !h-9" />
                </div>
                <div class="flex gap-2">
                  <button (click)="assignBed(g)" [disabled]="busy()" class="flex-1 h-9 rounded-lg bg-success text-white text-[13px] font-semibold disabled:opacity-60">Assign bed</button>
                  <button (click)="cancelAgreement(g)" [disabled]="busy()" class="h-9 px-3 rounded-lg border border-danger text-danger text-[13px] font-semibold disabled:opacity-60">Cancel</button>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .fld { width:100%; height:40px; padding:0 12px; border-radius:8px; border:1px solid var(--border);
      background:var(--panel); font-size:14px; color:var(--text-primary); outline:none; }
    .fld:focus { border-color:var(--accent); box-shadow:0 0 0 2px color-mix(in srgb, var(--accent) 15%, transparent); }
  `],
})
export class CorporateComponent {
  private readonly svc = inject(CorporateService);
  private readonly propsSvc = inject(PropertiesService);

  readonly properties = toSignal(this.propsSvc.list(), { initialValue: [] as Property[] });
  readonly accounts = signal<CorporateAccount[]>([]);
  readonly agreements = signal<CorporateAgreement[]>([]);
  readonly busy = signal(false);
  readonly toast = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  acc: CreateAccountPayload = { companyName: '', billingEmail: '', hrContactUserId: '' };
  creditLimitRupees: number | null = null;
  agr: CreateAgreementPayload = { corporateAccountId: '', propertyId: '', hrUserId: '', totalBedsRequested: 1, checkInDate: new Date().toISOString().slice(0, 10) };
  assign = { employeeTenantId: '', bedId: '' };
  assignRentRupees: number | null = null;

  private ok(m: string): void { this.busy.set(false); this.error.set(null); this.toast.set(m); setTimeout(() => this.toast.set(null), 3500); }
  private fail(e: unknown, m: string): void { this.busy.set(false); this.error.set(apiErrorMessage(e, m)); }

  createAccount(): void {
    if (!this.acc.companyName || !this.acc.billingEmail || !this.acc.hrContactUserId) { this.error.set('Company, email and HR contact id are required.'); return; }
    this.busy.set(true); this.error.set(null);
    const dto: CreateAccountPayload = { ...this.acc, creditLimitPaisa: this.creditLimitRupees ? this.creditLimitRupees * 100 : undefined };
    this.svc.createAccount(dto).subscribe({
      next: (a) => { this.accounts.update((l) => [a, ...l]); this.ok(`Account "${a.companyName}" created.`); this.acc = { companyName: '', billingEmail: '', hrContactUserId: '' }; this.creditLimitRupees = null; },
      error: (e) => this.fail(e, 'Could not create account.'),
    });
  }
  useAccount(a: CorporateAccount): void { this.agr.corporateAccountId = a.id; this.agr.hrUserId = a.hrContactUserId; }

  createAgreement(): void {
    if (!this.agr.corporateAccountId || !this.agr.propertyId || !this.agr.hrUserId || !this.agr.totalBedsRequested) { this.error.set('Account, property, HR id and beds are required.'); return; }
    this.busy.set(true); this.error.set(null);
    this.svc.createAgreement({ ...this.agr, totalBedsRequested: Number(this.agr.totalBedsRequested) }).subscribe({
      next: (g) => { this.agreements.update((l) => [g, ...l]); this.ok('Agreement created.'); },
      error: (e) => this.fail(e, 'Could not create agreement.'),
    });
  }

  assignBed(g: CorporateAgreement): void {
    if (!this.assign.employeeTenantId || !this.assign.bedId || !this.assignRentRupees) { this.error.set('Tenant id, bed id and rent are required.'); return; }
    this.busy.set(true); this.error.set(null);
    this.svc.assignBed(g.id, { ...this.assign, rentPaisa: this.assignRentRupees * 100 }).subscribe({
      next: () => { this.ok('Bed assigned to employee.'); this.assign = { employeeTenantId: '', bedId: '' }; this.assignRentRupees = null; this.refreshAgreement(g.id); },
      error: (e) => this.fail(e, 'Could not assign bed.'),
    });
  }
  cancelAgreement(g: CorporateAgreement): void {
    this.busy.set(true); this.error.set(null);
    this.svc.cancelAgreement(g.id, 'Cancelled by operator').subscribe({
      next: () => { this.ok('Agreement cancelled.'); this.refreshAgreement(g.id); },
      error: (e) => this.fail(e, 'Could not cancel agreement.'),
    });
  }
  private refreshAgreement(id: string): void {
    this.svc.agreement(id).subscribe((g) => { if (g) this.agreements.update((l) => l.map((x) => (x.id === id ? g : x))); });
  }
}
