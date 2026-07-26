import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map, of, switchMap, tap } from 'rxjs';
import { SearchService, SearchResults } from '../../core/data/search.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { SearchInputComponent } from '../../shared/components/search-input.component';
import { EntityAvatarComponent } from '../../shared/components/entity-avatar.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { IconComponent } from '../../shared/components/icon.component';

const EMPTY: SearchResults = { residents: [], properties: [], bookings: [], total: 0 };

@Component({
  selector: 'os-global-search',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeaderComponent, SearchInputComponent, EntityAvatarComponent, EmptyStateComponent, IconComponent],
  template: `
    <os-page-header eyebrow="Search" [title]="query() ? 'Results for “' + query() + '”' : 'Search'"
      subtitle="Find residents, properties and bookings across the platform." />

    <div class="mb-6 max-w-xl">
      <os-search [value]="query()" (submitted)="run($event)" (valueChange)="draft.set($event)" placeholder="Search residents, properties, bookings…" width="100%" />
    </div>

    @if (loading()) {
      <div class="flex items-center gap-3 py-16 text-muted"><span class="w-5 h-5 rounded-full border-2 border-border border-t-accent animate-spin"></span> Searching…</div>
    } @else if (!query()) {
      <os-empty-state icon="search" title="Start typing" message="Search by resident name/phone, property name/city, or booking number." />
    } @else if (results().total === 0) {
      <os-empty-state icon="search_off" title="No matches" [message]="'Nothing found for “' + query() + '”.'" />
    } @else {
      <div class="space-y-6">
        @for (group of groups(); track group.key) {
          @if (group.items.length) {
            <div>
              <div class="flex items-center gap-2 mb-3">
                <os-icon [name]="group.icon" [size]="18" class="text-muted" />
                <h3 class="text-[13px] font-semibold uppercase tracking-wider text-faint">{{ group.label }}</h3>
                <span class="text-xs text-faint">({{ group.items.length }})</span>
              </div>
              <div class="bg-panel border border-border rounded-[16px] overflow-hidden">
                @for (it of group.items; track it.id) {
                  <a [routerLink]="it.route" [queryParams]="it.query"
                     class="flex items-center gap-3 px-5 py-3 border-t border-border-subtle first:border-t-0 hover:bg-canvas/60 transition">
                    <os-avatar [name]="it.name" [size]="34" />
                    <div class="min-w-0 flex-1"><p class="text-sm font-medium text-content truncate">{{ it.name }}</p><p class="text-xs text-muted truncate">{{ it.sub }}</p></div>
                    <os-icon name="chevron_right" [size]="18" class="text-faint" />
                  </a>
                }
              </div>
            </div>
          }
        }
      </div>
    }
  `,
})
export class GlobalSearchComponent {
  private readonly svc = inject(SearchService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly query = toSignal(this.route.queryParamMap.pipe(map((p) => (p.get('q') ?? '').trim())), { initialValue: '' });
  readonly draft = signal('');
  readonly loading = signal(false);

  readonly results = toSignal(
    this.route.queryParamMap.pipe(
      map((p) => (p.get('q') ?? '').trim()),
      tap((q) => this.loading.set(!!q)),
      switchMap((q) => (q ? this.svc.search(q).pipe(tap(() => this.loading.set(false))) : of(EMPTY))),
    ),
    { initialValue: EMPTY },
  );

  readonly groups = computed(() => {
    const r = this.results();
    return [
      { key: 'residents', label: 'Residents', icon: 'groups', items: r.residents },
      { key: 'properties', label: 'Properties', icon: 'domain', items: r.properties },
      { key: 'bookings', label: 'Bookings', icon: 'event_available', items: r.bookings },
    ];
  });

  run(q: string): void {
    this.router.navigate(['/search'], { queryParams: { q: (q || this.draft()).trim() } });
  }
}
