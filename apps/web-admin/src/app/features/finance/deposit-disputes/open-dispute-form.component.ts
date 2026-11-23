import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  DepositDisputesService, DisputeTargetRefs, DisputeTargetType, DISPUTE_TEXT_MAX, openBodyFor,
} from '../../../core/data/deposit-disputes.service';
import { apiErrorInfo } from '../../../core/http/api-error-info';
import { DisputeConfirmPanelComponent } from './dispute-confirm-panel.component';
import { DisputeErrorCopy, disputeErrorCopy, TARGET_LABEL } from './dispute-copy';

/**
 * ADM-D.1 — open an ADMIN case (or a reconsideration of a resolved case) through
 * `POST /admin/deposit-disputes`. The target ids come from the backend's own rows
 * (deposit history / the resolved case); the body carries exactly the ids the type
 * takes (`openBodyFor`). There is no eligibility preview: the server decides on submit.
 * Two steps — reason, then an explicit confirmation that states the freeze.
 */
@Component({
  selector: 'os-open-dispute-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, DisputeConfirmPanelComponent],
  template: `
    <div class="rounded-lg border border-border bg-panel p-4 space-y-3" data-testid="open-form">
      <p class="text-sm font-semibold text-content">{{ supersedesDisputeId() ? 'Open a reconsideration' : 'Open an admin case' }}</p>
      <p class="text-[13px] text-muted">
        <span class="font-medium text-content">{{ typeLabel() }}</span> — {{ targetSummary() }}
      </p>
      @if (step() === 'reason') {
        <label class="block text-[12px] font-medium text-muted" [attr.for]="reasonId">Reason (visible to the resident and the property)</label>
        <textarea [id]="reasonId" [(ngModel)]="reason" [maxlength]="max + 1" rows="3" data-testid="open-reason"
                  class="w-full rounded-lg border border-border bg-canvas p-2 text-sm text-content focus-visible:ring-2 focus-visible:ring-accent"
                  [attr.aria-invalid]="touched() && !!reasonError()" [attr.aria-describedby]="reasonId + '-hint'"></textarea>
        <p [id]="reasonId + '-hint'" class="text-[11px]" [class]="touched() && reasonError() ? 'text-danger' : 'text-faint'">
          {{ touched() && reasonError() ? reasonError() : reason.trim().length + '/' + max }}
        </p>
        <div class="flex gap-2">
          <button type="button" (click)="review()" data-testid="open-review"
                  class="h-9 px-4 rounded-lg bg-accent text-white text-[13px] font-semibold focus-visible:ring-2 focus-visible:ring-accent">Review</button>
          <button type="button" (click)="cancelled.emit()" class="h-9 px-3 rounded-lg border border-border text-[13px] text-content">Cancel</button>
        </div>
      } @else {
        <os-dispute-confirm heading="Open this case?" confirmLabel="Open case" tone="warning" [busy]="busy()"
                            (confirmed)="submit()" (cancelled)="step.set('reason')">
          <p>While this case is open, deposit refunds on this booking are paused (online refund, offline refund record and confirmation), and an open case on an offline collection also pauses settlement finalization. The pause lifts when the case is resolved or withdrawn.</p>
          <p class="text-muted">Reason: “{{ reason.trim() }}”</p>
        </os-dispute-confirm>
      }
      @if (error(); as err) {
        <div role="alert" class="text-[13px] text-danger" data-testid="open-error">
          {{ err.message }}
          @if (err.linkDisputeId) { <a [routerLink]="['/finance/deposit-disputes', err.linkDisputeId]" class="underline ml-1">{{ err.linkLabel }}</a> }
          @if (err.uncertain) { <a [routerLink]="['/finance/deposit-disputes']" [queryParams]="{ bookingId: bookingId(), status: 'OPEN' }" class="underline ml-1">Check this booking’s open cases</a> }
        </div>
      }
    </div>
  `,
})
export class OpenDisputeFormComponent {
  private readonly svc = inject(DepositDisputesService);
  readonly bookingId = input.required<string>();
  readonly targetType = input.required<DisputeTargetType>();
  readonly refs = input.required<Partial<DisputeTargetRefs>>();
  readonly targetSummary = input<string>('');
  readonly supersedesDisputeId = input<string | null>(null);
  readonly opened = output<string>();
  readonly cancelled = output<void>();

  readonly max = DISPUTE_TEXT_MAX;
  readonly reasonId = `open-reason-${Math.random().toString(36).slice(2, 8)}`;
  reason = '';
  readonly step = signal<'reason' | 'confirm'>('reason');
  readonly touched = signal(false);
  readonly busy = signal(false);
  readonly error = signal<DisputeErrorCopy | null>(null);
  readonly typeLabel = computed(() => TARGET_LABEL[this.targetType()]);

  reasonError(): string | null {
    const t = this.reason.trim();
    if (!t) return 'Enter a reason.';
    if (t.length > this.max) return `Keep it under ${this.max} characters.`;
    return null;
  }

  review(): void {
    this.touched.set(true);
    if (this.reasonError()) return;
    this.error.set(null);
    this.step.set('confirm');
  }

  submit(): void {
    if (this.busy() || this.reasonError()) return;
    this.busy.set(true);
    this.error.set(null);
    const body = openBodyFor(this.bookingId(), this.targetType(), this.refs(), this.reason.trim(), this.supersedesDisputeId());
    this.svc.open(body).subscribe({
      next: (r) => { this.busy.set(false); this.opened.emit(r.id); },
      // Never retried automatically: a lost response may mean the case WAS opened.
      error: (e) => { this.busy.set(false); this.step.set('reason'); this.error.set(disputeErrorCopy(apiErrorInfo(e))); },
    });
  }
}
