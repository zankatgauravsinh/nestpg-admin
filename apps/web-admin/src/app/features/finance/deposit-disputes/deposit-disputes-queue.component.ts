import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  AdminDispute, DepositDisputesService, DisputeStatus, DisputeTargetType, DISPUTE_TARGET_TYPES,
} from '../../../core/data/deposit-disputes.service';
import { apiErrorInfo } from '../../../core/http/api-error-info';
import { StatusPillComponent } from '../../../shared/components/status-pill.component';
import {
  disputeErrorCopy, EFFECT_STATE_LABEL, effectState, FINDING_LABEL, SIDE_LABEL, STATUS_LABEL, STATUS_TONE, TARGET_LABEL, shortId,
} from './dispute-copy';

const PAGE_SIZE = 20;
const STATUSES: ReadonlyArray<DisputeStatus | 'ALL'> = ['OPEN', 'RESOLVED', 'WITHDRAWN', 'ALL'];

/**
 * ADM-D.1 — the deposit-dispute queue (`GET /admin/deposit-disputes`).
 *
 *  • Filters are exactly the backend's: status, target type, booking, property (the
 *    last two arrive as deep-link query params). No text search, no client filtering.
 *  • Order is the server's (OPEN first, newest first); rows are rendered as received.
 *  • Pages come from `meta.total` (the envelope has no totalPages).
 *  • Loading, error and empty are three distinct states — a failure is never "no cases".
 */
