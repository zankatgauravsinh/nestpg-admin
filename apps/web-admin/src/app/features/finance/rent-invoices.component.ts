import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { InvoicesService, RentRunResult, RentPeriod } from '../../core/data/invoices.service';
import { SessionStore } from '../../core/auth/session.store';
import { apiErrorMessage } from '../../core/http/api-error';
import { IconComponent } from '../../shared/components/icon.component';
import { InrPipe } from '../../shared/pipes/inr.pipe';

/** Why a period was not raised, in words (server codes from the generator). */
export const SKIP_REASON: Record<string, string> = {
  ALREADY_INVOICED: 'Already invoiced — another run raised it first',
  BOOKING_NOT_BILLABLE: 'The booking is no longer checked in on monthly billing',
  STAY_ENDS_BEFORE_PERIOD: 'The stay now ends before this period',
  PRICE_NOT_CONFIGURED_FOR_UNIT: 'The bed has no daily rate, so the last days can’t be priced',
  NO_AMOUNT: 'It couldn’t be priced',
  ERROR: 'It failed — see the server log',
};

/**
 * Monthly rent invoices (Super / Ops / Finance — FINANCIAL_OPERATIONS).
 *
 * The first rent invoice is raised when a booking is confirmed; a daily job
 * (01:30 IST) raises each later month 7 days before it starts. This page shows
 * what that job would raise right now (a dry run — nothing is written), what
 * needs attention, and lets Finance raise the due invoices immediately instead
 * of waiting for the job. It is the same engine either way; a real run re-checks
 * every booking, so its result — not the preview — is what happened.
 *
 * Loading, empty and error are distinct: a failed preview is never "nothing due".
 */
