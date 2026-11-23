import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import {
  AdminDisputeDetail, BookingContext, DepositDisputesService, DisputeEffect, DisputeFinding,
  DISPUTE_ALLOWED_EFFECTS, DISPUTE_FINDINGS, DISPUTE_RESOLUTION_VERSION, DISPUTE_TEXT_MAX,
} from '../../../core/data/deposit-disputes.service';
import { apiErrorInfo } from '../../../core/http/api-error-info';
import { SessionStore } from '../../../core/auth/session.store';
import { InrPipe } from '../../../shared/pipes/inr.pipe';
import { StatusPillComponent } from '../../../shared/components/status-pill.component';
import { DisputeConfirmPanelComponent } from './dispute-confirm-panel.component';
import { OpenDisputeFormComponent } from './open-dispute-form.component';
import {
  DisputeErrorCopy, disputeErrorCopy, EFFECT_APPLY_TEXT, EFFECT_LABEL, EFFECT_STATE_LABEL, effectState, eventLabel, eventMeta,
  FINDING_LABEL, shortId, SIDE_LABEL, STATUS_LABEL, supersedeRule, TARGET_LABEL,
} from './dispute-copy';

type Panel = null | 'withdraw' | 'resolve' | 'resolve-confirm' | 'execute' | 'reconsider';

/**
 * ADM-D.1 — one deposit dispute for operators (`GET /admin/deposit-disputes/:id`),
 * with the booking's deposit context (`GET /bookings/:id`, degrades on 404) and the
 * actions the backend offers: note, withdraw (admin cases), resolve, apply the
 * recorded outcome, reconsider. Rules the UI follows:
 *
 *  • Controls are shown from capability + state (presentation only); the server
 *    re-checks everything and its refusal is shown verbatim-mapped (§11 copy).
 *  • Resolve and apply are two separate calls with two confirmations; a recorded
 *    non-NONE outcome is shown as "recorded — not applied" until the server says so.
 *  • Apply sends an EMPTY body. No amount is ever computed or sent by this page.
 *  • After every mutation — success or failure — the case is re-read from the server.
 *    Nothing is retried automatically; an ambiguous failure says so and re-reads first.
 *  • Only the admin projection's fields are rendered; event metadata is whitelisted.
 */
