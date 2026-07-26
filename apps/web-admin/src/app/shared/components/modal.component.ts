import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent } from './icon.component';

/** Centered modal dialog shell: backdrop + panel + header + body + projected footer. */
@Component({
  selector: 'os-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-[1px]" (click)="closed.emit()"></div>
        <div class="relative w-full bg-panel border border-border rounded-[16px] shadow-[var(--shadow-lg)] flex flex-col max-h-[90vh] animate-[pop_.15s_ease]"
             [style.maxWidth]="width()">
          <header class="flex items-center justify-between h-14 px-5 border-b border-border shrink-0">
            <div>
              <h2 class="text-base font-semibold text-content">{{ title() }}</h2>
              @if (subtitle()) { <p class="text-xs text-muted">{{ subtitle() }}</p> }
            </div>
            <button (click)="closed.emit()" class="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:bg-canvas" aria-label="Close">
              <os-icon name="close" [size]="20" />
            </button>
          </header>
          <div class="flex-1 overflow-y-auto os-scroll p-5"><ng-content /></div>
          <footer class="flex items-center justify-end gap-2 border-t border-border p-4 shrink-0"><ng-content select="[footer]" /></footer>
        </div>
      </div>
    }
  `,
  styles: [`@keyframes pop { from { transform: scale(.97); opacity: .6 } to { transform: none; opacity: 1 } }`],
})
export class ModalComponent {
  readonly open = input<boolean>(false);
  readonly title = input<string>('');
  readonly subtitle = input<string | null>(null);
  readonly width = input<string>('520px');
  readonly closed = output<void>();
}
