import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe } from '@angular/common';
import { interval } from 'rxjs';
import { ObservabilityService, SystemMetrics, SystemBusiness, OpsAlert } from '../../core/data/observability.service';
import { IconComponent } from '../../shared/components/icon.component';
import { StatusPillComponent } from '../../shared/components/status-pill.component';
import { InrPipe } from '../../shared/pipes/inr.pipe';

/**
 * RC3 System Dashboard (Operations Center) — a single live operations surface
 * (merges the "System Dashboard" + "Operations Center" briefs; one screen, no
 * duplicate). Reads the RC3 observability endpoints only. Signals-only state,
 * 30s auto-refresh that pauses while a modal is open.
 */
@Component({
  selector: 'os-system-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, IconComponent, StatusPillComponent, InrPipe],
  template: `
    <div class="flex items-center justify-between mb-5">
      <div>
        <h1 class="text-[26px] font-semibold tracking-tight text-content">Operations Center</h1>
        <p class="text-sm text-muted mt-1">Live platform health, traffic, queues &amp; business metrics.</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="h-9 px-3 rounded-lg border text-[13px] font-medium flex items-center gap-1.5"
          [class]="paused() ? 'border-border text-muted' : 'border-success/40 text-success bg-success-subtle'">
          <span class="w-2 h-2 rounded-full" [class]="paused() ? 'bg-faint' : 'bg-success animate-pulse'"></span>
          {{ paused() ? 'Paused' : 'Live' }}
        </span>
        @if (updated(); as u) { <span class="text-[11px] text-faint">Updated {{ u | date:'HH:mm:ss' }}</span> }
        <button (click)="refresh()" [disabled]="loading()" class="h-9 px-3 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas flex items-center gap-1.5 disabled:opacity-50">
          <os-icon name="refresh" [size]="15" /> Refresh
        </button>
      </div>
    </div>

    <!-- Alerts -->
    @if (alerts().length) {
      <div class="grid gap-2 mb-5">
        @for (a of alerts(); track a.source + a.message) {
          <div class="flex items-center gap-2.5 rounded-lg px-3 py-2 border" [class]="alertClass(a.level)">
            <os-icon [name]="alertIcon(a.level)" [size]="16" />
            <span class="text-[13px] font-semibold">{{ a.level }}</span>
            <span class="text-[13px]">{{ a.message }}</span>
            <span class="text-[11px] opacity-70 ml-auto">{{ a.source }}</span>
          </div>
        }
      </div>
    }

    @if (metrics(); as m) {
      <!-- Health -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div class="bg-panel border border-border rounded-xl p-4">
          <p class="text-[11px] uppercase tracking-wider text-faint mb-1">Database</p>
          <os-status-pill [status]="m.database.status === 'up' ? 'ACTIVE' : 'FAILED'" />
          <p class="text-[12px] text-muted mt-2">{{ m.database.activeConnections ?? 0 }} active · {{ m.database.idleConnections ?? 0 }} idle</p>
        </div>
        <div class="bg-panel border border-border rounded-xl p-4">
          <p class="text-[11px] uppercase tracking-wider text-faint mb-1">Redis</p>
          <os-status-pill [status]="m.redis.status === 'up' ? 'ACTIVE' : 'FAILED'" />
          <p class="text-[12px] text-muted mt-2">{{ m.redis.connectedClients ?? 0 }} clients · {{ m.redis.usedMemory ?? '—' }} · {{ m.redis.opsPerSec ?? 0 }} ops/s</p>
        </div>
        <div class="bg-panel border border-border rounded-xl p-4">
          <p class="text-[11px] uppercase tracking-wider text-faint mb-1">Storage</p>
          <os-status-pill [status]="m.storage.status === 'up' ? 'ACTIVE' : 'FAILED'" />
          <p class="text-[12px] text-muted mt-2">{{ m.storage.presign }} presign · {{ m.storage.uploadSuccess }} ok · {{ m.storage.uploadFailure }} fail</p>
        </div>
        <div class="bg-panel border border-border rounded-xl p-4">
          <p class="text-[11px] uppercase tracking-wider text-faint mb-1">Traffic</p>
          <p class="text-lg font-semibold text-content">{{ m.api.totals.requests | number }} <span class="text-[12px] text-muted font-normal">req</span></p>
          <p class="text-[12px] text-muted mt-1">avg {{ m.api.totals.avgMs }}ms · p95 {{ m.api.totals.p95Ms }}ms · p99 {{ m.api.totals.p99Ms }}ms · {{ m.api.totals.errors }} err</p>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
        <!-- Top routes -->
        <div class="bg-panel border border-border rounded-[16px] p-5">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-faint mb-3">Top Endpoints</p>
          @if (m.api.routes.length) {
            <div class="rounded-xl border border-border divide-y divide-border-subtle overflow-hidden">
              <div class="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-1.5 text-[10px] uppercase tracking-wider text-faint bg-canvas">
                <span>Route</span><span>Count</span><span>p95</span><span>Err</span>
              </div>
              @for (r of m.api.routes.slice(0, 8); track r.method + r.route) {
                <div class="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-3 py-1.5 text-[12px]">
                  <span class="text-content truncate"><span class="text-faint">{{ r.method }}</span> {{ r.route }}</span>
                  <span class="text-muted text-right">{{ r.count }}</span>
                  <span class="text-muted text-right">{{ r.p95Ms }}ms</span>
                  <span class="text-right" [class]="r.errors ? 'text-danger' : 'text-faint'">{{ r.errors }}</span>
                </div>
              }
            </div>
          } @else { <p class="text-sm text-muted py-4 text-center">No traffic recorded yet.</p> }
        </div>

        <!-- Queues -->
        <div class="bg-panel border border-border rounded-[16px] p-5">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-faint mb-3">Queues &amp; Jobs</p>
          <div class="flex gap-4 mb-3 text-[13px]">
            <span class="text-muted">Outbox:</span>
            <span class="text-content">{{ m.queues.outbox.pending }} pending</span>
            <span [class]="m.queues.outbox.failed ? 'text-danger' : 'text-success'">{{ m.queues.outbox.failed }} failed</span>
            <span class="text-faint">{{ m.queues.outbox.delivered }} delivered</span>
          </div>
          @if (m.queues.jobs.length) {
            <div class="rounded-xl border border-border divide-y divide-border-subtle">
              @for (j of m.queues.jobs; track j.name) {
                <div class="flex items-center gap-2 px-3 py-1.5 text-[12px]">
                  <span class="text-content truncate flex-1">{{ j.name }}</span>
                  <os-status-pill [status]="jobStatus(j.lastStatus)" [dot]="false" />
                  <span class="text-faint">{{ j.lastDurationMs ?? '—' }}ms</span>
                  @if (j.failureCount) { <span class="text-danger">{{ j.failureCount }} fail</span> }
                </div>
              }
            </div>
          } @else { <p class="text-sm text-muted py-4 text-center">No job runs recorded since restart.</p> }
        </div>
      </div>
    } @else if (loading()) {
      <p class="text-sm text-muted py-10 text-center">Loading system metrics…</p>
    } @else {
      <p class="text-sm text-danger py-10 text-center">Metrics unavailable — requires SUPER_ADMIN / OPS_ADMIN.</p>
    }

    <!-- Business -->
    @if (business(); as b) {
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div class="bg-panel border border-border rounded-xl px-4 py-3"><p class="text-[10px] uppercase tracking-wider text-faint">Users</p><p class="text-lg font-semibold text-content">{{ b.platform.total_users | number }}</p><p class="text-[10px] text-faint">{{ b.platform.owners }} owners · {{ b.platform.residents }} residents</p></div>
        <div class="bg-panel border border-border rounded-xl px-4 py-3"><p class="text-[10px] uppercase tracking-wider text-faint">Inventory</p><p class="text-lg font-semibold text-content">{{ b.platform.properties }}·{{ b.platform.rooms }}·{{ b.platform.beds }}</p><p class="text-[10px] text-faint">prop · rooms · beds</p></div>
        <div class="bg-panel border border-border rounded-xl px-4 py-3"><p class="text-[10px] uppercase tracking-wider text-faint">Occupancy</p><p class="text-lg font-semibold text-[var(--primary-container)]">{{ b.occupancy.occupancyPct }}%</p><p class="text-[10px] text-faint">{{ b.occupancy.occupied }} occ · {{ b.occupancy.available }} free</p></div>
        <div class="bg-panel border border-border rounded-xl px-4 py-3"><p class="text-[10px] uppercase tracking-wider text-faint">Today</p><p class="text-lg font-semibold text-content">{{ b.today.check_ins }}/{{ b.today.check_outs }}</p><p class="text-[10px] text-faint">in / out · {{ b.today.bookings }} bookings</p></div>
        <div class="bg-panel border border-border rounded-xl px-4 py-3"><p class="text-[10px] uppercase tracking-wider text-faint">Revenue Today</p><p class="text-lg font-semibold text-content">{{ num(b.today.revenue_paisa) | inr }}</p><p class="text-[10px] text-faint">{{ b.today.payments }} payments</p></div>
        <div class="bg-panel border border-border rounded-xl px-4 py-3"><p class="text-[10px] uppercase tracking-wider text-faint">Outstanding</p><p class="text-lg font-semibold" [class]="num(b.finance.outstanding_paisa) ? 'text-danger' : 'text-content'">{{ num(b.finance.outstanding_paisa) | inr }}</p><p class="text-[10px] text-faint">{{ b.finance.overdue_invoices }} overdue</p></div>
        <div class="bg-panel border border-border rounded-xl px-4 py-3"><p class="text-[10px] uppercase tracking-wider text-faint">Visitors Inside</p><p class="text-lg font-semibold text-content">{{ b.ops.visitors_inside }}</p></div>
        <div class="bg-panel border border-border rounded-xl px-4 py-3"><p class="text-[10px] uppercase tracking-wider text-faint">Pending KYC</p><p class="text-lg font-semibold text-content">{{ b.ops.pending_kyc }}</p></div>
        <div class="bg-panel border border-border rounded-xl px-4 py-3"><p class="text-[10px] uppercase tracking-wider text-faint">Review Queue</p><p class="text-lg font-semibold text-content">{{ b.ops.review_queue }}</p></div>
        <div class="bg-panel border border-border rounded-xl px-4 py-3"><p class="text-[10px] uppercase tracking-wider text-faint">Notif Queue</p><p class="text-lg font-semibold text-content">{{ b.ops.notification_queue }}</p></div>
      </div>
    }
  `,
})
export class SystemDashboardComponent {
  private readonly obs = inject(ObservabilityService);
  private readonly destroyRef = inject(DestroyRef);

