import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { InvoicesService, ApiInvoice, InvoiceDetail, InvoiceLineInput } from '../../core/data/invoices.service';
import { SessionStore } from '../../core/auth/session.store';
import { apiErrorMessage } from '../../core/http/api-error';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { StatusPillComponent } from '../../shared/components/status-pill.component';
import { DrawerShellComponent } from '../../shared/components/drawer-shell.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { IconComponent } from '../../shared/components/icon.component';
import { InrPipe } from '../../shared/pipes/inr.pipe';

const paisa = (v: number | string | null | undefined) => Number(v ?? 0);
type Tab = { id: string; label: string; status?: string };

@Component({
  selector: 'os-invoices',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, DatePipe, PageHeaderComponent, EmptyStateComponent, LoadingStateComponent,
    StatusPillComponent, DrawerShellComponent, ModalComponent, IconComponent, InrPipe,
  ],
  template: `
    <os-page-header eyebrow="Finance" title="Invoices" subtitle="Issue, track and collect on invoices.">
      <div actions>
        @if (canManage()) {
          <button (click)="openCreate()" class="h-9 px-3.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover flex items-center gap-1.5"><os-icon name="add" [size]="18" /> New invoice</button>
        }
      </div>
    </os-page-header>

    <div class="bg-panel border border-border rounded-[16px] overflow-hidden">
      <div class="flex items-center gap-1 px-3 pt-3 border-b border-border overflow-x-auto">
        @for (t of tabs; track t.id) {
          <button (click)="setTab(t)" class="px-3.5 h-9 text-[13px] font-medium border-b-2 -mb-px whitespace-nowrap transition" [class]="tab().id === t.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-content'">{{ t.label }}</button>
        }
        <div class="ml-auto pb-2 flex items-center gap-2">
          <input [(ngModel)]="search" (ngModelChange)="page.set(1)" placeholder="Search invoice #" class="h-8 px-3 rounded-lg border border-border bg-panel text-[13px] text-content outline-none w-40" />
          <button (click)="reload()" class="h-8 px-3 rounded-lg border border-border text-[13px] text-content hover:bg-canvas flex items-center gap-1.5"><os-icon name="refresh" [size]="15" /> Refresh</button>
        </div>
      </div>

      @if (loading()) {
        <div class="p-5"><os-loading variant="skeleton" /></div>
      } @else if (filtered().length === 0) {
        <os-empty-state icon="receipt_long" title="No invoices" message="No invoices match this filter yet." />
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="text-left text-[12px] uppercase tracking-wider text-faint border-b border-border">
              <th class="px-5 py-3">Invoice</th><th class="px-5 py-3">Due</th><th class="px-5 py-3 text-right">Total</th>
              <th class="px-5 py-3 text-right">Balance</th><th class="px-5 py-3">Status</th><th class="px-5 py-3"></th>
            </tr></thead>
            <tbody>
              @for (i of filtered(); track i.id) {
                <tr class="border-t border-border-subtle hover:bg-canvas/60 transition">
                  <td class="px-5 py-3 font-medium text-content">{{ i.invoiceNumber }}</td>
                  <td class="px-5 py-3 text-muted">{{ i.dueDate | date:'dd MMM yyyy' }}</td>
                  <td class="px-5 py-3 text-right font-semibold text-content">{{ paisa(i.totalPaisa) | inr }}</td>
                  <td class="px-5 py-3 text-right" [class.text-danger]="paisa(i.balancePaisa) > 0">{{ paisa(i.balancePaisa) | inr }}</td>
                  <td class="px-5 py-3"><os-status-pill [status]="i.status" /></td>
                  <td class="px-5 py-3 text-right"><button (click)="open(i)" class="h-8 px-3 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas">View</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between px-5 py-3 border-t border-border text-[13px] text-muted">
          <span>{{ total() }} invoice(s)</span>
          <div class="flex items-center gap-2">
            <button (click)="prev()" [disabled]="page() <= 1" class="h-8 px-3 rounded-lg border border-border disabled:opacity-40 hover:bg-canvas">Prev</button>
            <span>Page {{ page() }} / {{ totalPages() }}</span>
            <button (click)="next()" [disabled]="page() >= totalPages()" class="h-8 px-3 rounded-lg border border-border disabled:opacity-40 hover:bg-canvas">Next</button>
          </div>
        </div>
      }
    </div>

    <!-- Detail drawer -->
    <os-drawer [open]="!!detail()" [title]="detail()?.invoiceNumber ?? 'Invoice'" subtitle="Invoice detail" width="520px" (closed)="detail.set(null)">
      @if (detail(); as d) {
        <div class="space-y-5">
          <div class="flex items-center justify-between"><span class="text-sm text-muted">Status</span><os-status-pill [status]="d.status" /></div>

          <div><p class="text-[12px] uppercase tracking-wider text-faint mb-2">Line items</p>
            <div class="rounded-xl border border-border overflow-hidden">
              <table class="w-full text-[13px]">
                <thead><tr class="text-left text-faint border-b border-border-subtle"><th class="px-3 py-2">Item</th><th class="px-3 py-2 text-center">Qty</th><th class="px-3 py-2 text-right">Amount</th></tr></thead>
                <tbody>
                  @for (l of d.lines; track l.id) {
                    <tr class="border-b border-border-subtle"><td class="px-3 py-2 text-content">{{ l.description }}</td><td class="px-3 py-2 text-center text-muted">{{ l.quantity }}</td><td class="px-3 py-2 text-right text-content">{{ paisa(l.amountPaisa) | inr }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <div class="rounded-xl border border-border divide-y divide-border-subtle">
            <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">Subtotal</span><span class="text-sm text-content">{{ paisa(d.subtotalPaisa) | inr }}</span></div>
            <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">Tax</span><span class="text-sm text-content">{{ paisa(d.taxPaisa) | inr }}</span></div>
            <div class="flex justify-between px-4 py-2"><span class="text-sm font-medium text-content">Total</span><span class="text-sm font-semibold text-content">{{ paisa(d.totalPaisa) | inr }}</span></div>
            <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">Paid</span><span class="text-sm text-success">{{ paisa(d.paidPaisa) | inr }}</span></div>
            <div class="flex justify-between px-4 py-2"><span class="text-sm font-medium text-content">Balance due</span><span class="text-sm font-semibold" [class.text-danger]="paisa(d.balancePaisa) > 0">{{ paisa(d.balancePaisa) | inr }}</span></div>
          </div>

          @if (d.payments?.length) {
            <div><p class="text-[12px] uppercase tracking-wider text-faint mb-2">Payments applied</p>
              <div class="rounded-xl border border-border divide-y divide-border-subtle">
                @for (p of d.payments; track p.id) { <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">{{ p.createdAt | date:'dd MMM yyyy' }}</span><span class="text-sm text-content">{{ paisa(p.amountPaisa) | inr }}</span></div> }
              </div>
            </div>
          }
        </div>
      }
      <div footer class="w-full flex flex-wrap gap-2">
        @if (detail()?.status === 'DRAFT' && canManage()) {
          <button (click)="issue()" [disabled]="acting()" class="flex-1 h-10 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-60">Issue</button>
        }
        <button (click)="downloadPdf()" [disabled]="pdfLoading()" class="h-10 px-3 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas flex items-center gap-1.5">
          @if (pdfLoading()) { <span class="w-4 h-4 rounded-full border-2 border-border border-t-accent animate-spin"></span> } <os-icon name="picture_as_pdf" [size]="16" /> PDF
        </button>
        @if (detail() && detail()!.status !== 'PAID' && detail()!.status !== 'VOID' && paisa(detail()!.paidPaisa) === 0 && canManage()) {
          <button (click)="voidInvoice()" [disabled]="acting()" class="h-10 px-3 rounded-lg border border-danger text-danger text-sm font-medium disabled:opacity-60">Void</button>
        }
        @if (detail() && detail()!.status !== 'PAID' && detail()!.status !== 'VOID' && paisa(detail()!.paidPaisa) > 0 && canManage()) {
          <p class="w-full text-[12px] text-muted" data-testid="void-blocked">Payments have been applied to this invoice, so it can't be voided.</p>
        }
        <button (click)="detail.set(null)" class="h-10 px-3 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas">Close</button>
      </div>
    </os-drawer>

    <!-- Create invoice modal -->
    <os-modal [open]="showCreate()" title="New invoice" subtitle="Create a draft invoice with line items" width="560px" (closed)="showCreate.set(false)">
      <form id="invForm" class="space-y-3" (ngSubmit)="submitCreate()">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="lbl">Customer user id *</label><input name="cust" [(ngModel)]="form.customerUserId" required placeholder="UUID" class="fld" /></div>
          <div><label class="lbl">Due date *</label><input name="due" type="date" [(ngModel)]="form.dueDate" required class="fld" /></div>
        </div>
        <div><label class="lbl">Property id</label><input name="prop" [(ngModel)]="form.propertyId" placeholder="UUID (optional)" class="fld" /></div>
        <div class="space-y-2">
          <label class="lbl">Line items *</label>
          @for (l of form.lines; track $index) {
            <div class="grid grid-cols-12 gap-2">
              <input [(ngModel)]="l.description" [name]="'d'+$index" placeholder="Description" class="fld col-span-6" />
              <select [(ngModel)]="l.kind" [name]="'k'+$index" class="fld col-span-2">@for (k of kinds; track k) { <option [value]="k">{{ k }}</option> }</select>
              <input [(ngModel)]="l.qty" [name]="'q'+$index" type="number" placeholder="Qty" class="fld col-span-1" />
              <input [(ngModel)]="l.rupees" [name]="'a'+$index" type="number" placeholder="₹/unit" class="fld col-span-2" />
              <button type="button" (click)="removeLine($index)" class="col-span-1 text-faint hover:text-danger"><os-icon name="close" [size]="16" /></button>
            </div>
          }
          <button type="button" (click)="addLine()" class="text-[13px] text-accent font-medium">+ Add line</button>
        </div>
        @if (createErr()) { <p class="text-[13px] text-danger flex items-center gap-1.5"><os-icon name="error" [size]="15" /> {{ createErr() }}</p> }
      </form>
      <div footer>
        <button (click)="showCreate.set(false)" class="h-9 px-4 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas">Cancel</button>
        <button type="submit" form="invForm" [disabled]="saving()" class="h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-60 flex items-center gap-2">
          @if (saving()) { <span class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span> } Create draft
        </button>
      </div>
    </os-modal>

    @if (toast()) { <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] bg-[var(--primary-container)] text-white text-sm px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2"><os-icon name="check_circle" [size]="18" /> {{ toast() }}</div> }
  `,
  styles: [`.lbl{display:block;font-size:12px;font-weight:500;color:var(--text-secondary);margin-bottom:6px}.fld{width:100%;height:38px;padding:0 10px;border-radius:8px;border:1px solid var(--border);background:var(--panel);font-size:13px;color:var(--text-primary);outline:none}.fld:focus{border-color:var(--accent)}`],
})
export class InvoicesComponent {
  private readonly svc = inject(InvoicesService);
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionStore);

  protected readonly tabs: Tab[] = [
    { id: 'all', label: 'All' }, { id: 'issued', label: 'Issued', status: 'ISSUED' }, { id: 'partial', label: 'Partial', status: 'PARTIAL' },
    { id: 'paid', label: 'Paid', status: 'PAID' }, { id: 'overdue', label: 'Overdue', status: 'OVERDUE' }, { id: 'void', label: 'Void', status: 'VOID' },
  ];
  protected readonly kinds = ['RENT', 'DEPOSIT', 'UTILITY', 'PENALTY', 'OTHER'];

  readonly tab = signal<Tab>(this.tabs[0]);
  readonly rows = signal<ApiInvoice[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly limit = 20;
  readonly loading = signal(false);
  readonly detail = signal<InvoiceDetail | null>(null);
  readonly acting = signal(false);
  readonly pdfLoading = signal(false);
  readonly toast = signal<string | null>(null);
  readonly search = signal('');

  readonly showCreate = signal(false);
  readonly saving = signal(false);
  readonly createErr = signal<string | null>(null);
  protected form = this.blankForm();

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.limit)));
  /** Invoice create/issue/void is FINANCIAL_OPERATIONS (A3). */
  readonly canManage = computed(() => this.session.hasCapability('FINANCIAL_OPERATIONS'));
  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    return q ? this.rows().filter((i) => i.invoiceNumber.toLowerCase().includes(q)) : this.rows();
  });

  paisa = paisa;
  constructor() { this.reload(); }

  setTab(t: Tab): void { this.tab.set(t); this.page.set(1); this.reload(); }
  prev(): void { if (this.page() > 1) { this.page.update((p) => p - 1); this.reload(); } }
  next(): void { if (this.page() < this.totalPages()) { this.page.update((p) => p + 1); this.reload(); } }

  reload(): void {
    this.loading.set(true);
    this.svc.list({ status: this.tab().status, page: this.page(), limit: this.limit }).subscribe((res) => {
      this.rows.set(res.data ?? []); this.total.set(res.meta?.total ?? (res.data?.length ?? 0)); this.loading.set(false);
    });
  }

  open(i: ApiInvoice): void { this.svc.get(i.id).subscribe((d) => this.detail.set(d)); }

  issue(): void {
    const d = this.detail(); if (!d) return;
    this.acting.set(true);
    this.svc.issue(d.id).subscribe({ next: (u) => { this.acting.set(false); this.detail.set(u); this.flash('Invoice issued.'); this.reload(); }, error: (e) => { this.acting.set(false); this.flash(apiErrorMessage(e, 'Could not issue.')); } });
  }
  voidInvoice(): void {
    const d = this.detail(); if (!d) return;
    this.acting.set(true);
    this.svc.void(d.id).subscribe({ next: (u) => { this.acting.set(false); this.detail.set(u); this.flash('Invoice voided.'); this.reload(); }, error: (e) => { this.acting.set(false); this.flash(apiErrorMessage(e, 'Could not void.')); } });
  }
  downloadPdf(): void {
    const d = this.detail(); if (!d) return;
    this.pdfLoading.set(true);
    this.http.get(this.svc.pdfUrl(d.id), { responseType: 'blob' }).subscribe({
      next: (blob) => { this.pdfLoading.set(false); const url = URL.createObjectURL(blob); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 30000); },
      error: () => { this.pdfLoading.set(false); this.flash('Could not load PDF.'); },
    });
  }

  // create
  private blankForm() { return { customerUserId: '', dueDate: new Date().toISOString().slice(0, 10), propertyId: '', lines: [{ description: '', kind: 'RENT', qty: 1, rupees: null as number | null }] }; }
  openCreate(): void { this.form = this.blankForm(); this.createErr.set(null); this.showCreate.set(true); }
  addLine(): void { this.form.lines.push({ description: '', kind: 'RENT', qty: 1, rupees: null }); }
  removeLine(i: number): void { this.form.lines.splice(i, 1); }
  submitCreate(): void {
    const f = this.form;
    const lines: InvoiceLineInput[] = f.lines.filter((l) => l.description && l.rupees).map((l) => ({ kind: l.kind, description: l.description, quantity: Number(l.qty) || 1, unitPaisa: Math.round(Number(l.rupees) * 100) }));
    if (!f.customerUserId || !f.dueDate || !lines.length) { this.createErr.set('Customer, due date and at least one line are required.'); return; }
    this.saving.set(true); this.createErr.set(null);
    this.svc.create({ customerUserId: f.customerUserId, dueDate: f.dueDate, propertyId: f.propertyId || undefined, lines }).subscribe({
      next: () => { this.saving.set(false); this.showCreate.set(false); this.flash('Draft invoice created.'); this.reload(); },
      error: (e) => { this.saving.set(false); this.createErr.set(apiErrorMessage(e, 'Could not create invoice.')); },
    });
  }

  private flash(m: string): void { this.toast.set(m); setTimeout(() => this.toast.set(null), 3000); }
}
