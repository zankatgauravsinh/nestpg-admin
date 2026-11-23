import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DashboardService } from '../../core/data/dashboard.service';
import { PropertiesService } from '../../core/data/properties.service';
import { Property } from '../../core/data/models';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { MetricCardComponent } from '../../shared/components/metric-card.component';
import { DonutComponent } from '../../shared/components/donut.component';

@Component({
  selector: 'os-occupancy-analytics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, MetricCardComponent, DonutComponent],
  template: `
    <os-page-header eyebrow="Analytics" title="Occupancy"
      subtitle="Occupancy rates, vacancy risk and trends across the portfolio." />

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <os-metric label="Portfolio Occupancy" [value]="rate() + '%'" icon="pie_chart" />
      <os-metric label="Total Beds" [value]="totalBeds()" icon="bed" />
      <os-metric label="Occupied" [value]="occupied()" icon="groups" />
      <os-metric label="Vacant" [value]="totalBeds() - occupied()" icon="meeting_room" />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="bg-panel border border-border rounded-[16px] p-5 flex flex-col items-center">
        <h3 class="text-base font-semibold text-content self-start mb-4">Overall</h3>
        <os-donut [value]="rate()" label="occupied" [size]="170" [stroke]="14" />
      </div>
      <div class="lg:col-span-2 bg-panel border border-border rounded-[16px] p-5">
        <h3 class="text-base font-semibold text-content mb-4">Occupancy by property</h3>
        <div class="space-y-4">
          @for (p of properties(); track p.id) {
            <div>
              <div class="flex justify-between text-sm mb-1.5"><span class="text-muted truncate">{{ p.name }}</span><span class="font-medium text-content">{{ pct(p) }}%</span></div>
              <div class="h-2 rounded-full bg-canvas overflow-hidden">
                <div class="h-full rounded-full" [class]="pct(p) >= 90 ? 'bg-success' : pct(p) >= 70 ? 'bg-accent' : 'bg-warning'" [style.width.%]="pct(p)"></div>
              </div>
            </div>
          } @empty { <p class="text-sm text-muted py-4 text-center">No occupancy data to display.</p> }
        </div>
      </div>
    </div>
  `,
})
export class OccupancyAnalyticsComponent {
  private readonly dash = inject(DashboardService);
  private readonly propsSvc = inject(PropertiesService);
  private readonly data = toSignal(this.dash.occupancy(), { initialValue: null });
  readonly properties = toSignal(this.propsSvc.list(), { initialValue: [] as Property[] });

  readonly totalBeds = computed(() => this.data()?.totalBeds ?? this.properties().reduce((s, p) => s + p.totalBeds, 0));
  readonly occupied = computed(() => this.data()?.occupiedBeds ?? this.properties().reduce((s, p) => s + p.occupiedBeds, 0));
  readonly rate = computed(() => {
    if (this.data()?.ratePct != null) return Math.round(this.data()!.ratePct!);
    return this.totalBeds() ? Math.round((this.occupied() / this.totalBeds()) * 100) : 0;
  });
  pct(p: Property): number { return p.totalBeds ? Math.round((p.occupiedBeds / p.totalBeds) * 100) : 0; }
}
