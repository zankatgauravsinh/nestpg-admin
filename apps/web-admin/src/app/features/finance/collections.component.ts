import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { CollectionsApiService, CollectionDashboard, RecoveryRow, PropertyCollectionRow, AgingBucket } from '../../core/data/collections.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { MetricCardComponent } from '../../shared/components/metric-card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { StatusPillComponent } from '../../shared/components/status-pill.component';
import { DrawerShellComponent } from '../../shared/components/drawer-shell.component';
import { IconComponent } from '../../shared/components/icon.component';
import { InrPipe } from '../../shared/pipes/inr.pipe';

const paisa = (v: number | string | null | undefined) => Number(v ?? 0);
const BUCKETS: { key: string; label: string; tone: string }[] = [
  { key: 'CURRENT', label: 'Current', tone: 'bg-success' },
  { key: 'D1_30', label: '1–30 days', tone: 'bg-info' },
  { key: 'D31_60', label: '31–60 days', tone: 'bg-warning' },
  { key: 'D61_90', label: '61–90 days', tone: 'bg-[#c2410c]' },
  { key: 'D90_PLUS', label: '90+ days', tone: 'bg-danger' },
];

@Component({
  selector: 'os-collections',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe, PageHeaderComponent, MetricCardComponent, EmptyStateComponent, LoadingStateComponent,
    StatusPillComponent, DrawerShellComponent, IconComponent, InrPipe,
  ],
  template: `
    <os-page-header eyebrow="Finance" title="Collections" subtitle="Outstanding, aging and recovery across your portfolio." />

    @if (loading()) {
      <os-loading variant="skeleton" />
    } @else {
      <!-- Cards -->
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
        <os-metric label="Expected (outstanding)" [value]="(d()?.expectedCollectionPaisa ?? 0) | inr" icon="account_balance_wallet" />
        <os-metric label="Collected today" [value]="(d()?.collectedTodayPaisa ?? 0) | inr" icon="today" />
        <os-metric label="Collected this month" [value]="(d()?.collectedThisMonthPaisa ?? 0) | inr" icon="calendar_month" />
        <os-metric label="Overdue residents" [value]="(d()?.overdueResidents ?? 0) + ''" icon="person_alert" />
        <os-metric label="Collection rate" [value]="(d()?.collectionEfficiencyPct ?? 0) + '%'" icon="trending_up" />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- Aging -->
        <div class="bg-panel border border-border rounded-[16px] p-5">
          <h3 class="text-base font-semibold text-content mb-4">Aging buckets</h3>
          <div class="space-y-3">
            @for (b of buckets(); track b.key) {
              <div>
                <div class="flex justify-between text-sm mb-1"><span class="text-muted">{{ b.label }}</span><span class="font-medium text-content">{{ b.amountPaisa | inr }} <span class="text-faint">· {{ b.count }}</span></span></div>
                <div class="h-1.5 rounded-full bg-canvas overflow-hidden"><div class="h-full rounded-full" [class]="b.tone" [style.width.%]="b.pct"></div></div>
              </div>
            }
          </div>
        </div>

        <!-- Property report -->
        <div class="lg:col-span-2 bg-panel border border-border rounded-[16px] p-5">
          <h3 class="text-base font-semibold text-content mb-4">Property collections</h3>
          @if (report().length === 0) {
            <p class="text-sm text-muted py-6 text-center">No collection data yet.</p>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead><tr class="text-left text-[12px] uppercase tracking-wider text-faint border-b border-border"><th class="py-2 pr-4">Property</th><th class="py-2 pr-4 text-right">Collected</th><th class="py-2 pr-4 text-right">Outstanding</th><th class="py-2 text-right">Overdue</th></tr></thead>
                <tbody>
                  @for (r of report(); track r.property_id) {
                    <tr class="border-t border-border-subtle"><td class="py-2.5 pr-4 font-medium text-content">{{ r.property_name }}</td><td class="py-2.5 pr-4 text-right text-success">{{ paisa(r.collected_paisa) | inr }}</td><td class="py-2.5 pr-4 text-right" [class.text-danger]="paisa(r.outstanding_paisa) > 0">{{ paisa(r.outstanding_paisa) | inr }}</td><td class="py-2.5 text-right text-muted">{{ r.overdue_invoices }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </div>

      <!-- Recovery queue -->
      <div class="bg-panel border border-border rounded-[16px] overflow-hidden mt-4">
        <div class="flex items-center justify-between px-5 py-3 border-b border-border"><h3 class="text-base font-semibold text-content">Recovery queue</h3><span class="text-xs text-muted">{{ recovery().length }} overdue</span></div>
        @if (recovery().length === 0) {
          <os-empty-state icon="task_alt" title="All clear" message="No overdue invoices needing recovery." />
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead><tr class="text-left text-[12px] uppercase tracking-wider text-faint border-b border-border"><th class="px-5 py-3">Resident</th><th class="px-5 py-3">Invoice</th><th class="px-5 py-3">Due</th><th class="px-5 py-3 text-right">Balance</th><th class="px-5 py-3 text-center">Overdue</th><th class="px-5 py-3 text-center">Reminders</th><th class="px-5 py-3"></th></tr></thead>
              <tbody>
                @for (r of recovery(); track r.id) {
                  <tr class="border-t border-border-subtle hover:bg-canvas/60 transition">
                    <td class="px-5 py-3 font-medium text-content">{{ r.customer_name }}</td>
                    <td class="px-5 py-3 text-muted">{{ r.invoice_number }}</td>
                    <td class="px-5 py-3 text-muted">{{ r.due_date | date:'dd MMM' }}</td>
                    <td class="px-5 py-3 text-right font-semibold text-danger">{{ paisa(r.balance_paisa) | inr }}</td>
                    <td class="px-5 py-3 text-center"><os-status-pill [status]="r.days_overdue + 'd overdue'" tone="danger" [dot]="false" /></td>
                    <td class="px-5 py-3 text-center text-muted">{{ r.reminders_sent }}</td>
                    <td class="px-5 py-3">
                      <div class="flex items-center justify-end gap-2">
                        <button (click)="remind(r)" [disabled]="reminding() === r.id" class="h-8 px-3 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas disabled:opacity-50">Remind</button>
                        <button (click)="openTimeline(r)" class="h-8 px-3 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas">Timeline</button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    }

    <!-- Resident timeline drawer -->
    <os-drawer [open]="!!timeline()" [title]="timelineName()" subtitle="Collection timeline" width="460px" (closed)="timeline.set(null)">
      @if (timeline(); as t) {
        <div class="space-y-5">
          <div><p class="text-[12px] uppercase tracking-wider text-faint mb-2">Invoices</p>
            @if (asRows(t.invoices).length) { <div class="rounded-xl border border-border divide-y divide-border-subtle">
              @for (i of asRows(t.invoices); track i['id']) { <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">{{ i['invoice_number'] }} · {{ i['status'] }}</span><span class="text-sm text-content">{{ paisa(num(i['balance_paisa'])) | inr }}</span></div> }
            </div> } @else { <p class="text-sm text-muted">No invoices.</p> }
          </div>
          <div><p class="text-[12px] uppercase tracking-wider text-faint mb-2">Payments</p>
            @if (asRows(t.payments).length) { <div class="rounded-xl border border-border divide-y divide-border-subtle">
              @for (p of asRows(t.payments); track p['id']) { <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">{{ p['payment_number'] }}</span><span class="text-sm text-success">{{ paisa(num(p['amount_paisa'])) | inr }}</span></div> }
            </div> } @else { <p class="text-sm text-muted">No payments.</p> }
          </div>
          <div><p class="text-[12px] uppercase tracking-wider text-faint mb-2">Reminders</p>
            @if (asRows(t.reminders).length) { <ul class="space-y-2">
              @for (rm of asRows(t.reminders); track $index) { <li class="flex items-center gap-2 text-sm"><os-icon name="notifications" [size]="14" class="text-muted" /> <span class="text-content">{{ rm['stage'] }}</span> <span class="text-faint">· {{ rm['status'] }}</span></li> }
            </ul> } @else { <p class="text-sm text-muted">No reminders sent.</p> }
          </div>
        </div>
      }
    </os-drawer>

    @if (toast()) { <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] bg-[var(--primary-container)] text-white text-sm px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2"><os-icon name="check_circle" [size]="18" /> {{ toast() }}</div> }
  `,
})
export class CollectionsComponent {
  private readonly svc = inject(CollectionsApiService);

