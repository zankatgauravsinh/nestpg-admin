import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { SessionStore } from '../../core/auth/session.store';
import { PropertiesService } from '../../core/data/properties.service';
import { DashboardService } from '../../core/data/dashboard.service';
import { Property } from '../../core/data/models';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { MetricCardComponent } from '../../shared/components/metric-card.component';
import { IconComponent } from '../../shared/components/icon.component';
import { InsightChipComponent } from '../../shared/components/insight-chip.component';
import { InrPipe } from '../../shared/pipes/inr.pipe';

/** GET /admin/ops/metrics (OperationalMetricsService). Rates are fractions in [0, 1]. */
interface OpsMetrics {
  reservationSuccessRate: number; bookingSuccessRate: number; outboxDeliveryRate: number;
  failedEvents: number; pendingEvents: number; relayLagMinutes: number;
}

@Component({
  selector: 'os-super-admin-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, MetricCardComponent, IconComponent, InsightChipComponent, InrPipe],
  template: `
    <os-page-header eyebrow="Platform" title="Command Center"
      subtitle="Platform-wide inventory, revenue and operational health across NestPG.">
      <div actions>
        @if (canReadOps) {
          <os-insight-chip icon="circle" [tone]="status().tone" data-testid="ops-status">{{ status().label }}</os-insight-chip>
        }
      </div>
    </os-page-header>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <os-metric label="Properties" [value]="properties().length" icon="domain" />
      <os-metric label="Total Beds" [value]="totalBeds()" icon="bed" />
      <os-metric label="Platform Revenue" [value]="revenue() | inr" icon="payments" />
      <os-metric label="Occupancy" [value]="occRate() + '%'" icon="pie_chart" />
    </div>

    @if (canReadOps) {
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- Operational health — every figure from GET /admin/ops/metrics; nothing is invented. -->
        <div class="lg:col-span-2 bg-panel border border-border rounded-[16px] p-5">
          <h3 class="text-base font-semibold text-content mb-4">Event delivery</h3>
          @if (ops(); as m) {
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="ops-health">
              @for (s of health(); track s.label) {
                <div class="rounded-xl border border-border p-4">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-[11px] uppercase tracking-wider text-faint">{{ s.label }}</span>
                    <span class="w-2 h-2 rounded-full" [class]="s.ok ? 'bg-success' : 'bg-danger'"></span>
                  </div>
                  <p class="text-lg font-semibold text-content">{{ s.value }}</p>
                </div>
              }
            </div>
          } @else {
            <p class="text-sm text-muted" data-testid="ops-unavailable">Operational metrics are unavailable right now.</p>
          }
          <p class="text-xs text-faint mt-4 flex items-center gap-1.5">
            <os-icon name="info" [size]="14" /> Live from <code class="text-muted">/admin/ops/metrics</code>.
          </p>
        </div>

        <!-- Conversion — rates over all reservations / bookings to date. -->
        <div class="bg-panel border border-border rounded-[16px] p-5">
          <h3 class="text-base font-semibold text-content mb-4">Conversion</h3>
          @if (ops()) {
            <div class="space-y-4" data-testid="ops-conversion">
              @for (t of throughput(); track t.label) {
                <div>
                  <div class="flex justify-between text-sm mb-1.5">
                    <span class="text-muted">{{ t.label }}</span>
                    <span class="font-semibold text-content">{{ t.pct }}%</span>
                  </div>
                  <div class="h-1.5 rounded-full bg-canvas overflow-hidden">
                    <div class="h-full rounded-full" [class]="t.color" [style.width.%]="t.pct"></div>
                  </div>
                </div>
              }
            </div>
          } @else {
            <p class="text-sm text-muted">—</p>
          }
        </div>
      </div>
    }
  `,
})
export class SuperAdminDashboardComponent {
  private readonly api = inject(ApiService);
  private readonly propsSvc = inject(PropertiesService);
  private readonly dash = inject(DashboardService);
  private readonly session = inject(SessionStore);
  /** GET /admin/ops/metrics is SUPER_ADMIN / OPS_ADMIN only on the server; never ask for it otherwise. */
  protected readonly canReadOps = ['SUPER_ADMIN', 'OPS_ADMIN'].includes(this.session.backendRole() ?? '');

  readonly properties = toSignal(this.propsSvc.list(), { initialValue: [] as Property[] });
  private readonly occ = toSignal(this.dash.occupancy(), { initialValue: null });
  private readonly rev = toSignal(this.dash.revenue(), { initialValue: null });
  private readonly metrics = toSignal(
    this.canReadOps ? this.api.get<OpsMetrics>('/admin/ops/metrics').pipe(catchError(() => of(null))) : of(null),
    { initialValue: null },
  );

  // Prefer aggregate dashboard endpoints; fall back to property-list sums.
  readonly totalBeds = computed(() => this.occ()?.totalBeds ?? this.properties().reduce((s, p) => s + p.totalBeds, 0));
  readonly occupied = computed(() => this.occ()?.occupiedBeds ?? this.properties().reduce((s, p) => s + p.occupiedBeds, 0));
  readonly revenue = computed(() => this.rev()?.total ?? this.properties().reduce((s, p) => s + p.monthlyRevenuePaise, 0));
  readonly occRate = computed(() => {
    if (this.occ()?.ratePct != null) return Math.round((this.occ()!.ratePct + Number.EPSILON) * 10) / 10;
    return this.totalBeds() ? Math.round((this.occupied() / this.totalBeds()) * 100) : 0;
  });

  /** The live metrics, or null when unavailable / not permitted. */
  readonly ops = computed<OpsMetrics | null>(() => {
    const m = this.metrics() as Partial<OpsMetrics> | null;
    return m && typeof m.outboxDeliveryRate === 'number' ? (m as OpsMetrics) : null;
  });

  readonly health = computed(() => {
    const m = this.ops();
    if (!m) return [];
    return [
      { label: 'Delivered', value: `${pct(m.outboxDeliveryRate)}%`, ok: m.failedEvents === 0 },
      { label: 'Failed events', value: String(m.failedEvents), ok: m.failedEvents === 0 },
      { label: 'Pending events', value: String(m.pendingEvents), ok: m.relayLagMinutes < 5 },
      { label: 'Oldest pending', value: m.pendingEvents ? `${m.relayLagMinutes} min` : '—', ok: m.relayLagMinutes < 5 },
    ];
  });

  readonly throughput = computed(() => {
    const m = this.ops();
    if (!m) return [];
    return [
      { label: 'Holds that became bookings', pct: pct(m.reservationSuccessRate), color: 'bg-accent' },
      { label: 'Bookings confirmed or later', pct: pct(m.bookingSuccessRate), color: 'bg-info' },
      { label: 'Events delivered', pct: pct(m.outboxDeliveryRate), color: 'bg-success' },
    ];
  });

  /** Header chip from the real metrics — never a fixed "All systems operational". */
  readonly status = computed<{ label: string; tone: 'success' | 'warning' | 'danger' }>(() => {
    const m = this.ops();
    if (!m) return { label: 'Metrics unavailable', tone: 'warning' };
    if (m.failedEvents > 0) return { label: `${m.failedEvents} failed event${m.failedEvents === 1 ? '' : 's'}`, tone: 'danger' };
    if (m.relayLagMinutes >= 5) return { label: `Event delivery lagging ${m.relayLagMinutes} min`, tone: 'warning' };
    return { label: 'Event delivery healthy', tone: 'success' };
  });
}

const pct = (fraction: number) => Math.round(fraction * 1000) / 10;
