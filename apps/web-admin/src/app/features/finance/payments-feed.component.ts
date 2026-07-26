import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { PaymentsService, ApiPayment, PaymentDetail, paise } from '../../core/data/payments.service';
import { SessionStore } from '../../core/auth/session.store';
import { apiErrorMessage } from '../../core/http/api-error';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { MetricCardComponent } from '../../shared/components/metric-card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { StatusPillComponent } from '../../shared/components/status-pill.component';
import { DrawerShellComponent } from '../../shared/components/drawer-shell.component';
import { IconComponent } from '../../shared/components/icon.component';
import { InrPipe } from '../../shared/pipes/inr.pipe';

type Tab = { id: string; label: string; status?: string };

@Component({
  selector: 'os-payments-feed',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, DatePipe, PageHeaderComponent, MetricCardComponent, EmptyStateComponent,
    LoadingStateComponent, StatusPillComponent, DrawerShellComponent, IconComponent, InrPipe,
  ],
  template: `
    <os-page-header eyebrow="Finance" title="Payments" subtitle="Real-time payment ledger across all properties." />

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
      <os-metric label="Total (page)" [value]="(pageTotal() | inr)" icon="payments" />
      <os-metric label="Successful" [value]="count('SUCCESS') + ''" icon="check_circle" />
      <os-metric label="Pending" [value]="count('PENDING') + count('PROCESSING') + ''" icon="schedule" />
      <os-metric label="Refunded" [value]="count('REFUNDED') + count('PARTIAL') + ''" icon="undo" />
    </div>

    <div class="bg-panel border border-border rounded-[16px] overflow-hidden">
      <div class="flex items-center gap-1 px-3 pt-3 border-b border-border overflow-x-auto">
        @for (t of tabs; track t.id) {
          <button (click)="setTab(t)" class="px-3.5 h-9 text-[13px] font-medium border-b-2 -mb-px whitespace-nowrap transition"
            [class]="tab().id === t.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-content'">{{ t.label }}</button>
        }
        <div class="ml-auto pb-2"><button (click)="reload()" class="h-8 px-3 rounded-lg border border-border text-[13px] text-content hover:bg-canvas flex items-center gap-1.5"><os-icon name="refresh" [size]="15" /> Refresh</button></div>
      </div>

      @if (loading()) {
        <div class="p-5"><os-loading variant="skeleton" /></div>
      } @else if (rows().length === 0) {
        <os-empty-state icon="payments" title="No payments" message="No payments match this filter yet." />
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="text-left text-[12px] uppercase tracking-wider text-faint border-b border-border">
              <th class="px-5 py-3">Payment</th><th class="px-5 py-3">Purpose</th><th class="px-5 py-3 text-right">Amount</th>
              <th class="px-5 py-3">Method</th><th class="px-5 py-3">Status</th><th class="px-5 py-3">Txn ID</th>
              <th class="px-5 py-3">Date</th><th class="px-5 py-3"></th>
            </tr></thead>
            <tbody>
              @for (p of rows(); track p.id) {
                <tr class="border-t border-border-subtle hover:bg-canvas/60 transition">
                  <td class="px-5 py-3 font-medium text-content">{{ p.payment_number }}</td>
                  <td class="px-5 py-3 text-muted">{{ label(p.purpose) }}</td>
                  <td class="px-5 py-3 text-right font-semibold text-content">{{ paisa(p.amount_paisa) | inr }}</td>
                  <td class="px-5 py-3 text-muted">{{ label(p.method) }}</td>
                  <td class="px-5 py-3"><os-status-pill [status]="p.status" /></td>
                  <td class="px-5 py-3 text-faint font-mono text-[12px]">{{ p.gateway_payment_id ?? p.gateway_order_id ?? '—' }}</td>
                  <td class="px-5 py-3 text-muted">{{ (p.paid_at ?? p.created_at) | date:'dd MMM, HH:mm' }}</td>
                  <td class="px-5 py-3 text-right"><button (click)="open(p)" class="h-8 px-3 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas">View</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between px-5 py-3 border-t border-border text-[13px] text-muted">
          <span>{{ total() }} payment(s)</span>
          <div class="flex items-center gap-2">
            <button (click)="prev()" [disabled]="page() <= 1" class="h-8 px-3 rounded-lg border border-border disabled:opacity-40 hover:bg-canvas">Prev</button>
            <span>Page {{ page() }} / {{ totalPages() }}</span>
            <button (click)="next()" [disabled]="page() >= totalPages()" class="h-8 px-3 rounded-lg border border-border disabled:opacity-40 hover:bg-canvas">Next</button>
          </div>
        </div>
      }
    </div>

    <!-- Detail drawer -->
    <os-drawer [open]="!!detail()" [title]="detail()?.payment_number ?? 'Payment'" subtitle="Payment detail" width="480px" (closed)="detail.set(null)">
      @if (detail(); as d) {
        <div class="space-y-5">
          <div class="flex items-center justify-between"><span class="text-sm text-muted">Status</span><os-status-pill [status]="d.status" /></div>
          <div class="rounded-xl border border-border divide-y divide-border-subtle">
            <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Amount</span><span class="text-sm font-semibold text-content">{{ paisa(d.amount_paisa) | inr }}</span></div>
            <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Allocated</span><span class="text-sm text-content">{{ paisa(d.allocated_paisa) | inr }}</span></div>
            <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Refunded</span><span class="text-sm text-content">{{ paisa(d.refunded_paisa) | inr }}</span></div>
            <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Purpose</span><span class="text-sm text-content">{{ label(d.purpose) }} · {{ label(d.method) }}</span></div>
            <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Gateway</span><span class="text-sm text-content">{{ d.gateway }}</span></div>
            @if (d.invoice_id) { <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Invoice</span><span class="text-sm font-mono text-[12px] text-content">{{ d.invoice_id.slice(0,8) }}</span></div> }
          </div>

          <!-- Allocation -->
          @if (d.allocations?.length) {
            <div><p class="text-[12px] uppercase tracking-wider text-faint mb-2">Allocation</p>
              <div class="rounded-xl border border-border divide-y divide-border-subtle">
                @for (a of d.allocations; track a.id) {
                  <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">{{ label(a.component) }}</span><span class="text-sm text-content">{{ paisa(a.amount_paisa) | inr }}</span></div>
                }
              </div>
            </div>
          }

          <!-- Timeline (transactions) -->
          <div><p class="text-[12px] uppercase tracking-wider text-faint mb-2">Timeline</p>
            @if (d.transactions?.length) {
              <ul class="space-y-3">
                @for (t of d.transactions; track t.id) {
                  <li class="flex items-start gap-3">
                    <span class="w-7 h-7 rounded-lg bg-canvas flex items-center justify-center text-muted shrink-0"><os-icon name="bolt" [size]="14" /></span>
                    <div><p class="text-sm text-content">{{ label(t.kind) }}</p><p class="text-[11px] text-faint">{{ t.created_at | date:'dd MMM yyyy, HH:mm' }}{{ t.gateway_ref ? ' · ' + t.gateway_ref : '' }}</p></div>
                  </li>
                }
              </ul>
            } @else { <p class="text-sm text-muted">No transactions.</p> }
          </div>

          <!-- Refund -->
          @if (d.refunds?.length) {
            <div><p class="text-[12px] uppercase tracking-wider text-faint mb-2">Refunds</p>
              <div class="rounded-xl border border-border divide-y divide-border-subtle">
                @for (r of d.refunds; track r.id) {
                  <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">{{ r.refund_number }} · {{ r.status }}</span><span class="text-sm text-content">{{ paisa(r.amount_paisa) | inr }}</span></div>
                }
              </div>
            </div>
          }
        </div>
      }
      <div footer class="w-full space-y-2">
        @if (canRefund() && detail() && (detail()!.status === 'SUCCESS' || detail()!.status === 'PARTIAL')) {
          @if (refundOpen()) {
            <div class="rounded-lg border border-border p-3 space-y-2">
              <input type="number" [(ngModel)]="refundRupees" placeholder="Refund amount (₹)" class="fld" />
              <input [(ngModel)]="refundReason" placeholder="Reason" class="fld" />
              <div class="flex gap-2">
                <button (click)="doRefund()" [disabled]="acting() || !refundRupees" class="flex-1 h-9 rounded-lg bg-danger text-white text-[13px] font-semibold disabled:opacity-60">Confirm refund</button>
                <button (click)="refundOpen.set(false)" class="h-9 px-3 rounded-lg border border-border text-[13px] text-content">Cancel</button>
              </div>
            </div>
          } @else {
            <button (click)="refundOpen.set(true)" class="w-full h-10 rounded-lg border border-danger text-danger text-sm font-semibold">Refund payment</button>
          }
        }
        @if (msg()) { <p class="text-[12px]" [class.text-danger]="err()" [class.text-success]="!err()">{{ msg() }}</p> }
        <button (click)="detail.set(null)" class="w-full h-10 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas">Close</button>
      </div>
    </os-drawer>
  `,
  styles: [`.fld{width:100%;height:38px;padding:0 12px;border-radius:8px;border:1px solid var(--border);background:var(--panel);font-size:14px;color:var(--text-primary);outline:none}.fld:focus{border-color:var(--accent)}`],
})
export class PaymentsFeedComponent {
  private readonly svc = inject(PaymentsService);
  private readonly session = inject(SessionStore);

