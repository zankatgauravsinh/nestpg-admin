import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AmountMismatch, PaymentsService, UnappliedList, UnappliedPayment, paise } from '../../core/data/payments.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { IconComponent } from '../../shared/components/icon.component';
import { InrPipe } from '../../shared/pipes/inr.pipe';

type Action = { kind: 'accept' | 'close' | 'refund'; id: string };
const LIMIT = 20;

/**
 * Payments to review (Super / Ops / Finance — FINANCIAL_OPERATIONS).
 *
 *  • Amount mismatches — the gateway captured something other than the order's amount.
 *    Nothing was settled; the resident can't pay again until it is resolved here.
 *  • Unapplied money — captured beyond what the invoice (or deposit) needed.
 *
 * Every action re-checks on the server: accepting re-reads the captured amount from
 * Razorpay, closing requires Razorpay to show the money fully refunded, and a refund
 * here can never reach money applied to an invoice. No amount is typed.
 *
 * Loading, empty and error are distinct: a failed read is never "nothing to review".
 */
@Component({
  selector: 'os-payments-review',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, IconComponent, InrPipe],
  template: `
    <div class="p-4 sm:p-6 max-w-[1400px] mx-auto">
      <header class="mb-5">
        <p class="text-[11px] font-semibold tracking-wider text-accent uppercase">Finance</p>
        <h1 class="text-2xl font-bold text-content">Payments to review</h1>
        <p class="text-sm text-muted mt-1 max-w-3xl">
          Online payments that need a person: captures that don’t match the amount asked for, and money an invoice or deposit didn’t need.
        </p>
      </header>

      @if (done(); as d) {
        <p data-testid="review-done" class="mb-4 rounded-xl border border-success/40 bg-success-subtle p-4 text-sm text-content">{{ d }}</p>
      }

      <!-- Amount mismatches -->
      <section class="rounded-xl border border-border bg-panel mb-5" data-testid="mismatches">
        <div class="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 class="text-base font-semibold text-content">Captured amount doesn’t match @if (!mmError() && !mmLoading()) { ({{ mmTotal() }}) }</h2>
            <p class="text-[13px] text-muted mt-1">Nothing has been recorded as paid, and the resident can’t pay for the same thing again until you resolve it.</p>
          </div>
          <div class="flex gap-1 shrink-0">
            @for (s of states; track s.id) {
              <button (click)="setState(s.id)" [attr.data-testid]="'state-' + s.id" [attr.aria-pressed]="state() === s.id"
                class="h-8 px-3 rounded-lg border text-[13px]" [class]="state() === s.id ? 'border-accent text-accent' : 'border-border text-content'">{{ s.label }}</button>
            }
          </div>
        </div>
        @if (mmLoading()) {
          <p class="p-4 text-sm text-muted" data-testid="mismatches-loading">Loading…</p>
        } @else if (mmError(); as e) {
          <div class="p-6 text-center" data-testid="mismatches-error">
            <os-icon name="error" [size]="24" />
            <p class="text-sm font-semibold text-content mt-1">Couldn’t load these payments.</p>
            <p class="text-sm text-muted">{{ e }}</p>
            <button (click)="loadMismatches()" class="mt-3 h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold">Try again</button>
          </div>
        } @else if (!mismatches().length) {
          <p class="p-4 text-sm text-muted" data-testid="mismatches-empty">{{ state() === 'REQUIRED' ? 'Nothing needs reconciling.' : 'Nothing has been resolved yet.' }}</p>
        } @else {
          <ul>
            @for (c of mismatches(); track c.id) {
              <li class="p-4 border-t border-border first:border-t-0" data-testid="mismatch">
                <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-sm text-content">
                      <span class="font-semibold">{{ c.payment_number }}</span> · {{ c.payer_name || 'Resident' }} · {{ c.property_name || '—' }} · {{ target(c) }}
                    </p>
                    <p class="text-sm text-content mt-1">
                      Asked for <strong>{{ paisa(c.expected_paisa) | inr: 'full' }}</strong>, captured
                      <strong class="text-danger">{{ c.currency === 'INR' ? (paisa(c.captured_paisa) | inr: 'full') : c.currency + ' ' + paisa(c.captured_paisa) / 100 }}</strong>
                    </p>
                    <p class="text-[12px] text-faint mt-1 break-all">{{ c.gateway_payment_id }} · {{ c.created_at | date: 'd MMM y, HH:mm' }}</p>
                    @if (c.state === 'RESOLVED') {
                      <p class="text-[13px] text-muted mt-1" data-testid="resolution">
                        {{ c.outcome === 'ACCEPTED' ? 'Captured amount accepted' : 'Closed: refunded in Razorpay' }}
                        · {{ c.resolved_by_name || 'Admin' }} · {{ c.resolved_at | date: 'd MMM y, HH:mm' }} · {{ c.note }}
                      </p>
                    }
                  </div>
                  @if (c.state === 'REQUIRED' && !is('accept', c.id) && !is('close', c.id)) {
                    <div class="flex gap-2 shrink-0">
                      @if (c.reason === 'AMOUNT_MISMATCH') {
                        <button (click)="start('accept', c.id)" data-testid="accept" class="h-9 px-3 rounded-lg bg-accent text-white text-[13px] font-semibold">Accept captured amount</button>
                      }
                      <button (click)="start('close', c.id)" data-testid="close" class="h-9 px-3 rounded-lg border border-border text-[13px] text-content">Close as refunded</button>
                    </div>
                  }
                </div>
                @if (is('accept', c.id) || is('close', c.id)) {
                  <div class="mt-3 rounded-lg border border-accent/40 bg-accent-subtle p-3 space-y-2" data-testid="confirm-panel">
                    <p class="text-[13px] text-content">
                      @if (is('accept', c.id)) {
                        Record {{ paisa(c.captured_paisa) | inr: 'full' }} as received? It’s checked with Razorpay first, then applied to what it was for.
                        Anything not needed stays unapplied for a refund. If the payment was to confirm a booking and the hold has ended, it is refunded automatically.
                      } @else {
                        Close without recording any money? This works only if Razorpay shows the full amount refunded. The resident can then pay again.
                      }
                    </p>
                    <textarea [(ngModel)]="note" rows="2" maxlength="500" data-testid="note" aria-label="Reason" placeholder="Reason (kept with the case)"
                      class="w-full rounded-lg border border-border bg-panel p-2 text-sm text-content"></textarea>
                    <div class="flex gap-2">
                      <button (click)="resolve(c)" [disabled]="busy() || note.trim().length < 5" data-testid="confirm"
                        class="h-9 px-4 rounded-lg bg-accent text-white text-[13px] font-semibold disabled:opacity-60">{{ busy() ? 'Checking…' : is('accept', c.id) ? 'Accept' : 'Close case' }}</button>
                      <button (click)="cancel()" [disabled]="busy()" class="h-9 px-3 rounded-lg border border-border text-[13px] text-content">Cancel</button>
                    </div>
                    @if (actionError(); as e) { <p class="text-sm text-danger" data-testid="action-error">{{ e }}</p> }
                  </div>
                }
              </li>
            }
          </ul>
          @if (mmTotal() > limit) {
            <div class="flex items-center gap-2 p-3 border-t border-border text-[13px] text-muted">
              <button (click)="mmGo(-1)" [disabled]="mmPage() <= 1" class="h-8 px-3 rounded-lg border border-border disabled:opacity-40">Prev</button>
              <span>Page {{ mmPage() }} / {{ pages(mmTotal()) }}</span>
              <button (click)="mmGo(1)" [disabled]="mmPage() >= pages(mmTotal())" class="h-8 px-3 rounded-lg border border-border disabled:opacity-40">Next</button>
            </div>
          }
        }
      </section>

      <!-- Unapplied -->
      <section class="rounded-xl border border-border bg-panel" data-testid="unapplied">
        <div class="p-4 border-b border-border">
          <h2 class="text-base font-semibold text-content">Money not needed
            @if (unapplied(); as u) { ({{ u.total }}) <span class="font-normal text-muted" data-testid="unapplied-total">· {{ u.unappliedPaisa | inr: 'full' }} in all</span> }
          </h2>
          <p class="text-[13px] text-muted mt-1">The invoice was already paid or cancelled (or the deposit was no longer due) when this money was captured.</p>
        </div>
        @if (unLoading()) {
          <p class="p-4 text-sm text-muted" data-testid="unapplied-loading">Loading…</p>
        } @else if (unError(); as e) {
          <div class="p-6 text-center" data-testid="unapplied-error">
            <os-icon name="error" [size]="24" />
            <p class="text-sm font-semibold text-content mt-1">Couldn’t load these payments.</p>
            <p class="text-sm text-muted">{{ e }}</p>
            <button (click)="loadUnapplied()" class="mt-3 h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold">Try again</button>
          </div>
        } @else if (unapplied(); as u) {
          @if (!u.items.length) {
            <p class="p-4 text-sm text-muted" data-testid="unapplied-empty">No payment holds money beyond what was owed.</p>
          } @else {
            <ul>
              @for (p of u.items; track p.id) {
                <li class="p-4 border-t border-border first:border-t-0" data-testid="unapplied-row">
                  <div class="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                    <div class="min-w-0">
                      <p class="text-sm text-content"><span class="font-semibold">{{ p.payment_number }}</span> · {{ p.payer_name || 'Resident' }} · {{ p.property_name || '—' }} · {{ p.invoice_number || p.booking_number || '—' }}</p>
                      <p class="text-sm text-content mt-1"><strong class="text-danger">{{ paisa(p.unapplied_paisa) | inr: 'full' }}</strong> of {{ paisa(p.amount_paisa) | inr: 'full' }} not needed
                        @if (paisa(p.refunded_paisa) > 0) { · {{ paisa(p.refunded_paisa) | inr: 'full' }} already refunded }</p>
                      <p class="text-[12px] text-faint mt-1">{{ p.paid_at | date: 'd MMM y, HH:mm' }} · {{ p.gateway === 'RAZORPAY' ? 'Paid online' : 'Recorded manually' }}</p>
                    </div>
                    @if (!is('refund', p.id)) {
                      <button (click)="start('refund', p.id)" data-testid="refund" class="h-9 px-3 rounded-lg border border-danger text-danger text-[13px] font-semibold shrink-0 self-start">Refund {{ paisa(p.unapplied_paisa) | inr: 'full' }}</button>
                    }
                  </div>
                  @if (is('refund', p.id)) {
                    <div class="mt-3 rounded-lg border border-danger/40 bg-danger-subtle p-3 space-y-2" data-testid="confirm-panel">
                      <p class="text-[13px] text-content">
                        Refund {{ paisa(p.unapplied_paisa) | inr: 'full' }} to {{ p.payer_name || 'the resident' }}?
                        {{ p.gateway === 'RAZORPAY' ? 'Razorpay sends it back to the method they used. This can’t be undone.' : 'This records a refund you have already paid by hand. It can’t be undone.' }}
                      </p>
                      <input [(ngModel)]="note" maxlength="500" data-testid="note" aria-label="Reason" placeholder="Reason" class="w-full h-9 rounded-lg border border-border bg-panel px-2 text-sm text-content" />
                      <div class="flex gap-2">
                        <button (click)="refund(p)" [disabled]="busy() || note.trim().length < 5" data-testid="confirm"
                          class="h-9 px-4 rounded-lg bg-danger text-white text-[13px] font-semibold disabled:opacity-60">{{ busy() ? 'Refunding…' : 'Refund' }}</button>
                        <button (click)="cancel()" [disabled]="busy()" class="h-9 px-3 rounded-lg border border-border text-[13px] text-content">Cancel</button>
                      </div>
                      @if (actionError(); as e) { <p class="text-sm text-danger" data-testid="action-error">{{ e }}</p> }
                    </div>
                  }
                </li>
              }
            </ul>
            @if (u.total > limit) {
              <div class="flex items-center gap-2 p-3 border-t border-border text-[13px] text-muted">
                <button (click)="unGo(-1)" [disabled]="unPage() <= 1" class="h-8 px-3 rounded-lg border border-border disabled:opacity-40">Prev</button>
                <span>Page {{ unPage() }} / {{ pages(u.total) }}</span>
                <button (click)="unGo(1)" [disabled]="unPage() >= pages(u.total)" class="h-8 px-3 rounded-lg border border-border disabled:opacity-40">Next</button>
              </div>
            }
          }
        }
      </section>
    </div>
  `,
})
export class PaymentsReviewComponent {
  private readonly svc = inject(PaymentsService);
  readonly limit = LIMIT;
  readonly states = [{ id: 'REQUIRED' as const, label: 'To resolve' }, { id: 'RESOLVED' as const, label: 'Resolved' }];