@Component({
  selector: 'os-rent-invoices',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, IconComponent, InrPipe],
  template: `
    <div class="p-4 sm:p-6 max-w-[1400px] mx-auto">
      <header class="mb-5">
        <p class="text-[11px] font-semibold tracking-wider text-accent uppercase">Finance</p>
        <h1 class="text-2xl font-bold text-content">Monthly rent invoices</h1>
        <p class="text-sm text-muted mt-1 max-w-3xl">
          Each checked-in monthly booking gets its next rent invoice automatically, 7 days before the period starts
          (daily at 01:30 IST). This shows what is due now. Nothing is raised until you run it.
        </p>
      </header>

      @if (runResult(); as r) {
        <section data-testid="run-result" class="mb-4 rounded-xl border border-success/40 bg-success-subtle p-4">
          <p class="text-sm font-semibold text-content">
            {{ r.created.length === 0 ? 'No invoices were raised.' : 'Raised ' + r.created.length + ' rent invoice' + (r.created.length === 1 ? '' : 's') + ' — ' + (createdTotal() | inr: 'full') + '.' }}
            @if (r.created.length) { Each resident has been notified. }
          </p>
          @if (r.created.length) {
            <ul class="mt-2 space-y-1">
              @for (c of r.created; track c.invoiceId) {
                <li class="text-[13px] text-content">
                  <span class="font-semibold">{{ c.invoiceNumber }}</span> · {{ c.residentName || c.bookingNumber }}
                  · {{ c.propertyName || '—' }} · {{ c.amountPaisa | inr: 'full' }}
                </li>
              }
            </ul>
          }
          @if (r.skipped.length) {
            <p class="mt-3 text-[13px] font-semibold text-content">Not raised ({{ r.skipped.length }})</p>
            <ul class="mt-1 space-y-1" data-testid="run-skipped">
              @for (s of r.skipped; track s.bookingId + s.periodStart) {
                <li class="text-[13px] text-muted">{{ bookingLabel(s.bookingId) }} · period from {{ s.periodStart | date: 'd MMM y' }} — {{ skipReason(s.reason) }}</li>
              }
            </ul>
          }
          <button (click)="runResult.set(null)" class="mt-3 h-8 px-3 rounded-lg border border-border bg-panel text-[13px] text-content">Dismiss</button>
        </section>
      }

      @if (loading()) {
        <div data-testid="rent-loading" class="rounded-xl border border-border bg-panel p-10 text-center">
          <p class="text-sm text-muted">Checking which rent invoices are due…</p>
        </div>
      } @else if (error(); as err) {
        <div data-testid="rent-error" class="rounded-xl border border-danger/40 bg-danger-subtle p-8 text-center">
          <os-icon name="error" [size]="28" />
          <p class="mt-2 text-sm font-semibold text-content">Couldn’t check which rent invoices are due.</p>
          <p class="text-sm text-muted">{{ err }}</p>
          <button (click)="preview()" class="mt-4 h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold">Try again</button>
        </div>
      } @else if (plan(); as p) {
        <!-- Summary -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
          <div class="rounded-xl border border-border bg-panel p-4" data-testid="tile-due">
            <p class="text-[11px] uppercase text-faint">Due to raise</p>
            <p class="text-2xl font-bold text-content">{{ ready().length }}</p>
          </div>
          <div class="rounded-xl border border-border bg-panel p-4" data-testid="tile-total">
            <p class="text-[11px] uppercase text-faint">Total rent</p>
            <p class="text-2xl font-bold text-content">{{ readyTotal() | inr: 'full' }}</p>
          </div>
          <div [class]="'rounded-xl border p-4 ' + (attention().length ? 'border-warning/40 bg-warning-subtle' : 'border-border bg-panel')" data-testid="tile-attention">
            <p class="text-[11px] uppercase text-faint">Can’t be priced</p>
            <p class="text-2xl font-bold text-content">{{ attention().length }}</p>
          </div>
          <div [class]="'rounded-xl border p-4 ' + (p.withoutBillingAnchor.length ? 'border-warning/40 bg-warning-subtle' : 'border-border bg-panel')" data-testid="tile-no-anchor">
            <p class="text-[11px] uppercase text-faint">Not billed automatically</p>
            <p class="text-2xl font-bold text-content">{{ p.withoutBillingAnchor.length }}</p>
          </div>
        </div>
        <p class="text-[12px] text-faint mb-4" data-testid="rent-asof">
          As of {{ p.asOf | date: 'd MMM y' }} · periods starting by {{ dueBy() | date: 'd MMM y' }} · at most 3 months per booking per run
        </p>

        <!-- Due -->
        <section class="rounded-xl border border-border bg-panel mb-4">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-border">
            <h2 class="text-base font-semibold text-content">Due to raise</h2>
            @if (ready().length) {
              @if (confirming()) {
                <div class="rounded-lg border border-accent/40 bg-accent-subtle p-3 flex flex-col sm:flex-row sm:items-center gap-3" data-testid="run-confirm-panel">
                  <span class="text-[13px] text-content">
                    Raise {{ ready().length }} rent invoice{{ ready().length === 1 ? '' : 's' }} totalling {{ readyTotal() | inr: 'full' }} now?
                    Residents are notified. An invoice can be voided later, not deleted.
                  </span>
                  <div class="flex gap-2 shrink-0">
                    <button (click)="run()" [disabled]="running()" data-testid="run-confirm"
                            class="h-9 px-4 rounded-lg bg-accent text-white text-[13px] font-semibold disabled:opacity-60">
                      {{ running() ? 'Raising…' : 'Raise invoices' }}
                    </button>
                    <button (click)="confirming.set(false)" [disabled]="running()" class="h-9 px-3 rounded-lg border border-border text-[13px] text-content">Cancel</button>
                  </div>
                </div>
              } @else {
                <button (click)="confirming.set(true); runError.set(null)" data-testid="run"
                        class="self-start sm:self-auto h-9 px-4 rounded-lg bg-accent text-white text-[13px] font-semibold">
                  Raise {{ ready().length }} now
                </button>
              }
            }
          </div>
          @if (runError(); as re) {
            <p class="px-4 pt-3 text-sm text-danger" data-testid="run-error">{{ re }}</p>
          }
          @if (ready().length === 0) {
            <p class="p-4 text-sm text-muted" data-testid="rent-none-due">
              Nothing is due. The next invoices are raised automatically 7 days before each period starts.
            </p>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full text-[13px]" data-testid="rent-due">
                <thead>
                  <tr class="text-left text-[11px] uppercase text-faint">
                    <th class="px-4 py-2 font-medium">Booking</th>
                    <th class="px-4 py-2 font-medium">Resident</th>
                    <th class="px-4 py-2 font-medium">Property</th>
                    <th class="px-4 py-2 font-medium">Period</th>
                    <th class="px-4 py-2 font-medium text-right">Rent</th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of ready(); track r.bookingId + r.periodStart) {
                    <tr class="border-t border-border">
                      <td class="px-4 py-2 text-content whitespace-nowrap">{{ r.bookingNumber }}</td>
                      <td class="px-4 py-2 text-content">{{ r.residentName || '—' }}</td>
                      <td class="px-4 py-2 text-muted">{{ r.propertyName || '—' }}</td>
                      <td class="px-4 py-2 text-content whitespace-nowrap">
                        {{ r.periodStart | date: 'd MMM y' }} → {{ r.periodEnd | date: 'd MMM y' }}
                        <span class="text-faint">· {{ r.partial ? r.days + ' day' + (r.days === 1 ? '' : 's') : '1 month' }}</span>
                      </td>
                      <td class="px-4 py-2 text-right text-content font-semibold whitespace-nowrap">{{ r.amountPaisa | inr: 'full' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>

        <!-- Can't be priced -->
        @if (attention().length) {
          <section class="rounded-xl border border-warning/40 bg-panel mb-4 p-4" data-testid="rent-attention">
            <h2 class="text-base font-semibold text-content">Can’t be priced ({{ attention().length }})</h2>
            <p class="text-[13px] text-muted mt-1">
              These stays end part-way through the period, so the last days are billed at the bed’s daily rate — and the
              bed has none. They’re raised automatically once the owner sets it.
              @if (canSeeDailyRates()) { <a routerLink="/properties/daily-rates" class="text-accent font-medium">See beds missing a daily rate</a> }
            </p>
            <ul class="mt-2 space-y-1">
              @for (r of attention(); track r.bookingId + r.periodStart) {
                <li class="text-[13px] text-content">
                  {{ r.bookingNumber }} · {{ r.residentName || '—' }} · {{ r.propertyName || '—' }} ·
                  {{ r.periodStart | date: 'd MMM y' }} → {{ r.periodEnd | date: 'd MMM y' }} ({{ r.days }} day{{ r.days === 1 ? '' : 's' }})
                </li>
              }
            </ul>
          </section>
        }

        <!-- No first rent invoice -->
        @if (p.withoutBillingAnchor.length) {
          <section class="rounded-xl border border-warning/40 bg-panel p-4" data-testid="rent-no-anchor">
            <h2 class="text-base font-semibold text-content">Not billed automatically ({{ p.withoutBillingAnchor.length }})</h2>
            <p class="text-[13px] text-muted mt-1">
              These checked-in monthly bookings have no first rent invoice with a billing period, so the generator has
              nothing to continue from and won’t bill them. Bill them from Invoices for now: a manually raised invoice
              doesn’t start automatic billing.
            </p>
            <ul class="mt-2 space-y-1">
              @for (b of p.withoutBillingAnchor; track b.bookingId) {
                <li class="text-[13px] text-content">
                  {{ b.bookingNumber }} · {{ b.residentName || '—' }} · {{ b.propertyName || '—' }}
                  @if (b.checkInDate) { · checked in {{ b.checkInDate | date: 'd MMM y' }} }
                </li>
              }
            </ul>
          </section>
        }
      }
    </div>
  `,
})
export class RentInvoicesComponent {
  private readonly svc = inject(InvoicesService);
  private readonly session = inject(SessionStore);

