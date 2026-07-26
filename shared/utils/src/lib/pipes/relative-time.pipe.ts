import { Pipe, PipeTransform } from '@angular/core';

/**
 * Converts an ISO date string to a relative time string.
 * Usage: {{ '2025-01-01T00:00:00Z' | relativeTime }} → "2 hours ago"
 */
@Pipe({ name: 'relativeTime', standalone: true })
export class RelativeTimePipe implements PipeTransform {
  private readonly formatter = new Intl.RelativeTimeFormat('en', {
    numeric: 'auto',
  });

  transform(value: string | Date | null | undefined): string {
    if (!value) return '—';
    const date = typeof value === 'string' ? new Date(value) : value;
    const diffMs = date.getTime() - Date.now();
    const diffSeconds = Math.round(diffMs / 1000);
    const diffMinutes = Math.round(diffSeconds / 60);
    const diffHours = Math.round(diffMinutes / 60);
    const diffDays = Math.round(diffHours / 24);
    const diffWeeks = Math.round(diffDays / 7);
    const diffMonths = Math.round(diffDays / 30);
    const diffYears = Math.round(diffDays / 365);

    if (Math.abs(diffSeconds) < 60) return this.formatter.format(diffSeconds, 'second');
    if (Math.abs(diffMinutes) < 60) return this.formatter.format(diffMinutes, 'minute');
    if (Math.abs(diffHours) < 24) return this.formatter.format(diffHours, 'hour');
    if (Math.abs(diffDays) < 7) return this.formatter.format(diffDays, 'day');
    if (Math.abs(diffWeeks) < 5) return this.formatter.format(diffWeeks, 'week');
    if (Math.abs(diffMonths) < 12) return this.formatter.format(diffMonths, 'month');
    return this.formatter.format(diffYears, 'year');
  }
}
