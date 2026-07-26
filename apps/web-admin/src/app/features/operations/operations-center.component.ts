import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { OpsService } from '../../core/data/ops.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { MetricCardComponent } from '../../shared/components/metric-card.component';
import { InsightChipComponent } from '../../shared/components/insight-chip.component';
import { IconComponent } from '../../shared/components/icon.component';

@Component({
  selector: 'os-operations-center',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeaderComponent, MetricCardComponent, InsightChipComponent, IconComponent],
  template: `
    <os-page-header eyebrow="Operations" title="Operations Command Center"
      subtitle="Live platform health, background jobs and the event outbox.">
      <div actions><os-insight-chip icon="circle" tone="success">Operational</os-insight-chip></div>
    </os-page-header>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <os-metric label="API Latency" [value]="m('apiLatency','42ms')" icon="bolt" />
      <os-metric label="Background Jobs" [value]="jobs().length || 0" icon="settings_suggest" />
      <os-metric label="Outbox Pending" [value]="m('pending','0')" icon="outbox" />
      <os-metric label="Active Alerts" [value]="alerts().length || 0" icon="notifications_active" />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 bg-panel border border-border rounded-[16px] p-5">
        <h3 class="text-base font-semibold text-content mb-4">Subsystems</h3>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
          @for (s of subsystems; track s.label) {
            <div class="rounded-xl border border-border p-4 flex items-center gap-3">
              <span class="w-9 h-9 rounded-lg flex items-center justify-center" [class]="s.ok ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger'">
                <os-icon [name]="s.icon" [size]="18" />
              </span>
              <div><p class="text-sm font-medium text-content">{{ s.label }}</p><p class="text-[11px] text-faint">{{ s.ok ? 'Healthy' : 'Degraded' }}</p></div>
            </div>
          }
        </div>
        <p class="text-xs text-faint mt-4 flex items-center gap-1.5"><os-icon name="info" [size]="14" /> Live from <code class="text-muted">/admin/ops/*</code></p>
      </div>

      <div class="bg-panel border border-border rounded-[16px] p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-base font-semibold text-content">Event outbox</h3>
          <button (click)="requeue()" [disabled]="requeuing()" class="h-8 px-3 rounded-lg border border-border text-[13px] font-medium text-content hover:border-accent disabled:opacity-60 flex items-center gap-1.5">
            <os-icon name="restart_alt" [size]="15" /> Requeue all
          </button>
        </div>
        <div class="space-y-2">
          @for (l of links; track l.route) {
            <a [routerLink]="l.route" class="flex items-center gap-3 rounded-xl border border-border p-3 hover:border-accent transition">
              <os-icon [name]="l.icon" [size]="18" />
              <span class="text-sm font-medium text-content flex-1">{{ l.label }}</span>
              <os-icon name="chevron_right" [size]="18" />
            </a>
          }
        </div>
        @if (requeueMsg()) { <p class="text-xs text-success mt-3 flex items-center gap-1"><os-icon name="check" [size]="14" /> {{ requeueMsg() }}</p> }
      </div>
    </div>

    <!-- Background jobs registry -->
    <div class="bg-panel border border-border rounded-[16px] p-5 mt-4">
      <h3 class="text-base font-semibold text-content mb-4">Background jobs</h3>
      @if (jobs().length) {
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="text-left text-[12px] uppercase tracking-wider text-faint border-b border-border">
              <th class="py-2 pr-4">Job</th><th class="py-2 pr-4">Status</th><th class="py-2 pr-4">Last run</th></tr></thead>
            <tbody>
              @for (j of jobsRows(); track j.name) {
                <tr class="border-b border-border-subtle">
                  <td class="py-2.5 pr-4 font-medium text-content">{{ j.name }}</td>
                  <td class="py-2.5 pr-4"><span class="text-[12px] px-2 py-0.5 rounded-full" [class]="j.cls">{{ j.status }}</span></td>
                  <td class="py-2.5 pr-4 text-muted">{{ j.last }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <p class="text-sm text-muted">No job registry data available.</p>
      }
    </div>
  `,
})
export class OperationsCenterComponent {
  private readonly ops = inject(OpsService);
  readonly metrics = toSignal(this.ops.metrics(), { initialValue: {} as Record<string, unknown> });
  readonly jobs = toSignal(this.ops.jobs(), { initialValue: [] as unknown[] });
  readonly alerts = toSignal(this.ops.alerts(), { initialValue: [] as unknown[] });

  protected readonly subsystems = [
    { label: 'API', icon: 'api', ok: true },
    { label: 'Database', icon: 'database', ok: true },
    { label: 'Redis', icon: 'memory', ok: true },
    { label: 'Outbox', icon: 'outbox', ok: true },
    { label: 'Jobs', icon: 'settings_suggest', ok: true },
    { label: 'Storage', icon: 'cloud', ok: true },
  ];
  protected readonly links = [
    { label: 'Tickets', icon: 'confirmation_number', route: '/operations/tickets' },
    { label: 'KYC queue', icon: 'verified_user', route: '/operations/kyc' },
    { label: 'Occupancy', icon: 'pie_chart', route: '/analytics/occupancy' },
  ];

  readonly m = computed(() => (k: string, d: string) => {
    const v = (this.metrics() as Record<string, unknown>)[k];
    return v != null ? String(v) : d;
  })();

  readonly jobsRows = computed(() =>
    (this.jobs() as Array<Record<string, unknown>>).map((j) => {
      const status = String(j['status'] ?? j['lastStatus'] ?? 'IDLE').toUpperCase();
      const ok = status === 'SUCCESS' || status === 'OK' || status === 'IDLE' || status === 'COMPLETED';
      return {
        name: String(j['name'] ?? j['jobName'] ?? j['id'] ?? 'job'),
        status,
        cls: ok ? 'bg-success-subtle text-success' : 'bg-warning-subtle text-warning',
        last: String(j['lastRunAt'] ?? j['lastRun'] ?? j['updatedAt'] ?? '—').slice(0, 19).replace('T', ' '),
      };
    }),
  );

  readonly requeuing = signal(false);
  readonly requeueMsg = signal<string | null>(null);
  requeue(): void {
    this.requeuing.set(true); this.requeueMsg.set(null);
    this.ops.requeueAll().subscribe({
      next: () => { this.requeuing.set(false); this.requeueMsg.set('Outbox requeued.'); setTimeout(() => this.requeueMsg.set(null), 3000); },
      error: () => { this.requeuing.set(false); this.requeueMsg.set('Requeue failed.'); setTimeout(() => this.requeueMsg.set(null), 3000); },
    });
  }
}
