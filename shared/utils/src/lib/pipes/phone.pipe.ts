import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formats an E.164 phone number for display.
 * Usage: {{ '+919876543210' | phone }} → "+91 98765 43210"
 */
@Pipe({ name: 'phone', standalone: true })
export class PhonePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '—';
    const cleaned = value.replace(/\D/g, '');
    // Indian mobile: +91 XXXXX XXXXX
    if (cleaned.startsWith('91') && cleaned.length === 12) {
      return `+91 ${cleaned.slice(2, 7)} ${cleaned.slice(7)}`;
    }
    // Generic: show as-is
    return value;
  }
}

/** Normalize a phone string to E.164 for submission */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  return raw;
}
