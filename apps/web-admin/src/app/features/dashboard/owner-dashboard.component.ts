import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { DashboardService } from '../../core/data/dashboard.service';
import { PropertiesService } from '../../core/data/properties.service';
import { Property } from '../../core/data/models';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { MetricCardComponent } from '../../shared/components/metric-card.component';
import { BarChartComponent, ChartPoint } from '../../shared/components/bar-chart.component';
import { DonutComponent } from '../../shared/components/donut.component';
import { IconComponent } from '../../shared/components/icon.component';
import { StatusPillComponent } from '../../shared/components/status-pill.component';
import { InrPipe } from '../../shared/pipes/inr.pipe';

@Component({
  selector: 'os-owner-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, PageHeaderComponent, MetricCardComponent, BarChartComponent,
    DonutComponent, IconComponent, StatusPillComponent, InrPipe,
  ],
  template: `
    <os-page-header eyebrow="Workspace" title="Owner Dashboard"
      subtitle="Portfolio performance, revenue health and payouts across your properties.">
      <div actions>
        <button class="h-9 px-3.5 rounded-lg border border-border text-sm font-medium text-content hover:bg-panel transition flex items-center gap-1.5">
          <os-icon name="calendar_month" [size]="18" /> This month
        </button>
        <button class="h-9 px-3.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition flex items-center gap-1.5">
          <os-icon name="download" [size]="18" /> Export
        </button>
      </div>
    </os-page-header>

    <!-- KPI row -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <os-metric label="Monthly Revenue" [value]="rev() | inr" icon="payments" [trend]="growth()" />
      <os-metric label="Portfolio Occupancy" [value]="occRate() + '%'" icon="bed" [trend]="3.1" />
      <os-metric label="Collected" [value]="collected() | inr" icon="account_balance_wallet" [trend]="5.2" />
      <os-metric label="Outstanding" [value]="outstanding() | inr" icon="warning" [trend]="-2.4" trendLabel="overdue" />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      <!-- Revenue vs expenses -->
      <div class="lg:col-span-2 bg-panel border border-border rounded-[16px] p-5">
        <div class="flex items-center justify-between mb-5">
          <div>
            <h3 class="text-base font-semibold text-content">Revenue trend</h3>
            <p class="text-xs text-muted">Last 6 months</p>
          </div>
          <div class="flex items-center gap-4 text-xs">
            <span class="flex items-center gap-1.5 text-muted"><span class="w-2.5 h-2.5 rounded-sm bg-accent"></span> Revenue</span>
            <span class="flex items-center gap-1.5 text-muted"><span class="w-2.5 h-2.5 rounded-sm bg-[var(--primary-container)] opacity-60"></span> Expenses</span>
          </div>
        </div>
        <os-bar-chart [data]="series()" [paired]="true" [height]="200" />
      </div>

      <!-- Occupancy gauge -->
      <div class="bg-panel border border-border rounded-[16px] p-5 flex flex-col items-center justify-center text-center">
        <h3 class="text-base font-semibold text-content self-start mb-4">Occupancy</h3>
        <os-donut [value]="occRate()" label="occupied" [size]="150" [stroke]="12" />
        <div class="grid grid-cols-2 gap-3 w-full mt-5">
          <div class="rounded-xl bg-canvas p-3">
            <p class="text-lg font-semibold text-content">{{ occupied() }}</p>
            <p class="text-[11px] text-faint">Occupied beds</p>
          </div>
          <div class="rounded-xl bg-canvas p-3">
            <p class="text-lg font-semibold text-content">{{ totalBeds() - occupied() }}</p>
            <p class="text-[11px] text-faint">Vacant beds</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Property performance -->
    <div class="bg-panel border border-border rounded-[16px] overflow-hidden">
      <div class="flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 class="text-base font-semibold text-content">Property performance</h3>
        <a routerLink="/properties" class="text-sm text-accent font-medium hover:underline">View all</a>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-[11px] uppercase tracking-wider text-faint bg-canvas">
              <th class="px-5 py-2.5 font-medium">Property</th>
              <th class="px-5 py-2.5 font-medium">City</th>
              <th class="px-5 py-2.5 font-medium">Occupancy</th>
              <th class="px-5 py-2.5 font-medium">Revenue</th>
              <th class="px-5 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            @for (p of properties(); track p.id) {
              <tr class="border-t border-border-subtle hover:bg-canvas/60 transition">
                <td class="px-5 py-3 font-medium text-content">{{ p.name }}</td>
                <td class="px-5 py-3 text-muted">{{ p.city }}</td>
                <td class="px-5 py-3">
                  <div class="flex items-center gap-2">
                    <div class="w-24 h-1.5 rounded-full bg-canvas overflow-hidden">
                      <div class="h-full bg-accent rounded-full" [style.width.%]="pct(p)"></div>
                    </div>
                    <span class="text-xs text-muted">{{ pct(p) }}%</span>
                  </div>
                </td>
                <td class="px-5 py-3 font-medium text-content">{{ p.monthlyRevenuePaise | inr }}</td>
                <td class="px-5 py-3">
                  <os-status-pill [status]="pct(p) >= 90 ? 'APPROVED' : 'PENDING'"
                    [label]="pct(p) >= 90 ? 'Healthy' : 'Monitor'" />
                </td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="px-5 py-8 text-center text-muted text-sm">No properties found.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class OwnerDashboardComponent {
  private readonly dash = inject(DashboardService);
  private readonly propsSvc = inject(PropertiesService);

  private readonly revenueData = toSignal(this.dash.revenue(), { initialValue: null });
  private readonly occupancyData = toSignal(this.dash.occupancy(), { initialValue: null });
  readonly properties = toSignal(this.propsSvc.list(), { initialValue: [] as Property[] });

  // Revenue (API → fallback derived from properties)
  readonly rev = computed(() => this.revenueData()?.total ?? this.sum((p) => p.monthlyRevenuePaise));
  readonly collected = computed(() => this.revenueData()?.collected ?? Math.round(this.rev() * 0.94));
  readonly outstanding = computed(() => this.revenueData()?.outstanding ?? this.rev() - this.collected());
  readonly growth = computed(() => this.revenueData()?.growthPct ?? 8.6);

  // Occupancy
  readonly totalBeds = computed(() => this.occupancyData()?.totalBeds ?? this.sum((p) => p.totalBeds));
  readonly occupied = computed(() => this.occupancyData()?.occupiedBeds ?? this.sum((p) => p.occupiedBeds));
  readonly occRate = computed(() => {
    if (this.occupancyData()?.ratePct != null) return Math.round(this.occupancyData()!.ratePct!);
    const t = this.totalBeds();
    return t ? Math.round((this.occupied() / t) * 100) : 0;
  });

  readonly series = computed<ChartPoint[]>(() => {
    const s = this.revenueData()?.series;
    if (s?.length) return s.map((p) => ({ label: p.label, value: p.value, value2: p.value * 0.62 }));
    const base = this.rev() / 100 || 100;
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((m, i) => ({
      label: m, value: base * (0.8 + i * 0.05), value2: base * (0.5 + i * 0.03),
    }));
  });

  private sum(f: (p: Property) => number): number {
    return this.properties().reduce((s, p) => s + f(p), 0);
  }
  pct(p: Property): number {
    return p.totalBeds ? Math.round((p.occupiedBeds / p.totalBeds) * 100) : 0;
  }
}
