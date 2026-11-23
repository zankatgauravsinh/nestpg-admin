import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  BookingContext, BookingDepositHistory, DepositDisputesService, DisputeTargetRefs, DisputeTargetType,
} from '../../../core/data/deposit-disputes.service';
import { apiErrorInfo } from '../../../core/http/api-error-info';
import { SessionStore } from '../../../core/auth/session.store';
import { InrPipe } from '../../../shared/pipes/inr.pipe';
import { StatusPillComponent } from '../../../shared/components/status-pill.component';
import { OpenDisputeFormComponent } from './open-dispute-form.component';
import { disputeErrorCopy, shortId, STATUS_LABEL, TARGET_LABEL } from './dispute-copy';

interface OpenTarget { key: string; type: DisputeTargetType; refs: Partial<DisputeTargetRefs>; summary: string }

/**
 * ADM-D.1 — a booking's deposit history (`GET /admin/bookings/:id/deposit-history`),
 * read-only, plus the booking's derived refund state from `GET /bookings/:id`.
 *
 *  • Nothing is recomputed: every figure is the server's. The settlement chain is only
 *    ORDERED here (root → revisions); the live settlement is the one nothing supersedes.
 *  • Offline-event notes, the settlement's private reason and transaction payloads are
 *    not in the projection and are never requested.
 *  • "Open admin case" is offered on rows that can be a target (confirmed offline
 *    records, the live settlement and its lines, gateway refunds); the server still
 *    decides eligibility on submit.
 */