  readonly metrics = signal<SystemMetrics | null>(null);
  readonly business = signal<SystemBusiness | null>(null);
  readonly alerts = signal<OpsAlert[]>([]);
  readonly loading = signal(false);
  readonly updated = signal<Date | null>(null);
  /** Set true to pause auto-refresh (e.g. while a modal is open). */
  readonly paused = signal(false);
  private inFlight = false;

  constructor() {
    this.refresh();
    interval(30000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (!this.paused() && !this.inFlight && (typeof document === 'undefined' || !document.hidden)) this.refresh();
    });
  }

  refresh(): void {
    this.inFlight = true;
    this.loading.set(true);
    this.obs.metrics().subscribe((m) => { if (m) this.metrics.set(m); this.loading.set(false); this.inFlight = false; this.updated.set(new Date()); });
    this.obs.business().subscribe((b) => { if (b) this.business.set(b); });
    this.obs.alerts().subscribe((a) => this.alerts.set(a?.alerts ?? []));
  }

  num = (v: unknown) => Number(v ?? 0);
  jobStatus(s: string | null): string { return s === 'SUCCESS' ? 'ACTIVE' : s === 'FAILURE' ? 'FAILED' : s === 'RUNNING' ? 'PENDING' : 'INACTIVE'; }
  alertIcon(l: string): string { return l === 'CRITICAL' ? 'error' : l === 'WARNING' ? 'warning' : 'check_circle'; }
  alertClass(l: string): string {
    return l === 'CRITICAL' ? 'border-danger/40 bg-danger-subtle text-danger'
      : l === 'WARNING' ? 'border-warning/40 bg-warning-subtle text-warning'
      : 'border-success/40 bg-success-subtle text-success';
  }
}
