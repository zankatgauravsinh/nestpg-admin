import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Level-1 panel: white surface, 1px border, 16px radius, no shadow. */
@Component({
  selector: 'os-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="bg-panel border border-border rounded-[16px] transition-colors"
      [class.p-5]="padded()"
      [class.hover:border-border-strong]="interactive()"
      [class.cursor-pointer]="interactive()"
      [style.box-shadow]="raised() ? 'var(--shadow-md)' : null"
    >
      <ng-content />
    </div>
  `,
})
export class CardComponent {
  readonly padded = input<boolean>(true);
  readonly interactive = input<boolean>(false);
  readonly raised = input<boolean>(false);
}
