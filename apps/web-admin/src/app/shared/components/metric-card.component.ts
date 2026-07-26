import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from './icon.component';

/** KPI metric tile: label, value, optional trend + icon. */
@Component({
  selector: 'os-metric',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="bg-panel border border-border rounded-[16px] p-5 flex flex-col gap-3">
      <div class="flex items-start justify-between">
        <span class="text-[12px] font-medium uppercase tracking-wider text-faint">{{ label() }}</span>
        @if (icon()) {
          <span class="w-8 h-8 rounded-lg bg-canvas flex items-center justify-center text-muted">
            <os-icon [name]="icon()!" [size]="18" />
          </span>
        }
      </div>
      <div class="flex items-end gap-2">
        <span class="text-[28px] font-semibold tracking-tight text-content leading-none">{{ value() }}</span>
        @if (unit()) { <span class="text-sm text-faint mb-0.5">{{ unit() }}</span> }
      </div>
      @if (trend() != null) {
        <div class="flex items-center gap-1 text-[12px] font-semibold"
             [class.text-success]="trend()! >= 0" [class.text-danger]="trend()! < 0">
          <os-icon [name]="trend()! >= 0 ? 'trending_up' : 'trending_down'" [size]="16" />
          <span>{{ trend()! >= 0 ? '+' : '' }}{{ trend() }}%</span>
          @if (trendLabel()) { <span class="text-faint font-normal">{{ trendLabel() }}</span> }
        </div>
      }
    </div>
  `,
})
export class MetricCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly unit = input<string | null>(null);
  readonly icon = input<string | null>(null);
  readonly trend = input<number | null>(null);
  readonly trendLabel = input<string | null>('vs last month');
}
