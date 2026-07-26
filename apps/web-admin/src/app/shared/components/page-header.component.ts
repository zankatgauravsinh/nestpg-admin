import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Standard page header. Title + subtitle on the left, projected actions on the
 * right via the `actions` slot. Every workspace screen reuses this.
 */
@Component({
  selector: 'os-page-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
      <div class="min-w-0">
        @if (eyebrow()) {
          <p class="text-[12px] font-semibold uppercase tracking-wider text-accent mb-1">{{ eyebrow() }}</p>
        }
        <h1 class="text-[24px] sm:text-[28px] font-semibold tracking-tight text-content leading-tight truncate">
          {{ title() }}
        </h1>
        @if (subtitle()) {
          <p class="text-sm text-muted mt-1 max-w-2xl">{{ subtitle() }}</p>
        }
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <ng-content select="[actions]" />
      </div>
    </header>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  readonly eyebrow = input<string | null>(null);
}
