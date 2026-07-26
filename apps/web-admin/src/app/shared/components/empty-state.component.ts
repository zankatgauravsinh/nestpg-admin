import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from './icon.component';

/** Warm-surface empty state with icon, message and optional projected action. */
@Component({
  selector: 'os-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="flex flex-col items-center justify-center text-center rounded-[16px] bg-warm border border-border-subtle px-6 py-14">
      <span class="w-14 h-14 rounded-2xl bg-panel border border-border flex items-center justify-center text-faint mb-4">
        <os-icon [name]="icon()" [size]="28" />
      </span>
      <h3 class="text-base font-semibold text-content">{{ title() }}</h3>
      @if (message()) { <p class="text-sm text-muted mt-1 max-w-sm">{{ message() }}</p> }
      <div class="mt-4"><ng-content /></div>
    </div>
  `,
})
export class EmptyStateComponent {
  readonly icon = input<string>('inbox');
  readonly title = input.required<string>();
  readonly message = input<string | null>(null);
}
