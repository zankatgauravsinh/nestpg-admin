import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from './icon.component';
import { PillTone } from './status-pill.component';

const TONE: Record<PillTone, string> = {
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
  info: 'bg-info-subtle text-info',
  accent: 'bg-accent-subtle text-accent',
  neutral: 'bg-canvas text-muted',
};

/** Compact icon + text chip used for inline insights/signals. */
@Component({
  selector: 'os-insight-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium" [class]="cls()">
      @if (icon()) { <os-icon [name]="icon()!" [size]="15" /> }
      <ng-content />
    </span>
  `,
})
export class InsightChipComponent {
  readonly icon = input<string | null>(null);
  readonly tone = input<PillTone>('neutral');
  protected readonly cls = computed(() => TONE[this.tone()]);
}
