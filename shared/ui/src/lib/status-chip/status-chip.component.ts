import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ChipVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand';

// Map raw status string values (not enum references) to avoid duplicate key issues
// when two enums share the same underlying string (e.g., REJECTED, RESERVED)
const STATUS_VARIANT_MAP: Record<string, ChipVariant> = {
  // Booking
  'CHECKED_IN':     'success',
  'NOTICE_GIVEN':   'info',
  'CHECKED_OUT':    'neutral',
  'NO_SHOW':        'danger',
  // Shared: RESERVED appears in both BookingStatus and BedStatus → warning
  'RESERVED':       'warning',
  // Shared: CANCELLED appears in bookings → danger
  'CANCELLED':      'danger',
  // KYC / Property: APPROVED / VERIFIED → success
  'APPROVED':       'success',
  'VERIFIED':       'success',
  'SUBMITTED':      'info',
  'PENDING_REVIEW': 'warning',
  'PENDING':        'warning',
  // Shared: REJECTED appears in KYC and Property → danger
  'REJECTED':       'danger',
  'DRAFT':          'neutral',
  // Bed
  'AVAILABLE':      'success',
  'OCCUPIED':       'neutral',
  'BLOCKED':        'danger',
  'MAINTENANCE':    'warning',
  // User
  'ACTIVE':         'success',
  'SUSPENDED':      'danger',
  'PENDING_VERIFICATION': 'warning',
};

const VARIANT_CLASSES: Record<ChipVariant, string> = {
  success: 'bg-green-50 text-green-700 border-green-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger:  'bg-red-50 text-red-700 border-red-200',
  info:    'bg-sky-50 text-sky-700 border-sky-200',
  neutral: 'bg-gray-100 text-gray-600 border-gray-200',
  brand:   'bg-indigo-50 text-indigo-700 border-indigo-200',
};

const DOT_CLASSES: Record<ChipVariant, string> = {
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  danger:  'bg-red-500',
  info:    'bg-sky-500',
  neutral: 'bg-gray-400',
  brand:   'bg-indigo-500',
};

@Component({
  selector: 'nestpg-status-chip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border
             {{ variantClasses }}"
    >
      <span class="w-1.5 h-1.5 rounded-full {{ dotClass }}"></span>
      {{ label() ?? formatLabel(status()) }}
    </span>
  `,
})
export class StatusChipComponent {
  readonly status = input.required<string>();
  readonly label  = input<string | null>(null);

  get variantClasses(): string {
    return VARIANT_CLASSES[this.variant];
  }

  get dotClass(): string {
    return DOT_CLASSES[this.variant];
  }

  private get variant(): ChipVariant {
    return STATUS_VARIANT_MAP[this.status()] ?? 'neutral';
  }

  protected formatLabel(status: string): string {
    return status
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
