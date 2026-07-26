import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formats a paise amount into a compact INR string.
 * 1872000000 (paise) -> ₹18.72L ; 312000000 -> ₹3.12L ; 950000 -> ₹9,500
 */
@Pipe({ name: 'inr', standalone: true })
export class InrPipe implements PipeTransform {
  transform(paise: number | null | undefined, mode: 'compact' | 'full' = 'compact'): string {
    if (paise == null) return '—';
    const rupees = paise / 100;
    if (mode === 'full') {
      return '₹' + rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    }
    if (rupees >= 1_00_00_000) return '₹' + (rupees / 1_00_00_000).toFixed(2) + ' Cr';
    if (rupees >= 1_00_000) return '₹' + (rupees / 1_00_000).toFixed(2) + ' L';
    if (rupees >= 1_000) return '₹' + (rupees / 1_000).toFixed(1) + 'K';
    return '₹' + rupees.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }
}
