import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'nestpg-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    @for (row of rows(); track $index) {
      <div class="animate-pulse space-y-3 {{ containerClass() }}">
        @for (col of row; track $index) {
          <div
            class="bg-[var(--color-bg-subtle)] rounded"
            [style.height]="col.height ?? '16px'"
            [style.width]="col.width ?? '100%'"
          ></div>
        }
      </div>
    }
  `,
})
export class SkeletonComponent {
  readonly rows = input<Array<Array<{ height?: string; width?: string }>>>([
    [{ width: '60%' }, { width: '90%' }, { width: '75%' }],
  ]);
  readonly containerClass = input<string>('');
}

/** Convenience component for a table skeleton */
@Component({
  selector: 'nestpg-table-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-0" role="status" aria-label="Loading data…">
      @for (row of rowArray; track $index) {
        <div class="flex items-center gap-4 px-4 py-3 border-b border-[var(--color-border)]">
          <div class="animate-pulse h-4 bg-[var(--color-bg-subtle)] rounded flex-1"></div>
          <div class="animate-pulse h-4 bg-[var(--color-bg-subtle)] rounded w-24"></div>
          <div class="animate-pulse h-4 bg-[var(--color-bg-subtle)] rounded w-32"></div>
          <div class="animate-pulse h-4 bg-[var(--color-bg-subtle)] rounded w-20"></div>
        </div>
      }
    </div>
  `,
})
export class TableSkeletonComponent {
  readonly rowCount = input<number>(5);
  get rowArray(): number[] {
    return Array.from({ length: this.rowCount() });
  }
}