  readonly state = signal<'REQUIRED' | 'RESOLVED'>('REQUIRED');
  readonly mismatches = signal<AmountMismatch[]>([]);
  readonly mmTotal = signal(0);
  readonly mmPage = signal(1);
  readonly mmLoading = signal(true);
  readonly mmError = signal<string | null>(null);

  readonly unapplied = signal<UnappliedList | null>(null);
  readonly unPage = signal(1);
  readonly unLoading = signal(true);
  readonly unError = signal<string | null>(null);

  readonly action = signal<Action | null>(null);
  readonly busy = signal(false);
  readonly actionError = signal<string | null>(null);
  readonly done = signal<string | null>(null);
  note = '';

  readonly paisa = paise;

  constructor() { this.loadMismatches(); this.loadUnapplied(); }

  pages(total: number): number { return Math.max(1, Math.ceil(total / LIMIT)); }
  is(kind: Action['kind'], id: string): boolean { const a = this.action(); return a?.kind === kind && a.id === id; }
  target(c: AmountMismatch): string {
    if (c.invoice_number) return `Invoice ${c.invoice_number}`;
    if (c.purpose === 'SECURITY_DEPOSIT') return `Deposit${c.booking_number ? ` · ${c.booking_number}` : ''}`;
    return c.booking_number ?? (c.reservation_id ? 'First month’s rent (booking not confirmed)' : '—');
  }

