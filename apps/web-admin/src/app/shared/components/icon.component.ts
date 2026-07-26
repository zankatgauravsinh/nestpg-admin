import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Thin wrapper over Material Symbols Outlined. */
@Component({
  selector: 'os-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span
    class="material-symbols-outlined leading-none"
    [style.fontSize.px]="size()"
    [style.fontVariationSettings]="fill() ? variation : null"
    >{{ name() }}</span
  >`,
  styles: [`:host { display: inline-flex; align-items: center; justify-content: center; }`],
})
export class IconComponent {
  readonly name = input.required<string>();
  readonly size = input<number>(20);
  readonly fill = input<boolean>(false);
  protected readonly variation = `'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 20`;
}
