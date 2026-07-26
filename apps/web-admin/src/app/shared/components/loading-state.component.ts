import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Skeleton/spinner loading placeholder. */
@Component({
  selector: 'os-loading',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (variant() === 'skeleton') {
      <div class="space-y-3 animate-pulse">
        @for (row of rows(); track $index) {
          <div class="h-4 rounded bg-canvas border border-border-subtle" [style.width]="row"></div>
        }
      </div>
    } @else {
      <div class="flex items-center justify-center gap-3 py-10 text-muted">
        <span class="w-5 h-5 rounded-full border-2 border-border border-t-accent animate-spin"></span>
        <span class="text-sm">{{ label() }}</span>
      </div>
    }
  `,
})
export class LoadingStateComponent {
  readonly variant = input<'spinner' | 'skeleton'>('spinner');
  readonly label = input<string>('Loading…');
  readonly rows = input<string[]>(['100%', '85%', '70%', '90%']);
}
