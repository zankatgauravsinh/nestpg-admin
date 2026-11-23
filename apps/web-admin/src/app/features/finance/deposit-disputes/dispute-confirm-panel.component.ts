import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, input, output, viewChild } from '@angular/core';

let seq = 0;

/**
 * ADM-D.1 — an inline confirmation step (the A2 pattern), made keyboard- and
 * screen-reader-usable: a labelled group that receives focus when it appears, Escape
 * cancels, and the confirm button is disabled while the request is in flight so a
 * double click cannot submit twice. Scoped to this feature; the shared `os-modal`
 * is not used for financial confirmations.
 */
@Component({
  selector: 'os-dispute-confirm',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="group" [attr.aria-labelledby]="headingId" (keydown.escape)="onEscape()"
         class="rounded-lg border p-4 space-y-3"
         [class]="tone() === 'danger' ? 'border-danger/40 bg-danger-subtle' : tone() === 'warning' ? 'border-warning/40 bg-warning-subtle' : 'border-border bg-panel'"
         data-testid="confirm-panel">
      <h3 #headingRef [id]="headingId" tabindex="-1" class="text-sm font-semibold text-content outline-none focus-visible:ring-2 focus-visible:ring-accent rounded">{{ heading() }}</h3>
      <div class="text-[13px] text-content space-y-2"><ng-content /></div>
      <div class="flex flex-wrap gap-2">
        <button type="button" (click)="confirmed.emit()" [disabled]="busy() || disabled()" data-testid="confirm-action"
                class="h-9 px-4 rounded-lg text-white text-[13px] font-semibold disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-accent"
                [class]="tone() === 'danger' ? 'bg-danger' : tone() === 'warning' ? 'bg-warning' : 'bg-accent'">
          {{ busy() ? 'Working…' : confirmLabel() }}
        </button>
        <button type="button" (click)="cancelled.emit()" [disabled]="busy()" data-testid="confirm-cancel"
                class="h-9 px-3 rounded-lg border border-border text-[13px] text-content focus-visible:ring-2 focus-visible:ring-accent">Cancel</button>
      </div>
    </div>
  `,
})
export class DisputeConfirmPanelComponent implements AfterViewInit {
  readonly heading = input.required<string>();
  readonly confirmLabel = input<string>('Confirm');
  readonly tone = input<'danger' | 'warning' | 'accent'>('accent');
  readonly busy = input<boolean>(false);
  readonly disabled = input<boolean>(false);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
  readonly headingId = `dispute-confirm-${++seq}`;
  private readonly headingEl = viewChild<ElementRef<HTMLElement>>('headingRef');

  ngAfterViewInit(): void {
    // Move focus to the step's heading (not the confirm button, so Enter never confirms by accident).
    queueMicrotask(() => this.headingEl()?.nativeElement.focus());
  }

  onEscape(): void {
    if (!this.busy()) this.cancelled.emit();
  }
}
