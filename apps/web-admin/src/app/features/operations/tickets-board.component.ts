import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { IconComponent } from '../../shared/components/icon.component';
import { InsightChipComponent } from '../../shared/components/insight-chip.component';

@Component({
  selector: 'os-tickets-board',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, IconComponent, InsightChipComponent],
  template: `
    <os-page-header eyebrow="Operations" title="Tickets"
      subtitle="Maintenance and support requests across your properties.">
      <div actions>
        <os-insight-chip icon="api" tone="warning">Ticketing API pending</os-insight-chip>
        <button class="h-9 px-3.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition flex items-center gap-1.5">
          <os-icon name="add" [size]="18" /> New ticket
        </button>
      </div>
    </os-page-header>

    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      @for (col of columns; track col.key) {
        <div class="bg-canvas border border-border rounded-[16px] p-4 min-h-[320px]">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full" [class]="col.dot"></span>
              <h3 class="text-sm font-semibold text-content">{{ col.label }}</h3>
            </div>
            <span class="text-xs text-faint">0</span>
          </div>
          <div class="flex flex-col items-center justify-center text-center py-12 text-faint">
            <os-icon name="confirmation_number" [size]="22" />
            <p class="text-xs mt-2">No tickets</p>
          </div>
        </div>
      }
    </div>
    <p class="text-xs text-faint mt-4 flex items-center gap-1.5">
      <os-icon name="info" [size]="14" /> Integration point: board renders live tickets once a tickets endpoint is exposed by the backend.
    </p>
  `,
})
export class TicketsBoardComponent {
  protected readonly columns = [
    { key: 'open', label: 'Open', dot: 'bg-warning' },
    { key: 'progress', label: 'In Progress', dot: 'bg-info' },
    { key: 'escalated', label: 'Escalated', dot: 'bg-danger' },
    { key: 'resolved', label: 'Resolved', dot: 'bg-success' },
  ];
}
