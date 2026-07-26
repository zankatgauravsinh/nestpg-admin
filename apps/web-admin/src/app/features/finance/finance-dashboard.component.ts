import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CollectionsApiService, CollectionDashboard, PropertyCollectionRow } from '../../core/data/collections.service';
import { PaymentsService, ApiPayment, paise } from '../../core/data/payments.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { MetricCardComponent } from '../../shared/components/metric-card.component';
import { BarChartComponent } from '../../shared/components/bar-chart.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { StatusPillComponent } from '../../shared/components/status-pill.component';
import { IconComponent } from '../../shared/components/icon.component';
import { InrPipe } from '../../shared/pipes/inr.pipe';

@Component({
  selector: 'os-finance-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe, RouterLink, PageHeaderComponent, MetricCardComponent, BarChartComponent,
    EmptyStateComponent, LoadingStateComponent, StatusPillComponent, IconComponent, InrPipe,
  ],
  template: `
    <os-page-header eyebrow="Finance" title="Finance Overview" subtitle="Live revenue, collections and payments across the portfolio.">
      <div actions class="flex items-center gap-2">
        <a routerLink="/finance/invoices" class="h-9 px-3.5 rounded-lg border border-border text-content text-sm font-semibold hover:bg-canvas flex items-center gap-1.5"><os-icon name="receipt_long" [size]="16" /> Generate invoice</a>
        <a routerLink="/finance/payments" class="h-9 px-3.5 rounded-lg border border-border text-content text-sm font-semibold hover:bg-canvas flex items-center gap-1.5"><os-icon name="add_card" [size]="16" /> Payments</a>
        <button (click)="exportReport()" class="h-9 px-3.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover flex items-center gap-1.5"><os-icon name="download" [size]="16" /> Export</button>
      </div>
    </os-page-header>

    @if (loading()) {
      <os-loading variant="skeleton" />
    } @else {
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <os-metric label="Today's revenue" [value]="(d()?.collectedTodayPaisa ?? 0) | inr" icon="today" />
        <os-metric label="This month" [value]="(d()?.collectedThisMonthPaisa ?? 0) | inr" icon="calendar_month" />
        <os-metric label="Outstanding" [value]="(d()?.expectedCollectionPaisa ?? 0) | inr" icon="account_balance_wallet" />
        <os-metric label="Collection rate" [value]="(d()?.collectionEfficiencyPct ?? 0) + '%'" icon="trending_up" />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <!-- Revenue snapshot chart (no time-series endpoint — see phase-b-api-gaps.md) -->
        <div class="bg-panel border border-border rounded-[16px] p-5">
          <div class="flex items-center justify-between mb-3"><h3 class="text-base font-semibold text-content">Revenue snapshot</h3></div>
          <os-bar-chart [data]="snapshot()" [height]="170" />
          <p class="text-[11px] text-faint mt-2">Point-in-time. Historical trend endpoint not yet available.</p>
        </div>

        <!-- Property revenue breakdown -->
        <div class="lg:col-span-2 bg-panel border border-border rounded-[16px] p-5">
          <h3 class="text-base font-semibold text-content mb-3">Top performing properties</h3>
          @if (topProps().length === 0) {
            <p class="text-sm text-muted py-6 text-center">No collection data yet.</p>
          } @else {
            <div class="space-y-2.5">
              @for (p of topProps(); track p.property_id) {
                <div>
                  <div class="flex justify-between text-sm mb-1"><span class="text-content font-medium">{{ p.property_name }}</span><span class="text-content">{{ paisa(p.collected_paisa) | inr }}</span></div>
                  <div class="h-1.5 rounded-full bg-canvas overflow-hidden"><div class="h-full rounded-full bg-accent" [style.width.%]="barPct(p)"></div></div>
                </div>
              }
            </div>
          }
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Recent payments -->
        <div class="bg-panel border border-border rounded-[16px] p-5">
          <div class="flex items-center justify-between mb-3"><h3 class="text-base font-semibold text-content">Recent payments</h3><a routerLink="/finance/payments" class="text-[13px] text-accent font-medium">View all</a></div>
          @if (recent().length === 0) {
            <os-empty-state icon="payments" title="No payments yet" message="Recorded payments will appear here." />
          } @else {
            <div class="divide-y divide-border-subtle">
              @for (p of recent(); track p.id) {
                <div class="flex items-center justify-between py-2.5">
                  <div><p class="text-sm font-medium text-content">{{ p.payment_number }}</p><p class="text-[11px] text-faint">{{ (p.paid_at ?? p.created_at) | date:'dd MMM, HH:mm' }} · {{ p.method }}</p></div>
                  <div class="flex items-center gap-2"><span class="text-sm font-semibold text-content">{{ paisa(p.amount_paisa) | inr }}</span><os-status-pill [status]="p.status" [dot]="false" /></div>
                </div>
              }
            </div>
          }
        </div>

        <!-- Pending payments + Expenses gap -->
        <div class="space-y-4">
          <div class="bg-panel border border-border rounded-[16px] p-5">
            <div class="flex items-center justify-between mb-3"><h3 class="text-base font-semibold text-content">Pending payments</h3><a routerLink="/finance/payments" class="text-[13px] text-accent font-medium">Review</a></div>
            <div class="flex items-center gap-3"><span class="w-12 h-12 rounded-xl bg-warning-subtle text-warning flex items-center justify-center"><os-icon name="schedule" [size]="24" /></span>
              <div><p class="text-2xl font-semibold text-content">{{ pendingCount() }}</p><p class="text-xs text-muted">awaiting confirmation</p></div></div>
          </div>
          <div class="bg-panel border border-border rounded-[16px] p-5">
            <h3 class="text-base font-semibold text-content mb-1">Expenses</h3>
            <p class="text-sm text-muted">No expense module exists in the backend yet — expenses & expense trends are not available. <span class="text-faint">(documented in phase-b-api-gaps.md)</span></p>
          </div>
        </div>
      </div>
    }
  `,
})
export class FinanceDashboardComponent {
  private readonly collections = inject(CollectionsApiService);
  private readonly payments = inject(PaymentsService);