@Component({
  selector: 'os-deposit-dispute-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, RouterLink, InrPipe, StatusPillComponent, DisputeConfirmPanelComponent, OpenDisputeFormComponent],
  template: `
    <div class="p-4 sm:p-6 max-w-[1100px] mx-auto space-y-5">
      <a routerLink="/finance/deposit-disputes" class="text-[13px] text-accent underline-offset-2 hover:underline">← Deposit disputes</a>

      @if (loading() && !d()) {
        <div data-testid="detail-loading" role="status" class="rounded-xl border border-border bg-panel p-10 text-center text-sm text-muted">Loading the case…</div>
      } @else if (loadError(); as err) {
        <div data-testid="detail-error" role="alert" class="rounded-xl border border-danger/40 bg-danger-subtle p-8 text-center">
          <p class="text-sm font-semibold text-content">The case could not be loaded.</p>
          <p class="text-sm text-muted">{{ err }}</p>
          <button type="button" (click)="load()" class="mt-4 h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold">Try again</button>
        </div>
      } @else if (d(); as c) {
        <!-- 1. Identity + status -->
        <header class="space-y-2" data-testid="identity">
          <div class="flex flex-wrap items-center gap-3">
            <h1 class="text-2xl font-bold text-content">{{ targetLabel[c.targetType] }}@if (c.target.deductionId) { <span> · one deduction</span> }</h1>
            <span data-testid="status"><os-status-pill [status]="c.status" [label]="statusLabel[c.status]" /></span>
          </div>
          <p class="text-[13px] text-muted">
            Case {{ short(c.id) }} · opened {{ c.createdAt | date: 'd MMM y, HH:mm' }} by {{ sideLabel[c.openedSide] }} ({{ short(c.openedBy) }})
            · booking <span class="font-medium text-content">{{ c.bookingNumber ?? short(c.bookingId) }}</span>@if (c.bookingStatus) { ({{ c.bookingStatus }}) }
          </p>
          @if (c.status === 'OPEN') {
            <p class="text-[13px] text-warning" data-testid="freeze-note">While this case is open, deposit refund execution on this booking is paused.</p>
          }
        </header>

        @if (banner(); as b) {
          <div role="status" data-testid="banner" class="rounded-lg border border-border bg-panel px-4 py-3 text-sm text-content">{{ b }}</div>
        }
        @if (actionError(); as ae) {
          <div role="alert" data-testid="action-error" class="rounded-lg border border-danger/40 bg-danger-subtle px-4 py-3 text-sm text-content">
            {{ ae.message }}
            @if (ae.linkDisputeId) { <a [routerLink]="['/finance/deposit-disputes', ae.linkDisputeId]" class="underline ml-1" data-testid="error-link">{{ ae.linkLabel }}</a> }
          </div>
        }

        <!-- 3. Booking context -->
        <section class="rounded-xl border border-border bg-panel p-4" data-testid="booking-context" aria-labelledby="sec-booking">
          <h2 id="sec-booking" class="text-sm font-semibold text-content mb-2">Booking</h2>
          @if (booking(); as b) {
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
              <dt class="text-muted">Resident</dt><dd class="text-content">{{ b.tenantName ?? '—' }}</dd>
              <dt class="text-muted">Property</dt><dd class="text-content">{{ b.propertyName ?? '—' }}</dd>
              <dt class="text-muted">Room / bed</dt><dd class="text-content">{{ b.roomNumber ?? '—' }}{{ b.bedLabel ? ' · ' + b.bedLabel : '' }}</dd>
              <dt class="text-muted">Booking status</dt><dd class="text-content">{{ b.status }}</dd>
              @if (b.depositRefund; as r) {
                <dt class="text-muted">Deposit refund (server state)</dt>
                <dd class="text-content" data-testid="refund-state">{{ r.rail }} · {{ r.state }} · {{ r.amountPaisa | inr: 'full' }}@if (r.state === 'ON_HOLD') { <span class="text-danger"> — needs support</span> }</dd>
              }
            </dl>
          } @else if (bookingUnavailable()) {
            <p class="text-[13px] text-muted" data-testid="booking-unavailable">Booking details are not available (the booking may have been deleted). The case below is unaffected.</p>
          }
          <a [routerLink]="['/finance/deposits', c.bookingId]" class="inline-block mt-2 text-[13px] text-accent underline-offset-2 hover:underline" data-testid="history-link">Deposit history</a>
        </section>

        <!-- 2. Target facts -->
        <section class="rounded-xl border border-border bg-panel p-4" data-testid="target-facts" aria-labelledby="sec-target">
          <h2 id="sec-target" class="text-sm font-semibold text-content mb-2">What is disputed</h2>
          @if (c.targetFacts.offlineEvent; as e) {
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[13px]" data-testid="facts-offline-event">
              <dt class="text-muted">Offline record</dt><dd>{{ e.eventType }} · {{ e.status }}</dd>
              <dt class="text-muted">Amount</dt><dd>{{ e.amountPaisa | inr: 'full' }} by {{ e.method }} on {{ e.eventDate }}</dd>
              <dt class="text-muted">Recorded</dt><dd>{{ e.initiatorSide }} ({{ short(e.recordedBy) }}) · {{ e.recordedAt | date: 'd MMM y, HH:mm' }}</dd>
              @if (e.confirmedAt) { <dt class="text-muted">Confirmed</dt><dd>{{ short(e.confirmedBy) }} · {{ e.confirmedAt | date: 'd MMM y, HH:mm' }}</dd> }
              @if (e.rejectedAt) { <dt class="text-muted">Rejected</dt><dd>{{ short(e.rejectedBy) }} · {{ e.rejectionReason ?? '' }}</dd> }
              @if (e.withdrawnAt) { <dt class="text-muted">Withdrawn</dt><dd>{{ short(e.withdrawnBy) }} · {{ e.withdrawnAt | date: 'd MMM y, HH:mm' }}</dd> }
            </dl>
          }
          @if (c.targetFacts.settlement; as s) {
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[13px] mt-2" data-testid="facts-settlement">
              <dt class="text-muted">Settlement</dt><dd>{{ s.status }}{{ s.automatic ? ' · automatic' : '' }} ({{ short(s.id) }})</dd>
              <dt class="text-muted">Deposit</dt><dd>{{ s.depositAmountPaisa | inr: 'full' }}</dd>
              <dt class="text-muted">Deductions</dt><dd>{{ s.totalDeductionsPaisa | inr: 'full' }}</dd>
              <dt class="text-muted">Refundable</dt><dd class="font-semibold">{{ s.refundablePaisa | inr: 'full' }}</dd>
              @if (s.settledAt) { <dt class="text-muted">Settled</dt><dd>{{ short(s.settledBy) }} · {{ s.settledAt | date: 'd MMM y, HH:mm' }}</dd> }
              @if (s.supersedesSettlementId) { <dt class="text-muted">Revises settlement</dt><dd>{{ short(s.supersedesSettlementId) }}</dd> }
            </dl>
            @if (s.deductions.length) {
              <ul class="mt-2 space-y-1 text-[13px]" data-testid="facts-deductions">
                @for (l of s.deductions; track l.id) {
                  <li [class]="l.id === c.target.deductionId ? 'font-semibold text-content' : 'text-muted'" [attr.data-testid]="'deduction-' + l.id">
                    {{ l.reason }}{{ l.category ? ' · ' + l.category : '' }} — {{ l.amountPaisa | inr: 'full' }}@if (l.id === c.target.deductionId) { <span> (disputed)</span> }
                  </li>
                }
              </ul>
            }
          }
          @if (c.targetFacts.refund; as r) {
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[13px] mt-2" data-testid="facts-refund">
              <dt class="text-muted">Refund</dt><dd>{{ r.refundNumber }} · {{ r.status }}</dd>
              <dt class="text-muted">Amount</dt><dd>{{ r.amountPaisa | inr: 'full' }}</dd>
              <dt class="text-muted">Gateway payment / refund</dt><dd>{{ r.gatewayPaymentId ?? '—' }} / {{ r.gatewayRefundId ?? '—' }}</dd>
              @if (r.processedAt) { <dt class="text-muted">Processed</dt><dd>{{ r.processedAt | date: 'd MMM y, HH:mm' }}</dd> }
            </dl>
            @if (r.transactions.length) {
              <ul class="mt-2 space-y-0.5 text-[12px] text-muted" data-testid="facts-transactions">
                @for (t of r.transactions; track t.id) { <li>{{ t.kind }} · {{ t.gatewayRef ?? '—' }} · {{ t.createdAt | date: 'd MMM y, HH:mm' }}</li> }
              </ul>
            }
          }
        </section>

        <!-- 4. Party-visible statements -->
        <section class="rounded-xl border border-border bg-panel p-4" data-testid="statements" aria-labelledby="sec-statements">
          <h2 id="sec-statements" class="text-sm font-semibold text-content mb-2">Statements (visible to the resident and the property)</h2>
          <ul class="space-y-2 text-[13px]">
            @for (e of statements(); track e.id) {
              <li [attr.data-testid]="'statement-' + e.id"><span class="text-muted">{{ sideLabel[e.actorSide] }} · {{ e.createdAt | date: 'd MMM y, HH:mm' }}</span><br />“{{ e.note }}”</li>
            }
          </ul>
        </section>

        <!-- 5. Internal notes -->
        <section class="rounded-xl border border-border bg-panel p-4" data-testid="notes" aria-labelledby="sec-notes">
          <h2 id="sec-notes" class="text-sm font-semibold text-content mb-2">Internal notes (admins only)</h2>
          @if (!notes().length) { <p class="text-[13px] text-muted" data-testid="notes-empty">No notes yet.</p> }
          <ul class="space-y-2 text-[13px]">
            @for (e of notes(); track e.id) {
              <li [attr.data-testid]="'note-' + e.id"><span class="text-muted">{{ short(e.actorId) }} · {{ e.createdAt | date: 'd MMM y, HH:mm' }}</span><br />{{ e.note }}</li>
            }
          </ul>
          @if (canNote()) {
            <div class="mt-3 space-y-2" data-testid="note-form">
              <label for="dd-note" class="block text-[12px] font-medium text-muted">Add a note</label>
              <textarea id="dd-note" [(ngModel)]="noteText" [maxlength]="max + 1" rows="2" data-testid="note-text" [disabled]="noteBusy()"
                        class="w-full rounded-lg border border-border bg-canvas p-2 text-sm text-content focus-visible:ring-2 focus-visible:ring-accent"
                        aria-describedby="dd-note-hint"></textarea>
              <p id="dd-note-hint" class="text-[11px]" [class]="noteError() ? 'text-danger' : 'text-faint'">{{ noteError() ?? noteText.trim().length + '/' + max }}</p>
              @if (noteUncertain()) {
                <p role="status" class="text-[12px] text-warning" data-testid="note-uncertain">We could not confirm whether the note was saved. The case was refreshed — check the notes above before sending again.</p>
              }
              <button type="button" (click)="addNote()" [disabled]="noteBusy() || !!noteError() || loading()" data-testid="note-submit"
                      class="h-9 px-4 rounded-lg bg-accent text-white text-[13px] font-semibold disabled:opacity-60">{{ noteBusy() ? 'Saving…' : 'Add note' }}</button>
            </div>
          }
        </section>

        <!-- 7 + 8. Resolution and execution -->
        @if (c.status === 'RESOLVED' && c.finding && c.effect) {
          <section class="rounded-xl border border-border bg-panel p-4" data-testid="resolution" aria-labelledby="sec-resolution">
            <h2 id="sec-resolution" class="text-sm font-semibold text-content mb-2">Resolution</h2>
            <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[13px]">
              <dt class="text-muted">Finding</dt><dd data-testid="finding">{{ findingLabel[c.finding] }}</dd>
              <dt class="text-muted">Outcome</dt><dd data-testid="effect">{{ effectLabel[c.effect] }}</dd>
              <dt class="text-muted">Outcome state</dt>
              <dd data-testid="effect-state" [class]="state(c) === 'pending' ? 'text-warning font-semibold' : 'text-content'">{{ stateLabel[state(c)] }}@if (c.effectExecutedAt && state(c) === 'applied') { · {{ c.effectExecutedAt | date: 'd MMM y, HH:mm' }} }</dd>
              <dt class="text-muted">Reason (visible to both parties)</dt><dd>“{{ c.resolutionReason }}”</dd>
              <dt class="text-muted">Resolved</dt><dd>{{ short(c.resolvedBy) }} · {{ c.resolvedAt | date: 'd MMM y, HH:mm' }}@if (c.resolutionVersion) { · {{ c.resolutionVersion }} }</dd>
              @if (c.effectExecutionRef) { <dt class="text-muted">Settlement acted on</dt><dd data-testid="execution-ref">{{ short(c.effectExecutionRef) }}</dd> }
              @if (lastFailure(); as f) { <dt class="text-muted">Last apply attempt</dt><dd class="text-danger" data-testid="last-failure">refused: {{ f }}</dd> }
            </dl>
          </section>
        }
        @if (c.status === 'WITHDRAWN') {
          <p class="text-[13px] text-muted" data-testid="withdrawn-note">Withdrawn {{ c.withdrawnAt | date: 'd MMM y, HH:mm' }}. No decision was recorded and no money moved.</p>
        }

        <!-- 9. Relationships -->
        @if (c.supersedesDisputeId || c.supersededByDisputeId) {
          <section class="rounded-xl border border-border bg-panel p-4 text-[13px]" data-testid="relationships" aria-labelledby="sec-rel">
            <h2 id="sec-rel" class="text-sm font-semibold text-content mb-2">Related cases</h2>
            @if (c.supersedesDisputeId) { <p>Reconsiders <a [routerLink]="['/finance/deposit-disputes', c.supersedesDisputeId]" class="text-accent underline">case {{ short(c.supersedesDisputeId) }}</a></p> }
            @if (c.supersededByDisputeId) { <p>Reconsidered by <a [routerLink]="['/finance/deposit-disputes', c.supersededByDisputeId]" class="text-accent underline">case {{ short(c.supersededByDisputeId) }}</a></p> }
          </section>
        }

        <!-- 10. Actions -->
        @if (canWithdraw() || canResolve() || canExecute() || canReconsider()) {
          <section class="rounded-xl border border-border bg-panel p-4 space-y-3" data-testid="actions" aria-labelledby="sec-actions">
            <h2 id="sec-actions" class="text-sm font-semibold text-content">Actions</h2>
            @if (panel() === null) {
              <div class="flex flex-wrap gap-2">
                @if (canResolve()) { <button type="button" (click)="startResolve()" data-testid="resolve-start" class="h-9 px-4 rounded-lg bg-accent text-white text-[13px] font-semibold">Resolve</button> }
                @if (canExecute()) { <button type="button" (click)="openPanel('execute')" data-testid="execute-start" class="h-9 px-4 rounded-lg bg-warning text-white text-[13px] font-semibold">Apply outcome</button> }
                @if (canWithdraw()) { <button type="button" (click)="openPanel('withdraw')" data-testid="withdraw-start" class="h-9 px-4 rounded-lg border border-danger text-danger text-[13px] font-medium">Withdraw case</button> }
                @if (canReconsider()) { <button type="button" (click)="openPanel('reconsider')" data-testid="reconsider-start" class="h-9 px-4 rounded-lg border border-border text-content text-[13px] font-medium">Open reconsideration</button> }
              </div>
            }

            @if (panel() === 'withdraw') {
              <os-dispute-confirm heading="Withdraw this case?" confirmLabel="Withdraw case" tone="danger" [busy]="busy()" (confirmed)="withdraw()" (cancelled)="closePanel()">
                <p>The case closes without a decision and the refund pause it holds lifts. Withdrawing does not reverse any money movement that has already happened.</p>
              </os-dispute-confirm>
            }

            @if (panel() === 'resolve') {
              <form class="space-y-3" data-testid="resolve-form" (submit)="$event.preventDefault(); reviewResolve()">
                <fieldset>
                  <legend class="text-[12px] font-medium text-muted mb-1">Finding</legend>
                  <div class="flex flex-wrap gap-3">
                    @for (f of findings; track f) {
                      <label class="inline-flex items-center gap-2 text-[13px]"><input type="radio" name="finding" [value]="f" [(ngModel)]="finding" (ngModelChange)="onFinding()" [attr.data-testid]="'finding-' + f" /> {{ findingLabel[f] }}</label>
                    }
                  </div>
                </fieldset>
                <fieldset>
                  <legend class="text-[12px] font-medium text-muted mb-1">Outcome</legend>
                  <div class="space-y-1">
                    @for (e of allowedEffects(); track e) {
                      <label class="flex items-start gap-2 text-[13px]" [class.opacity-60]="effectDisabled(e)">
                        <!-- [attr.disabled], not [disabled]: radios sharing a name share ONE ngModel control, so NgModel's disabled input would disable the whole group. -->
                        <input type="radio" name="effect" [value]="e" [(ngModel)]="effect" [attr.disabled]="effectDisabled(e) ? '' : null" [attr.data-testid]="'effect-' + e" />
                        <span>{{ effectLabel[e] }}
                          @if (e === 'SETTLEMENT_SUPERSEDED') { <span class="block text-[12px] text-muted" data-testid="supersede-rule">{{ rule().text }}</span> }
                          @if (e !== 'NONE' && finding !== 'UPHELD') { <span class="block text-[12px] text-muted">Only an upheld finding can change the deposit.</span> }
                        </span>
                      </label>
                    }
                  </div>
                </fieldset>
                <div>
                  <label for="dd-res-reason" class="block text-[12px] font-medium text-muted">Resolution reason — shown to the resident and the property</label>
                  <textarea id="dd-res-reason" [(ngModel)]="resolutionReason" name="resolutionReason" [maxlength]="max + 1" rows="3" data-testid="resolution-reason"
                            class="w-full rounded-lg border border-border bg-canvas p-2 text-sm text-content" aria-describedby="dd-res-hint"></textarea>
                  <p id="dd-res-hint" class="text-[11px]" [class]="resolveTouched() && reasonError() ? 'text-danger' : 'text-faint'">{{ resolveTouched() && reasonError() ? reasonError() : resolutionReason.trim().length + '/' + max }}</p>
                </div>
                @if (effect !== 'NONE') {
                  <label class="flex items-start gap-2 text-[13px]">
                    <input type="checkbox" [(ngModel)]="acknowledged" name="ack" data-testid="resolution-ack" />
                    <span>I have checked the facts above and approve this outcome. ({{ version }})</span>
                  </label>
                }
                @if (resolveTouched() && formError(); as fe) { <p role="alert" class="text-[12px] text-danger" data-testid="resolve-form-error">{{ fe }}</p> }
                <div class="flex gap-2">
                  <button type="submit" data-testid="resolve-review" class="h-9 px-4 rounded-lg bg-accent text-white text-[13px] font-semibold">Review</button>
                  <button type="button" (click)="closePanel()" class="h-9 px-3 rounded-lg border border-border text-[13px] text-content">Cancel</button>
                </div>
              </form>
            }

            @if (panel() === 'resolve-confirm') {
              <os-dispute-confirm heading="Record this resolution?" confirmLabel="Record resolution" [busy]="busy()" (confirmed)="resolve()" (cancelled)="panel.set('resolve')">
                <p data-testid="resolve-summary">Finding: <strong>{{ findingLabel[finding] }}</strong> · Outcome: <strong>{{ effectLabel[effect] }}</strong></p>
                <p>Reason: “{{ resolutionReason.trim() }}”</p>
                <p class="font-medium">{{ effect === 'NONE' ? 'This closes the case. Nothing changes on the deposit.' : 'This records the decision only. No money moves until the outcome is applied in a separate step.' }}</p>
              </os-dispute-confirm>
            }

            @if (panel() === 'execute' && c.effect) {
              <os-dispute-confirm heading="Apply this outcome?" confirmLabel="Apply outcome" tone="warning" [busy]="busy()" (confirmed)="execute()" (cancelled)="closePanel()">
                <p>Finding: <strong>{{ findingLabel[c.finding!] }}</strong> · Outcome: <strong>{{ effectLabel[c.effect] }}</strong></p>
                <p data-testid="execute-text">{{ applyText[c.effect] }}</p>
                @if (c.effect === 'SETTLEMENT_SUPERSEDED') { <p class="text-muted">{{ rule().text }}</p> }
                @if (c.effect === 'OFFLINE_REFUND_CONFIRMED' && c.targetFacts.settlement; as s) { <p class="text-muted">Settlement refundable amount (server figure): {{ s.refundablePaisa | inr: 'full' }}</p> }
                <p class="font-medium text-content">This changes the deposit's financial state.</p>
              </os-dispute-confirm>
            }

            @if (panel() === 'reconsider') {
              <os-open-dispute-form [bookingId]="c.bookingId" [targetType]="c.targetType" [refs]="c.target" [supersedesDisputeId]="c.id"
                                    [targetSummary]="'same item as case ' + short(c.id)" (opened)="onOpened($event)" (cancelled)="closePanel()" />
            }
          </section>
        }

        <!-- 6. Full history -->
        <section class="rounded-xl border border-border bg-panel p-4" data-testid="history" aria-labelledby="sec-history">
          <h2 id="sec-history" class="text-sm font-semibold text-content mb-2">History</h2>
          <ol class="space-y-2 text-[13px]">
            @for (e of c.events; track e.id) {
              <li [attr.data-testid]="'event-' + e.action">
                <span class="font-medium text-content">{{ eventLabel(e.action) }}</span>
                <span class="text-muted"> · {{ sideLabel[e.actorSide] }}{{ e.actorId ? ' (' + short(e.actorId) + ')' : '' }} · {{ e.createdAt | date: 'd MMM y, HH:mm:ss' }}</span>
                @for (m of eventMeta(e); track m.key) { <span class="block text-[12px] text-muted">{{ m.label }}: {{ m.value }}</span> }
              </li>
            }
          </ol>
        </section>
      }
    </div>
  `,
})
export class DepositDisputeDetailComponent {
  private readonly svc = inject(DepositDisputesService);
  private readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly targetLabel = TARGET_LABEL;
  readonly statusLabel = STATUS_LABEL;
  readonly sideLabel = SIDE_LABEL;
  readonly findingLabel = FINDING_LABEL;
  readonly effectLabel = EFFECT_LABEL;
  readonly stateLabel = EFFECT_STATE_LABEL;
  readonly applyText = EFFECT_APPLY_TEXT;
  readonly findings = DISPUTE_FINDINGS;
  readonly version = DISPUTE_RESOLUTION_VERSION;
  readonly max = DISPUTE_TEXT_MAX;
  readonly short = shortId;
  readonly state = effectState;
  readonly eventLabel = eventLabel;
  readonly eventMeta = eventMeta;