@Component({
  selector: 'os-booking-deposit-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, InrPipe, StatusPillComponent, OpenDisputeFormComponent],
  template: `
    <div class="p-4 sm:p-6 max-w-[1100px] mx-auto space-y-5">
      <a routerLink="/finance/deposit-disputes" class="text-[13px] text-accent underline-offset-2 hover:underline">← Deposit disputes</a>
      <header>
        <p class="text-[11px] font-semibold tracking-wider text-accent uppercase">Finance</p>
        <h1 class="text-2xl font-bold text-content">Deposit history</h1>
      </header>

      @if (loading()) {
        <div data-testid="history-loading" role="status" class="rounded-xl border border-border bg-panel p-10 text-center text-sm text-muted">Loading the deposit history…</div>
      } @else if (error(); as err) {
        <div data-testid="history-error" role="alert" class="rounded-xl border border-danger/40 bg-danger-subtle p-8 text-center">
          <p class="text-sm font-semibold text-content">The deposit history could not be loaded.</p>
          <p class="text-sm text-muted">{{ err }}</p>
          <button type="button" (click)="load()" class="mt-4 h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold">Try again</button>
        </div>
      } @else if (h(); as x) {
        <section class="rounded-xl border border-border bg-panel p-4 text-[13px]" data-testid="history-booking" aria-labelledby="hb">
          <h2 id="hb" class="text-sm font-semibold text-content mb-2">Booking {{ x.booking.bookingNumber }}</h2>
          <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
            <dt class="text-muted">Status</dt><dd>{{ x.booking.status }}@if (x.booking.deletedAt) { <span class="text-danger"> · deleted</span> }</dd>
            @if (ctx(); as b) {
              <dt class="text-muted">Resident</dt><dd>{{ b.tenantName ?? '—' }}</dd>
              <dt class="text-muted">Property</dt><dd>{{ b.propertyName ?? '—' }}</dd>
            }
            <dt class="text-muted">Check-in / out</dt><dd>{{ x.booking.checkInDate ?? '—' }} → {{ x.booking.checkOutDate ?? '—' }}</dd>
            @if (x.booking.cancelledAt) { <dt class="text-muted">Cancelled</dt><dd>{{ x.booking.cancelledAt | date: 'd MMM y, HH:mm' }}{{ x.booking.cancellationReason ? ' · ' + x.booking.cancellationReason : '' }}</dd> }
            @if (x.booking.noShowAt) { <dt class="text-muted">No-show</dt><dd>{{ x.booking.noShowAt | date: 'd MMM y, HH:mm' }}</dd> }
          </dl>
        </section>

        <section class="rounded-xl border border-border bg-panel p-4 text-[13px]" data-testid="history-deposit" aria-labelledby="hd">
          <h2 id="hd" class="text-sm font-semibold text-content mb-2">Security deposit</h2>
          @if (x.deposit; as dep) {
            <p>{{ dep.amountPaisa | inr: 'full' }} · {{ dep.status }}@if (dep.collectedAt) { · collected {{ dep.collectedAt | date: 'd MMM y, HH:mm' }} }</p>
          } @else { <p class="text-muted" data-testid="no-deposit">This booking has no security deposit.</p> }
          @if (ctx()?.depositRefund; as r) {
            <p class="mt-1" data-testid="refund-state">Refund (server state): {{ r.rail }} · {{ r.state }} · {{ r.amountPaisa | inr: 'full' }}
              @if (r.state === 'ON_HOLD') { <span class="block text-danger">On hold — it cannot be executed automatically. Refunds are retried every 5 minutes; gateway-side holds are visible only in operational logs.</span> }
            </p>
          }
        </section>

        @if (isEmpty()) {
          <p class="text-[13px] text-muted" data-testid="history-empty">No offline records, settlements, refunds or disputes for this deposit yet.</p>
        }

        @if (x.offlineEvents.length) {
          <section class="rounded-xl border border-border bg-panel p-4 text-[13px]" data-testid="history-offline" aria-labelledby="ho">
            <h2 id="ho" class="text-sm font-semibold text-content mb-2">Offline records</h2>
            <ul class="space-y-2">
              @for (e of x.offlineEvents; track e.id) {
                <li [attr.data-testid]="'offline-' + e.id">
                  <span class="font-medium">{{ e.eventType }}</span> · {{ e.status }} · {{ e.amountPaisa | inr: 'full' }} by {{ e.method }} on {{ e.eventDate }}
                  <span class="block text-[12px] text-muted">recorded by {{ e.initiatorSide }} ({{ short(e.recordedBy) }})@if (e.confirmedAt) { · confirmed {{ e.confirmedAt | date: 'd MMM y' }} }@if (e.rejectionReason) { · rejected: {{ e.rejectionReason }} }</span>
                  @if (canOpen() && e.status === 'CONFIRMED') {
                    <button type="button" (click)="chooseOffline(e)"
                            class="mt-1 h-8 px-3 rounded-lg border border-border text-[12px]" [attr.data-testid]="'open-oe-' + e.id">Open admin case</button>
                  }
                </li>
              }
            </ul>
          </section>
        }

        @if (chain().length) {
          <section class="rounded-xl border border-border bg-panel p-4 text-[13px]" data-testid="history-settlements" aria-labelledby="hs">
            <h2 id="hs" class="text-sm font-semibold text-content mb-2">Settlements</h2>
            <ol class="space-y-3">
              @for (s of chain(); track s.id) {
                <li [attr.data-testid]="'settlement-' + s.id">
                  <span class="font-medium">{{ s.status }}</span>
                  @if (s.id === liveId()) { <span class="ml-1 text-[11px] font-semibold text-success" data-testid="live-tail">live</span> } @else { <span class="ml-1 text-[11px] text-faint">history</span> }
                  · deposit {{ s.depositAmountPaisa | inr: 'full' }} · deductions {{ s.totalDeductionsPaisa | inr: 'full' }} · refundable <strong>{{ s.refundablePaisa | inr: 'full' }}</strong>
                  <span class="block text-[12px] text-muted">{{ s.automatic ? 'automatic' : 'settled by ' + short(s.settledBy) }} · {{ s.settledAt | date: 'd MMM y, HH:mm' }}@if (s.supersedesSettlementId) { · revises {{ short(s.supersedesSettlementId) }} (case {{ short(s.supersedingDisputeId) }}) }</span>
                  @if (s.deductions.length) {
                    <ul class="mt-1 ml-4 list-disc">
                      @for (l of s.deductions; track l.id) {
                        <li>{{ l.reason }}{{ l.category ? ' · ' + l.category : '' }} — {{ l.amountPaisa | inr: 'full' }}
                          @if (canOpen() && s.id === liveId()) {
                            <button type="button" (click)="choose({ key: 'dd-' + l.id, type: 'SETTLEMENT', refs: { settlementId: s.id, deductionId: l.id }, summary: 'deduction “' + l.reason + '”' })"
                                    class="ml-2 h-7 px-2 rounded-lg border border-border text-[11px]" [attr.data-testid]="'open-dd-' + l.id">Open admin case</button>
                          }
                        </li>
                      }
                    </ul>
                  }
                  @if (canOpen() && s.id === liveId()) {
                    <button type="button" (click)="choose({ key: 'st-' + s.id, type: 'SETTLEMENT', refs: { settlementId: s.id }, summary: 'the whole settlement' })"
                            class="mt-1 h-8 px-3 rounded-lg border border-border text-[12px]" [attr.data-testid]="'open-st-' + s.id">Open admin case on the settlement</button>
                  }
                </li>
              }
            </ol>
          </section>
        }

        @if (x.refunds.length) {
          <section class="rounded-xl border border-border bg-panel p-4 text-[13px]" data-testid="history-refunds" aria-labelledby="hr">
            <h2 id="hr" class="text-sm font-semibold text-content mb-2">Gateway refunds</h2>
            <ul class="space-y-2">
              @for (r of x.refunds; track r.id) {
                <li [attr.data-testid]="'refund-' + r.id">
                  {{ r.refundNumber }} · {{ r.status }} · {{ r.amountPaisa | inr: 'full' }}@if (r.processedAt) { · processed {{ r.processedAt | date: 'd MMM y, HH:mm' }} }
                  <span class="block text-[12px] text-muted">gateway {{ r.gatewayRefundId ?? '—' }} · {{ r.transactions.length }} transaction log entries</span>
                  @if (canOpen()) {
                    <button type="button" (click)="choose({ key: 'rf-' + r.id, type: 'ONLINE_REFUND', refs: { refundId: r.id }, summary: 'refund ' + r.refundNumber })"
                            class="mt-1 h-8 px-3 rounded-lg border border-border text-[12px]" [attr.data-testid]="'open-rf-' + r.id">Open admin case</button>
                  }
                </li>
              }
            </ul>
          </section>
        }

        @if (target(); as t) {
          <os-open-dispute-form [bookingId]="x.booking.id" [targetType]="t.type" [refs]="t.refs" [targetSummary]="t.summary"
                                (opened)="onOpened($event)" (cancelled)="target.set(null)" />
        }

        @if (x.disputes.length) {
          <section class="rounded-xl border border-border bg-panel p-4 text-[13px]" data-testid="history-disputes" aria-labelledby="hdi">
            <h2 id="hdi" class="text-sm font-semibold text-content mb-2">Disputes</h2>
            <ul class="space-y-1">
              @for (dd of x.disputes; track dd.id) {
                <li><a [routerLink]="['/finance/deposit-disputes', dd.id]" class="text-accent underline">{{ targetLabel[dd.targetType] }}</a>
                  · <os-status-pill [status]="dd.status" [label]="statusLabel[dd.status]" /> · {{ dd.createdAt | date: 'd MMM y' }}</li>
              }
            </ul>
          </section>
        }

        @if (x.bookingHistory.length) {
          <section class="rounded-xl border border-border bg-panel p-4 text-[13px]" data-testid="history-lifecycle" aria-labelledby="hl">
            <h2 id="hl" class="text-sm font-semibold text-content mb-2">Booking lifecycle</h2>
            <ol class="space-y-1">
              @for (b of x.bookingHistory; track b.id) {
                <li>{{ b.fromStatus ?? '—' }} → {{ b.toStatus }} · {{ b.createdAt | date: 'd MMM y, HH:mm' }}{{ b.changedBy ? ' · ' + short(b.changedBy) : '' }}{{ b.reason ? ' · ' + b.reason : '' }}</li>
              }
            </ol>
          </section>
        }
      }
    </div>
  `,
})
export class BookingDepositHistoryComponent {
  private readonly svc = inject(DepositDisputesService);
  private readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly short = shortId;
  readonly targetLabel = TARGET_LABEL;
  readonly statusLabel = STATUS_LABEL;
  readonly bookingId = signal('');
  readonly h = signal<BookingDepositHistory | null>(null);
  readonly ctx = signal<BookingContext | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly target = signal<OpenTarget | null>(null);