  readonly loading = signal(true);
  readonly d = signal<CollectionDashboard | null>(null);
  readonly props = signal<PropertyCollectionRow[]>([]);
  readonly recent = signal<ApiPayment[]>([]);
  readonly pendingCount = signal(0);

  paisa = paise;

  readonly topProps = computed(() => [...this.props()].sort((a, b) => paise(b.collected_paisa) - paise(a.collected_paisa)).slice(0, 6));
  readonly snapshot = computed(() => {
    const x = this.d();
    return [
      { label: 'Today', value: (x?.collectedTodayPaisa ?? 0) / 100 },
      { label: 'Month', value: (x?.collectedThisMonthPaisa ?? 0) / 100 },
      { label: 'Outstanding', value: (x?.expectedCollectionPaisa ?? 0) / 100 },
    ];
  });

  barPct(p: PropertyCollectionRow): number {
    const max = Math.max(1, ...this.topProps().map((x) => paise(x.collected_paisa)));
    return Math.round((paise(p.collected_paisa) / max) * 100);
  }

  constructor() {
    this.collections.dashboard().subscribe((d) => { this.d.set(d); this.loading.set(false); });
    this.collections.propertyReport().subscribe((r) => this.props.set(r));
    this.payments.list({ limit: 6 }).subscribe((res) => this.recent.set(res.data ?? []));
    this.payments.list({ status: 'PENDING', limit: 1 }).subscribe((res) => this.pendingCount.set(res.meta?.total ?? (res.data?.length ?? 0)));
  }

  exportReport(): void {
    const rows = [['Property', 'Collected (paise)', 'Outstanding (paise)', 'Overdue invoices'],
      ...this.props().map((p) => [p.property_name, paise(p.collected_paisa), paise(p.outstanding_paisa), p.overdue_invoices])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'finance-report.csv'; a.click(); URL.revokeObjectURL(url);
  }
}
