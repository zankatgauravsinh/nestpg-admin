import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { PageHeaderComponent } from '../shared/components/page-header.component';
import { EmptyStateComponent } from '../shared/components/empty-state.component';
import { IconComponent } from '../shared/components/icon.component';

interface PageMeta {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: string;
}

/**
 * Generic screen scaffold. Every route renders this until its feature screen is
 * built — proving the shell, header, design system and theming end-to-end while
 * keeping the foundation free of premature feature work.
 */
@Component({
  selector: 'os-placeholder-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, EmptyStateComponent, IconComponent],
  template: `
    <os-page-header
      [title]="meta().title"
      [subtitle]="meta().subtitle ?? null"
      [eyebrow]="meta().eyebrow ?? null">
      <div actions class="flex items-center gap-2">
        <button class="h-9 px-3.5 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas transition flex items-center gap-1.5">
          <os-icon name="tune" [size]="18" /> Filters
        </button>
        <button class="h-9 px-3.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition flex items-center gap-1.5">
          <os-icon name="add" [size]="18" /> New
        </button>
      </div>
    </os-page-header>

    <os-empty-state
      [icon]="meta().icon ?? 'dashboard'"
      title="Screen scaffolded"
      [message]="'“' + meta().title + '” is wired into the platform shell, navigation and design system. The feature UI is built in a later phase.'">
      <span class="inline-flex items-center gap-1.5 text-xs text-faint">
        <os-icon name="bolt" [size]="15" /> Foundation ready · reuses Operations OS components
      </span>
    </os-empty-state>
  `,
})
export class PlaceholderPageComponent {
  private readonly route = inject(ActivatedRoute);
  readonly meta = toSignal(
    this.route.data.pipe(map((d) => (d['meta'] ?? { title: 'Page' }) as PageMeta)),
    { initialValue: { title: 'Page' } as PageMeta },
  );
}