  readonly canOpen = computed(() => this.session.hasCapability('DEPOSIT_DISPUTE_OPERATIONS'));
  /** The live settlement: the one no other (non-deleted) settlement supersedes. */
  readonly liveId = computed(() => {
    const s = (this.h()?.settlements ?? []).filter((x) => !x.deletedAt);
    const superseded = new Set(s.map((x) => x.supersedesSettlementId).filter(Boolean));
    return s.find((x) => !superseded.has(x.id))?.id ?? null;
  });
  /** Settlements ordered root → revisions (display order only). */
  readonly chain = computed(() => [...(this.h()?.settlements ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  readonly isEmpty = computed(() => {
    const x = this.h();
    return !!x && !x.offlineEvents.length && !x.settlements.length && !x.refunds.length && !x.disputes.length;
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.bookingId.set(p.get('bookingId') ?? '');
      this.target.set(null);
      this.load();
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.depositHistory(this.bookingId()).subscribe({
      next: (x) => {
        this.h.set(x);
        this.loading.set(false);
        this.svc.bookingContext(this.bookingId()).pipe(catchError(() => of(null))).subscribe((b) => this.ctx.set(b));
      },
      error: (e) => { this.loading.set(false); this.h.set(null); this.error.set(disputeErrorCopy(apiErrorInfo(e)).message); },
    });
  }

  choose(t: OpenTarget): void { this.target.set(t); }

  chooseOffline(e: BookingDepositHistory['offlineEvents'][number]): void {
    const refund = e.eventType === 'DEPOSIT_REFUND';
    this.choose({
      key: 'oe-' + e.id, type: refund ? 'OFFLINE_REFUND' : 'OFFLINE_COLLECTION', refs: { offlineEventId: e.id },
      summary: `${refund ? 'offline refund' : 'offline collection'} of ${new InrPipe().transform(e.amountPaisa, 'full')} on ${e.eventDate}`,
    });
  }

  onOpened(id: string): void {
    this.target.set(null);
    void this.router.navigate(['/finance/deposit-disputes', id]);
  }
}
