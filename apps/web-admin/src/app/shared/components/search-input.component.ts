import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconComponent } from './icon.component';

/** Search field with leading icon and 8px radius, focus accent ring. */
@Component({
  selector: 'os-search',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IconComponent],
  template: `
    <div class="relative" [style.width]="width()">
      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none">
        <os-icon name="search" [size]="18" />
      </span>
      <input
        type="text"
        [placeholder]="placeholder()"
        [(ngModel)]="value"
        (keyup.enter)="submitted.emit(value())"
        class="w-full h-9 pl-9 pr-3 rounded-lg bg-panel border border-border text-sm text-content
               placeholder:text-faint outline-none transition
               focus:border-accent focus:ring-2 focus:ring-accent/15"
      />
    </div>
  `,
})
export class SearchInputComponent {
  readonly value = model<string>('');
  readonly placeholder = input<string>('Search…');
  readonly width = input<string>('260px');
  /** Emits the query when the user presses Enter. */
  readonly submitted = output<string>();
}