  protected readonly tabs: Tab[] = [
    { id: 'all', label: 'All' }, { id: 'pending', label: 'Pending', status: 'PENDING' },
    { id: 'paid', label: 'Paid', status: 'SUCCESS' }, { id: 'failed', label: 'Failed', status: 'FAILED' },
    { id: 'refunded', label: 'Refunded', status: 'REFUNDED' },
  ];
  readonly tab = signal<Tab>(this.tabs[0]);
  readonly rows = signal<ApiPayment[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly limit = 20;
  readonly loading = signal(false);
  readonly detail = signal<PaymentDetail | null>(null);
  readonly refundOpen = signal(false);
  readonly acting = signal(false);
  readonly msg = signal<string | null>(null);
  readonly err = signal(false);
  refundRupees: number | null = null;
  refundReason = '';

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.limit)));
  readonly pageTotal = computed(() => this.rows().reduce((s, p) => s + paise(p.amount_paisa), 0));
  readonly canRefund = computed(() => this.session.role() === 'SUPER_ADMIN');

  paisa = paise;
  count(status: string): number { return this.rows().filter((p) => p.status === status).length; }
  label(s?: string): string { return s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '—'; }

  constructor() { this.reload(); }

  setTab(t: Tab): void { this.tab.set(t); this.page.set(1); this.reload(); }
  prev(): void { if (this.page() > 1) { this.page.update((p) => p - 1); this.reload(); } }
  next(): void { if (this.page() < this.totalPages()) { this.page.update((p) => p + 1); this.reload(); } }

  reload(): void {
    this.loading.set(true);
    this.svc.list({ status: this.tab().status, page: this.page(), limit: this.limit }).subscribe((res) => {
      this.rows.set(res.data ?? []);
      this.total.set(res.meta?.total ?? (res.data?.length ?? 0));
      this.loading.set(false);
    });
  }

  open(p: ApiPayment): void {
    this.msg.set(null); this.refundOpen.set(false); this.refundRupees = null; this.refundReason = '';
    this.svc.get(p.id).subscribe((d) => this.detail.set(d));
  }

  doRefund(): void {
    const d = this.detail(); if (!d || !this.refundRupees) return;
    this.acting.set(true); this.msg.set(null);
    this.svc.refund(d.id, Math.round(this.refundRupees * 100), this.refundReason || undefined).subscribe({
      next: (updated) => { this.acting.set(false); this.err.set(false); this.msg.set('Refund processed.'); this.detail.set(updated); this.refundOpen.set(false); this.reload(); },
      error: (e) => { this.acting.set(false); this.err.set(true); this.msg.set(apiErrorMessage(e, 'Refund failed.')); },
    });
  }
}
