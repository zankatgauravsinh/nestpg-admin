import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type PillTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent';

const STATUS_TONE: Record<string, PillTone> = {
  // bookings
  CHECKED_IN: 'success', CONFIRMED: 'info', RESERVED: 'warning', NOTICE_GIVEN: 'info',
  CHECKED_OUT: 'neutral', CANCELLED: 'danger', NO_SHOW: 'danger', EXPIRED: 'neutral', CONVERTED: 'success',
  // payments
  PAID: 'success', DUE: 'warning', OVERDUE: 'danger', PARTIAL: 'info', REFUNDED: 'neutral',
  // tickets
  OPEN: 'warning', IN_PROGRESS: 'info', RESOLVED: 'success', ESCALATED: 'danger',
  URGENT: 'danger', HIGH: 'danger', MEDIUM: 'warning', LOW: 'neutral',
  // kyc
  PENDING: 'warning', SUBMITTED: 'info', APPROVED: 'success',
  REJECTED: 'danger', NEEDS_REVIEW: 'warning',
  // beds
  AVAILABLE: 'success', OCCUPIED: 'neutral', MAINTENANCE: 'warning', BLOCKED: 'danger',
};

const TONE_CLASS: Record<PillTone, string> = {
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
  info: 'bg-info-subtle text-info',
  accent: 'bg-accent-subtle text-accent',
  neutral: 'bg-canvas text-muted',
};

/** Status chip: subtle tinted background + dot, semibold label. */
@Component({
  selector: 'os-status-pill',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
      [class]="toneClass()"
    >
      @if (dot()) {
        <span class="w-1.5 h-1.5 rounded-full bg-current opacity-80"></span>
      }
      {{ label() ?? format(status()) }}
    </span>
  `,
})
export class StatusPillComponent {
  readonly status = input.required<string>();
  readonly label = input<string | null>(null);
  readonly tone = input<PillTone | null>(null);
  readonly dot = input<boolean>(true);

  protected readonly toneClass = computed(
    () => TONE_CLASS[this.tone() ?? STATUS_TONE[this.status()] ?? 'neutral'],
  );

  protected format(s: string): string {
    return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