  readonly id = signal<string>('');
  readonly d = signal<AdminDisputeDetail | null>(null);
  readonly booking = signal<BookingContext | null>(null);
  readonly bookingUnavailable = signal(false);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly busy = signal(false);
  readonly panel = signal<Panel>(null);
  readonly banner = signal<string | null>(null);
  readonly actionError = signal<DisputeErrorCopy | null>(null);

  // notes
  noteText = '';
  readonly noteBusy = signal(false);
  readonly noteUncertain = signal(false);
  // resolve form
  finding: DisputeFinding = 'UPHELD';
  effect: DisputeEffect = 'NONE';
  resolutionReason = '';
  acknowledged = false;
  readonly resolveTouched = signal(false);

  private readonly can = (c: Parameters<SessionStore['hasCapability']>[0]) => this.session.hasCapability(c);
  readonly statements = computed(() => (this.d()?.events ?? []).filter((e) => e.action === 'OPENED' || e.action === 'COUNTER_STATEMENT'));
  readonly notes = computed(() => (this.d()?.events ?? []).filter((e) => e.action === 'NOTE_ADDED'));
  readonly lastFailure = computed(() => {
    const c = this.d();
    if (!c || c.effectExecuted) return null;
    const fails = c.events.filter((e) => e.action === 'EFFECT_EXECUTION_FAILED');
    const code = fails.length ? fails[fails.length - 1]!.metadata?.['code'] : null;
    return typeof code === 'string' ? code : null;
  });
  readonly canNote = computed(() => this.d()?.status === 'OPEN' && this.can('DEPOSIT_DISPUTE_OPERATIONS'));
  readonly canWithdraw = computed(() => {
    const c = this.d();
    if (!c || c.status !== 'OPEN' || c.openedSide !== 'ADMIN' || !this.can('DEPOSIT_DISPUTE_OPERATIONS')) return false;
    return c.openedBy === this.session.user()?.id || this.can('DEPOSIT_DISPUTE_RESOLUTION');
  });
  readonly canResolve = computed(() => this.d()?.status === 'OPEN' && this.can('DEPOSIT_DISPUTE_RESOLUTION'));
  readonly canExecute = computed(() => {
    const c = this.d();
    return !!c && c.status === 'RESOLVED' && c.effectExecuted === false && this.can('DEPOSIT_DISPUTE_RESOLUTION');
  });
  readonly canReconsider = computed(() => {
    const c = this.d();
    return !!c && c.status === 'RESOLVED' && !c.supersededByDisputeId && !c.supersedesDisputeId && this.can('DEPOSIT_DISPUTE_OPERATIONS');
  });
  readonly allowedEffects = computed(() => (this.d() ? DISPUTE_ALLOWED_EFFECTS[this.d()!.targetType] : ['NONE' as DisputeEffect]));
  readonly rule = computed(() => (this.d() ? supersedeRule(this.d()!) : { derivable: false, text: '' }));

