import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DashboardService } from '../../core/data/dashboard.service';
import { PropertiesService } from '../../core/data/properties.service';
import { Property } from '../../core/data/models';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { MetricCardComponent } from '../../shared/components/metric-card.component';
import { BarChartComponent, ChartPoint } from '../../shared/components/bar-chart.component';
import { IconComponent } from '../../shared/components/icon.component';
import { InrPipe } from '../../shared/pipes/inr.pipe';

@Component({
  selector: 'os-revenue-analytics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, MetricCardComponent, BarChartComponent, IconComponent, InrPipe],
  template: `
    <os-page-header eyebrow="Analytics" title="Revenue"
      subtitle="Revenue trends, collection performance and breakdowns.">
      <div actions>
        <button class="h-9 px-3.5 rounded-lg border border-border text-sm font-medium text-content hover:bg-panel transition flex items-center gap-1.5">
          <os-icon name="download" [size]="18" /> Export
        </button>
      </div>
    </os-page-header>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <os-metric label="Monthly Revenue" [value]="total() | inr" icon="payments" [trend]="growth()" />
      <os-metric label="Collected" [value]="collected() | inr" icon="account_balance_wallet" [trend]="5.2" />
      <os-metric label="Outstanding" [value]="outstanding() | inr" icon="warning" [trend]="-2.1" trendLabel="overdue" />
      <os-metric label="Collection Rate" [value]="rate() + '%'" icon="trending_up" [trend]="1.4" />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 bg-panel border border-border rounded-[16px] p-5">
        <h3 class="text-base font-semibold text-content mb-4">Revenue trend</h3>
        <os-bar-chart [data]="series()" [height]="220" />
      </div>
      <div class="bg-panel border border-border rounded-[16px] p-5">
        <h3 class="text-base font-semibold text-content mb-4">By property</h3>
        <div class="space-y-3">
          @for (p of properties(); track p.id) {
            <div>
              <div class="flex justify-between text-sm mb-1"><span class="text-muted truncate">{{ p.name }}</span><span class="font-medium text-content">{{ p.monthlyRevenuePaise | inr }}</span></div>
              <div class="h-1.5 rounded-full bg-canvas overflow-hidden"><div class="h-full bg-accent rounded-full" [style.width.%]="share(p)"></div></div>
            </div>
          } @empty { <p class="text-sm text-muted py-4 text-center">No property revenue to display.</p> }
        </div>
      </div>
    </div>
  `,
})
export class RevenueAnalyticsComponent {
  private readonly dash = inject(DashboardService);
  private readonly propsSvc = inject(PropertiesService);
  private readonly data = toSignal(this.dash.revenue(), { initialValue: null });
  readonly properties = toSignal(this.propsSvc.list(), { initialValue: [] as Property[] });

  readonly total = computed(() => this.data()?.total ?? this.properties().reduce((s, p) => s + p.monthlyRevenuePaise, 0));
  readonly collected = computed(() => this.data()?.collected ?? Math.round(this.total() * 0.94));
  readonly outstanding = computed(() => this.data()?.outstanding ?? this.total() - this.collected());
  readonly growth = computed(() => this.data()?.growthPct ?? 8.6);
  readonly rate = computed(() => (this.total() ? Math.round((this.collected() / this.total()) * 100) : 0));

  readonly series = computed<ChartPoint[]>(() => {
    const s = this.data()?.series;
    if (s?.length) return s.map((p) => ({ label: p.label, value: p.value }));
    const base = this.total() / 100 || 100;
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((m, i) => ({ label: m, value: base * (0.78 + i * 0.06) }));
  });

  share(p: Property): number {
    const max = Math.max(1, ...this.properties().map((x) => x.monthlyRevenuePaise));
    return Math.round((p.monthlyRevenuePaise / max) * 100);
  }
}