  readonly loading = signal(true);
  readonly d = signal<CollectionDashboard | null>(null);
  readonly recovery = signal<RecoveryRow[]>([]);
  readonly report = signal<PropertyCollectionRow[]>([]);
  readonly reminding = signal<string | null>(null);
  readonly toast = signal<string | null>(null);
  readonly timeline = signal<{ invoices: unknown[]; payments: unknown[]; reminders: unknown[] } | null>(null);
  readonly timelineName = signal('Resident');

  readonly buckets = computed(() => {
    const aging = this.d()?.aging ?? {};
    const max = Math.max(1, ...Object.values(aging).map((b: AgingBucket) => b.amountPaisa));
    return BUCKETS.map((b) => { const a = aging[b.key] ?? { count: 0, amountPaisa: 0 }; return { ...b, count: a.count, amountPaisa: a.amountPaisa, pct: Math.round((a.amountPaisa / max) * 100) }; });
  });

  paisa = paisa;
  num = (v: unknown) => Number(v ?? 0);
  asRows = (a: unknown[]) => (a ?? []) as Record<string, unknown>[];

  constructor() { this.load(); }

  private load(): void {
    this.loading.set(true);
    this.svc.dashboard().subscribe((d) => { this.d.set(d); this.loading.set(false); });
    this.svc.recoveryQueue().subscribe((r) => this.recovery.set(r));
    this.svc.propertyReport().subscribe((r) => this.report.set(r));
  }

  remind(r: RecoveryRow): void {
    this.reminding.set(r.id);
    this.svc.remind(r.id).subscribe({
      next: () => { this.reminding.set(null); this.flash(`Reminder sent to ${r.customer_name}.`); this.svc.recoveryQueue().subscribe((q) => this.recovery.set(q)); },
      error: (e) => { this.reminding.set(null); this.flash(apiErrorMessage(e, 'Could not send reminder.')); },
    });
  }

  openTimeline(r: RecoveryRow): void {
    this.timelineName.set(r.customer_name);
    this.svc.timeline(r.customer_user_id).subscribe((t) => this.timeline.set(t ?? { invoices: [], payments: [], reminders: [] }));
  }

  private flash(m: string): void { this.toast.set(m); setTimeout(() => this.toast.set(null), 3000); }
}
