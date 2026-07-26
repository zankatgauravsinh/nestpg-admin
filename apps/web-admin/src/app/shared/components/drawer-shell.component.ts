import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent } from './icon.component';

/**
 * Right-side contextual drawer shell. Reusable container for detail panes
 * (resident, dispute, ticket, etc). Header + scrollable body + footer slot.
 */
@Component({
  selector: 'os-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (open()) {
      <div class="fixed inset-0 z-[60] flex justify-end">
        <div class="absolute inset-0 bg-black/30 backdrop-blur-[1px]" (click)="closed.emit()"></div>
        <aside
          class="relative h-full bg-panel border-l border-border shadow-[var(--shadow-lg)] flex flex-col animate-[slidein_.2s_ease]"
          [style.width]="width()"
        >
          <header class="flex items-center justify-between h-14 px-5 border-b border-border shrink-0">
            <div class="min-w-0">
              <h2 class="text-base font-semibold text-content truncate">{{ title() }}</h2>
              @if (subtitle()) { <p class="text-xs text-muted truncate">{{ subtitle() }}</p> }
            </div>
            <button
              class="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:bg-canvas"
              (click)="closed.emit()" aria-label="Close">
              <os-icon name="close" [size]="20" />
            </button>
          </header>
          <div class="flex-1 overflow-y-auto os-scroll p-5"><ng-content /></div>
          <footer class="border-t border-border p-4 shrink-0"><ng-content select="[footer]" /></footer>
        </aside>
      </div>
    }
  `,
  styles: [`@keyframes slidein { from { transform: translateX(16px); opacity: .6 } to { transform: none; opacity: 1 } }`],
})
export class DrawerShellComponent {
  readonly open = input<boolean>(false);
  readonly title = input<string>('');
  readonly subtitle = input<string | null>(null);
  readonly width = input<string>('420px');
  readonly closed = output<void>();
}
