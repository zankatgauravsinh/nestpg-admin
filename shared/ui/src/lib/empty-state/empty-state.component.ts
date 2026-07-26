import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'nestpg-empty-state',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  template: `
    <div class="flex flex-col items-center justify-center py-16 px-4 text-center" role="status">
      <div class="w-12 h-12 rounded-full bg-[var(--color-bg-subtle)] flex items-center justify-center mb-4">
        <mat-icon class="text-[var(--color-text-disabled)] !text-2xl">{{ icon() }}</mat-icon>
      </div>
      <h3 class="text-sm font-semibold text-[var(--color-text-primary)] mb-1">{{ title() }}</h3>
      @if (description()) {
        <p class="text-sm text-[var(--color-text-secondary)] max-w-xs">{{ description() }}</p>
      }
      @if (actionLabel()) {
        <button
          mat-flat-button
          color="primary"
          class="mt-4 !h-9"
          (click)="actionClick.emit()"
        >
          {{ actionLabel() }}
        </button>
      }
    </div>
  `,
})
export class EmptyStateComponent {
  readonly icon        = input<string>('inbox');
  readonly title       = input.required<string>();
  readonly description = input<string | null>(null);
  readonly actionLabel = input<string | null>(null);

  readonly actionClick = output<void>();
}