  setState(s: 'REQUIRED' | 'RESOLVED'): void { this.state.set(s); this.mmPage.set(1); this.cancel(); this.loadMismatches(); }
  mmGo(d: number): void { this.mmPage.update((p) => p + d); this.loadMismatches(); }
  unGo(d: number): void { this.unPage.update((p) => p + d); this.loadUnapplied(); }

  loadMismatches(): void {
    this.mmLoading.set(true); this.mmError.set(null);
    this.svc.amountMismatches(this.state(), this.mmPage(), LIMIT).subscribe({
      next: (r) => { this.mismatches.set(r.items); this.mmTotal.set(r.total); this.mmLoading.set(false); },
      error: (e) => { this.mmError.set(apiErrorMessage(e, 'Please try again.')); this.mmLoading.set(false); },
    });
  }

  loadUnapplied(): void {
    this.unLoading.set(true); this.unError.set(null);
    this.svc.unapplied(this.unPage(), LIMIT).subscribe({
      next: (r) => { this.unapplied.set(r); this.unLoading.set(false); },
      error: (e) => { this.unapplied.set(null); this.unError.set(apiErrorMessage(e, 'Please try again.')); this.unLoading.set(false); },
    });
  }

  start(kind: Action['kind'], id: string): void { this.note = ''; this.actionError.set(null); this.done.set(null); this.action.set({ kind, id }); }
  cancel(): void { this.action.set(null); this.actionError.set(null); }

  resolve(c: AmountMismatch): void {
    const a = this.action();
    if (!a || a.kind === 'refund' || this.busy()) return;
    this.busy.set(true); this.actionError.set(null);
    this.svc.resolveMismatch(c.id, a.kind, this.note.trim()).subscribe({
      next: () => this.finish(a.kind === 'accept' ? `${c.payment_number}: captured amount accepted.` : `${c.payment_number}: closed as refunded.`),
      error: (e) => { this.busy.set(false); this.actionError.set(apiErrorMessage(e, 'It could not be resolved.')); },
    });
  }

  refund(p: UnappliedPayment): void {
    if (this.busy()) return;
    this.busy.set(true); this.actionError.set(null);
    this.svc.refundUnapplied(p.id, paise(p.unapplied_paisa), this.note.trim()).subscribe({
      next: () => this.finish(`${p.payment_number}: refund ${p.gateway === 'RAZORPAY' ? 'sent to Razorpay' : 'recorded'}.`),
      error: (e) => { this.busy.set(false); this.actionError.set(apiErrorMessage(e, 'The refund failed.')); },
    });
  }

  private finish(text: string): void {
    this.busy.set(false); this.action.set(null); this.done.set(text);
    this.loadMismatches(); this.loadUnapplied();
  }
}