@Component({
  selector: 'os-deposit-disputes-queue',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, StatusPillComponent],
  template: `
    <div class="p-4 sm:p-6 max-w-[1400px] mx-auto">
      <header class="mb-5">
        <p class="text-[11px] font-semibold tracking-wider text-accent uppercase">Finance</p>
        <h1 class="text-2xl font-bold text-content">Deposit disputes</h1>
        <p class="text-sm text-muted mt-1">An open case pauses deposit refund execution for its booking until it is resolved or withdrawn.</p>
      </header>

      <div class="flex flex-wrap items-end gap-3 mb-4" data-testid="queue-filters">
        <div role="group" aria-label="Status" class="flex rounded-lg border border-border overflow-hidden">
          @for (s of statuses; track s) {
            <button type="button" (click)="setStatus(s)" [attr.aria-pressed]="status() === s" [attr.data-testid]="'status-' + s"
                    class="h-9 px-3 text-[13px] focus-visible:ring-2 focus-visible:ring-accent"
                    [class]="status() === s ? 'bg-accent text-white font-semibold' : 'bg-panel text-content'">
              {{ s === 'ALL' ? 'All' : statusLabel[s] }}
            </button>
          }
        </div>
        <div>
          <label for="dq-target" class="block text-[12px] text-muted mb-1">Target type</label>
          <select id="dq-target" [value]="targetType() ?? ''" (change)="setTarget($any($event.target).value)" data-testid="target-filter"
                  class="h-9 rounded-lg border border-border bg-panel px-2 text-[13px] text-content">
            <option value="">All types</option>
            @for (t of targetTypes; track t) { <option [value]="t">{{ targetLabel[t] }}</option> }
          </select>
        </div>
        @if (bookingId()) {
          <button type="button" (click)="clearParam('bookingId')" data-testid="chip-booking"
                  class="h-8 px-3 rounded-full border border-border text-[12px] text-content">Booking {{ short(bookingId()) }} ✕</button>
        }
        @if (propertyId()) {
          <button type="button" (click)="clearParam('propertyId')" data-testid="chip-property"
                  class="h-8 px-3 rounded-full border border-border text-[12px] text-content">Property {{ short(propertyId()) }} ✕</button>
        }
        <button type="button" (click)="load()" data-testid="queue-refresh"
                class="h-9 px-3 rounded-lg border border-border text-[13px] text-content ml-auto">Refresh</button>
      </div>

      @if (loading()) {
        <div data-testid="queue-loading" role="status" class="rounded-xl border border-border bg-panel p-10 text-center text-sm text-muted">Loading deposit disputes…</div>
      } @else if (error(); as err) {
        <div data-testid="queue-error" role="alert" class="rounded-xl border border-danger/40 bg-danger-subtle p-8 text-center">
          <p class="text-sm font-semibold text-content">The dispute queue could not be loaded.</p>
          <p class="text-sm text-muted">{{ err }}</p>
          <button type="button" (click)="load()" class="mt-4 h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold">Try again</button>
        </div>
      } @else if (!rows().length) {
        <div data-testid="queue-empty" class="rounded-xl border border-border bg-panel p-10 text-center text-sm text-muted">
          {{ status() === 'OPEN' ? 'No open deposit disputes.' : 'No deposit disputes match these filters.' }}
        </div>
      } @else {
        <div class="rounded-xl border border-border bg-panel overflow-x-auto">
          <table class="w-full text-[13px]" data-testid="queue-table">
            <caption class="sr-only">Deposit disputes</caption>
            <thead class="text-left text-muted border-b border-border">
              <tr>
                <th scope="col" class="px-4 py-2 font-medium">Booking</th>
                <th scope="col" class="px-4 py-2 font-medium">Status</th>
                <th scope="col" class="px-4 py-2 font-medium">About</th>
                <th scope="col" class="px-4 py-2 font-medium">Opened by</th>
                <th scope="col" class="px-4 py-2 font-medium">Opened</th>
                <th scope="col" class="px-4 py-2 font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody>
              @for (d of rows(); track d.id) {
                <tr class="border-b border-border-subtle last:border-0" [attr.data-testid]="'row-' + d.id">
                  <td class="px-4 py-2.5">
                    <a [routerLink]="['/finance/deposit-disputes', d.id]" class="font-medium text-accent underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-accent rounded">
                      {{ d.bookingNumber ?? short(d.bookingId) }}
                    </a>
                    @if (d.bookingStatus) { <span class="block text-[11px] text-faint">{{ d.bookingStatus }}</span> }
                  </td>
                  <td class="px-4 py-2.5"><os-status-pill [status]="d.status" [label]="statusLabel[d.status]" /></td>
                  <td class="px-4 py-2.5">{{ targetLabel[d.targetType] }}@if (d.target.deductionId) { <span class="text-muted"> · one deduction</span> }</td>
                  <td class="px-4 py-2.5">{{ sideLabel[d.openedSide] }}</td>
                  <td class="px-4 py-2.5 whitespace-nowrap">{{ d.createdAt | date: 'd MMM y, HH:mm' }}</td>
                  <td class="px-4 py-2.5" [attr.data-testid]="'outcome-' + d.id">
                    @if (d.status === 'RESOLVED' && d.finding) {
                      {{ findingLabel[d.finding] }} · <span [class]="state(d) === 'pending' ? 'text-warning font-medium' : 'text-muted'">{{ stateLabel[state(d)] }}</span>
                    } @else { <span class="text-faint">—</span> }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between mt-3">
          <p class="text-[13px] text-muted" data-testid="queue-count">{{ total() }} {{ total() === 1 ? 'case' : 'cases' }} · page {{ page() }} of {{ pages() }}</p>
          <div class="flex gap-2">
            <button type="button" (click)="go(page() - 1)" [disabled]="page() <= 1" data-testid="prev-page" class="h-9 px-3 rounded-lg border border-border text-[13px] disabled:opacity-50">Previous</button>
            <button type="button" (click)="go(page() + 1)" [disabled]="page() >= pages()" data-testid="next-page" class="h-9 px-3 rounded-lg border border-border text-[13px] disabled:opacity-50">Next</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class DepositDisputesQueueComponent {
  private readonly svc = inject(DepositDisputesService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly statuses = STATUSES;
  readonly targetTypes = DISPUTE_TARGET_TYPES;
  readonly statusLabel = STATUS_LABEL;
  readonly statusTone = STATUS_TONE;
  readonly targetLabel = TARGET_LABEL;
  readonly sideLabel = SIDE_LABEL;
  readonly findingLabel = FINDING_LABEL;
  readonly stateLabel = EFFECT_STATE_LABEL;
  readonly state = effectState;
  readonly short = shortId;

  readonly status = signal<DisputeStatus | 'ALL'>('OPEN');
  readonly targetType = signal<DisputeTargetType | null>(null);
  readonly bookingId = signal<string | null>(null);
  readonly propertyId = signal<string | null>(null);
  readonly page = signal(1);
  readonly rows = signal<AdminDispute[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  constructor() {
    const q = this.route.snapshot.queryParamMap;
    const s = q.get('status');
    this.status.set(s === 'RESOLVED' || s === 'WITHDRAWN' || s === 'OPEN' ? s : s === 'ALL' ? 'ALL' : 'OPEN');
    const t = q.get('targetType');
    this.targetType.set((DISPUTE_TARGET_TYPES as readonly string[]).includes(t ?? '') ? (t as DisputeTargetType) : null);
    this.bookingId.set(q.get('bookingId'));
    this.propertyId.set(q.get('propertyId'));
    this.page.set(Math.max(1, Number(q.get('page')) || 1));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.queue({
      status: this.status() === 'ALL' ? undefined : (this.status() as DisputeStatus),
      targetType: this.targetType() ?? undefined,
      bookingId: this.bookingId() ?? undefined,
      propertyId: this.propertyId() ?? undefined,
      page: this.page(), limit: PAGE_SIZE,
    }).subscribe({
      next: (res) => {
        this.rows.set(res.data ?? []);
        this.total.set(res.meta?.total ?? (res.data?.length ?? 0));
        this.loading.set(false);
      },
      error: (e) => {
        this.rows.set([]);
        this.error.set(disputeErrorCopy(apiErrorInfo(e)).message);
        this.loading.set(false);
      },
    });
  }

  setStatus(s: DisputeStatus | 'ALL'): void { this.status.set(s); this.page.set(1); this.sync(); }
  setTarget(v: string): void { this.targetType.set(v ? (v as DisputeTargetType) : null); this.page.set(1); this.sync(); }
  clearParam(key: 'bookingId' | 'propertyId'): void { (key === 'bookingId' ? this.bookingId : this.propertyId).set(null); this.page.set(1); this.sync(); }
  go(p: number): void {
    if (p < 1 || p > this.pages()) return;
    this.page.set(p);
    this.sync();
  }

  /** Keep the URL as the source of the filters (deep links, back button), then reload. */
  private sync(): void {
    void this.router.navigate([], {
      relativeTo: this.route, replaceUrl: true,
      queryParams: {
        status: this.status() === 'OPEN' ? null : this.status(),
        targetType: this.targetType(), bookingId: this.bookingId(), propertyId: this.propertyId(),
        page: this.page() > 1 ? this.page() : null,
      },
    });
    this.load();
  }
}