  constructor() {
    // The component is reused when a link points at another case (e.g. the blocking case):
    // follow the route parameter, and start each case with a clean action state.
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      const next = p.get('id') ?? '';
      if (next === this.id() && this.d()) return;
      this.id.set(next);
      this.d.set(null);
      this.booking.set(null);
      this.bookingUnavailable.set(false);
      this.panel.set(null);
      this.actionError.set(null);
      this.noteUncertain.set(false);
      this.load();
    });
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.svc.detail(this.id()).subscribe({
      next: (c) => {
        this.d.set(c);
        this.loading.set(false);
        // Context only: a 404 (deleted booking) degrades, it does not fail the case.
        this.svc.bookingContext(c.bookingId).pipe(catchError(() => of(null))).subscribe((b) => {
          this.booking.set(b);
          this.bookingUnavailable.set(!b);
        });
      },
      error: (e) => {
        this.loading.set(false);
        this.loadError.set(disputeErrorCopy(apiErrorInfo(e)).message);
      },
    });
  }

  openPanel(p: Panel): void { this.actionError.set(null); this.banner.set(null); this.panel.set(p); }
  closePanel(): void { this.panel.set(null); }

  // ── notes (not idempotent: never retried) ──
  noteError(): string | null {
    const t = this.noteText.trim();
    if (!t) return null; // the button is disabled; no nagging on an empty box
    return t.length > this.max ? `Keep it under ${this.max} characters.` : null;
  }
  addNote(): void {
    const t = this.noteText.trim();
    if (!t || this.noteError() || this.noteBusy()) return;
    this.noteBusy.set(true);
    this.noteUncertain.set(false);
    this.actionError.set(null);
    this.svc.addNote(this.id(), t).subscribe({
      next: () => { this.noteBusy.set(false); this.noteText = ''; this.banner.set('Note added.'); this.load(); },
      error: (e) => {
        this.noteBusy.set(false);
        const copy = disputeErrorCopy(apiErrorInfo(e));
        if (copy.uncertain) this.noteUncertain.set(true); else this.actionError.set(copy);
        if (copy.refresh) this.load();
      },
    });
  }

  // ── withdraw ──
  withdraw(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.svc.withdraw(this.id()).subscribe({
      next: () => { this.done('Case withdrawn. The refund pause it held has lifted.'); },
      error: (e) => this.failed(e),
    });
  }

  // ── resolve (records the decision only) ──
  startResolve(): void {
    this.finding = 'UPHELD'; this.effect = 'NONE'; this.resolutionReason = ''; this.acknowledged = false;
    this.resolveTouched.set(false);
    this.openPanel('resolve');
  }
  onFinding(): void { if (this.finding !== 'UPHELD') this.effect = 'NONE'; }
  effectDisabled(e: DisputeEffect): boolean {
    if (e === 'NONE') return false;
    if (this.finding !== 'UPHELD') return true;
    return e === 'SETTLEMENT_SUPERSEDED' && !this.rule().derivable;
  }
  reasonError(): string | null {
    const t = this.resolutionReason.trim();
    if (!t) return 'Enter a resolution reason.';
    return t.length > this.max ? `Keep it under ${this.max} characters.` : null;
  }
  formError(): string | null {
    if (this.reasonError()) return this.reasonError();
    if (this.effectDisabled(this.effect)) return 'This outcome is not available for this finding or case.';
    if (this.effect !== 'NONE' && !this.acknowledged) return 'Confirm the approval statement.';
    return null;
  }
  reviewResolve(): void {
    this.resolveTouched.set(true);
    if (this.formError()) return;
    this.panel.set('resolve-confirm');
  }
  resolve(): void {
    if (this.busy() || this.formError()) return;
    this.busy.set(true);
    const body = {
      finding: this.finding, effect: this.effect, resolutionReason: this.resolutionReason.trim(),
      ...(this.effect !== 'NONE' ? { resolutionVersion: DISPUTE_RESOLUTION_VERSION } : {}),
    };
    this.svc.resolve(this.id(), body).subscribe({
      next: (r) => this.done(r.effect === 'NONE'
        ? 'Resolved. No change to the deposit.'
        : 'Resolution recorded. The outcome has NOT been applied yet — apply it as a separate step.'),
      // A refusal that does not change the case (e.g. an outcome the server will not derive)
      // returns to the filled-in form; anything else re-reads the case.
      error: (e) => this.failed(e, 'resolve'),
    });
  }

  // ── execute (empty body; the server derives everything) ──
  execute(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.svc.executeEffect(this.id()).subscribe({
      next: (r) => this.done(r.effectExecuted ? 'Outcome applied.' : 'The server did not report the outcome as applied. Refreshed.'),
      error: (e) => this.failed(e),
    });
  }

  onOpened(id: string): void {
    this.panel.set(null);
    void this.router.navigate(['/finance/deposit-disputes', id]).then(() => this.banner.set('Reconsideration opened.'));
  }

  private done(message: string): void {
    this.busy.set(false);
    this.panel.set(null);
    this.actionError.set(null);
    this.banner.set(message);
    this.load();
  }

  private failed(e: unknown, formPanel: Panel = null): void {
    this.busy.set(false);
    const copy = disputeErrorCopy(apiErrorInfo(e));
    this.actionError.set(copy);
    if (formPanel && !copy.refresh && !copy.uncertain) {
      this.panel.set(formPanel);
      return;
    }
    this.panel.set(null);
    // Re-read the case after a state conflict or an unknown outcome; never retry automatically.
    this.load();
  }
}