  readonly plan = signal<RentRunResult | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly confirming = signal(false);
  readonly running = signal(false);
  readonly runError = signal<string | null>(null);
  readonly runResult = signal<RentRunResult | null>(null);

  readonly ready = computed<RentPeriod[]>(() => (this.plan()?.planned ?? []).filter((r) => r.amountPaisa != null));
  readonly attention = computed<RentPeriod[]>(() => (this.plan()?.planned ?? []).filter((r) => r.amountPaisa == null));
  readonly readyTotal = computed(() => this.ready().reduce((n, r) => n + (r.amountPaisa ?? 0), 0));
  readonly createdTotal = computed(() => (this.runResult()?.created ?? []).reduce((n, r) => n + (r.amountPaisa ?? 0), 0));
  /** The last period start the preview covers: asOf + leadDays. */
  readonly dueBy = computed(() => {
    const p = this.plan();
    if (!p) return null;
    const d = new Date(`${p.asOf}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + p.leadDays);
    return d.toISOString().slice(0, 10);
  });
  /** The daily-rate report is Super / Ops only (PROPERTY_OPERATIONS); Finance gets the explanation without the link. */
  readonly canSeeDailyRates = computed(() => this.session.hasCapability('PROPERTY_OPERATIONS'));

  /** Labels from the last preview, so a skipped period reads as a booking, not an id. */
  private readonly known = new Map<string, string>();

  constructor() { this.preview(); }

  preview(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.runRentInvoices(true).subscribe({
      next: (p) => {
        for (const r of p.planned) this.known.set(r.bookingId, [r.bookingNumber, r.residentName].filter(Boolean).join(' · '));
        this.plan.set(p);
        this.loading.set(false);
      },
      error: (e) => { this.error.set(apiErrorMessage(e, 'Could not check which rent invoices are due.')); this.loading.set(false); },
    });
  }

  run(): void {
    this.running.set(true);
    this.runError.set(null);
    this.svc.runRentInvoices(false).subscribe({
      next: (r) => {
        this.running.set(false);
        this.confirming.set(false);
        this.runResult.set(r);
        this.preview();   // what is still due after the run
      },
      error: (e) => { this.running.set(false); this.runError.set(apiErrorMessage(e, 'Could not raise the rent invoices.')); },
    });
  }

  skipReason(code: string): string { return SKIP_REASON[code] ?? code; }
  bookingLabel(id: string): string { return this.known.get(id) ?? 'A booking'; }
}
