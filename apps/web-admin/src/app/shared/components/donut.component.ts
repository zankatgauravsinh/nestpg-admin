import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Dependency-free SVG donut gauge with center label. */
@Component({
  selector: 'os-donut',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative inline-flex items-center justify-center" [style.width.px]="size()" [style.height.px]="size()">
      <svg [attr.width]="size()" [attr.height]="size()" [attr.viewBox]="'0 0 ' + size() + ' ' + size()" class="-rotate-90">
        <circle [attr.cx]="c" [attr.cy]="c" [attr.r]="r" fill="none" [attr.stroke-width]="stroke()" stroke="var(--border)" />
        <circle [attr.cx]="c" [attr.cy]="c" [attr.r]="r" fill="none" [attr.stroke-width]="stroke()"
                [attr.stroke-dasharray]="circ" [attr.stroke-dashoffset]="offset()" stroke-linecap="round" [attr.stroke]="color()" />
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center">
        <span class="text-xl font-semibold text-content leading-none">{{ value() }}%</span>
        @if (label()) { <span class="text-[10px] text-faint mt-0.5">{{ label() }}</span> }
      </div>
    </div>
  `,
})
export class DonutComponent {
  readonly value = input.required<number>();
  readonly label = input<string | null>(null);
  readonly size = input<number>(120);
  readonly stroke = input<number>(10);
  readonly color = input<string>('var(--accent)');

  protected get c() { return this.size() / 2; }
  protected get r() { return this.size() / 2 - this.stroke(); }
  protected get circ() { return 2 * Math.PI * this.r; }
  protected readonly offset = computed(() => this.circ * (1 - Math.min(100, Math.max(0, this.value())) / 100));
}
