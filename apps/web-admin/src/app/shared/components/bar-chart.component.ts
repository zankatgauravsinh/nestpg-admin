import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface ChartPoint {
  label: string;
  value: number;
  value2?: number;
}

/** Dependency-free SVG bar chart (single or paired bars). */
@Component({
  selector: 'os-bar-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="w-full">
      <svg [attr.viewBox]="'0 0 ' + w + ' ' + h" class="w-full" [style.height.px]="height()" preserveAspectRatio="none">
        @for (b of bars(); track b.x) {
          <rect [attr.x]="b.x" [attr.y]="b.y1" [attr.width]="bw" [attr.height]="b.h1" rx="3" fill="var(--accent)" opacity="0.9" />
          @if (paired()) {
            <rect [attr.x]="b.x + bw + 3" [attr.y]="b.y2" [attr.width]="bw" [attr.height]="b.h2" rx="3" fill="var(--primary-container)" opacity="0.55" />
          }
        }
      </svg>
      <div class="flex justify-between mt-2 text-[10px] text-faint">
        @for (p of data(); track p.label) { <span>{{ p.label }}</span> }
      </div>
    </div>
  `,
})
export class BarChartComponent {
  readonly data = input.required<ChartPoint[]>();
  readonly height = input<number>(160);
  readonly paired = input<boolean>(false);

  protected readonly w = 320;
  protected readonly h = 160;
  protected get bw(): number {
    const n = Math.max(this.data().length, 1);
    return this.paired() ? (this.w / n - 8) / 2 : this.w / n - 8;
  }

  protected readonly bars = computed(() => {
    const d = this.data();
    const max = Math.max(1, ...d.flatMap((p) => [p.value, p.value2 ?? 0]));
    const n = Math.max(d.length, 1);
    const slot = this.w / n;
    return d.map((p, i) => {
      const h1 = (p.value / max) * (this.h - 12);
      const h2 = ((p.value2 ?? 0) / max) * (this.h - 12);
      return { x: i * slot + 4, y1: this.h - h1, h1, y2: this.h - h2, h2 };
    });
  });
}
