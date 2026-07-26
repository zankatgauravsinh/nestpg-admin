import { Pipe, PipeTransform } from '@angular/core';

/**
 * Converts an integer paise value to a formatted Indian Rupee string.
 * Usage: {{ 120050 | paise }} → "₹1,200.50"
 * Usage: {{ 120000 | paise }} → "₹1,200"
 */
@Pipe({ name: 'paise', standalone: true })
export class PaisePipe implements PipeTransform {
  transform(paise: number | null | undefined, showDecimal = false): string {
    if (paise == null) return '—';
    const rupees = paise / 100;
    const hasDecimal = paise % 100 !== 0;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: showDecimal || hasDecimal ? 2 : 0,
      maximumFractionDigits: showDecimal || hasDecimal ? 2 : 0,
    }).format(rupees);
  }
}

/** Convert rupees (number) → paise (integer) for API submission */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Convert paise (integer) → rupees (number) for display */
export function toRupees(paise: number): number {
  return paise / 100;
}
