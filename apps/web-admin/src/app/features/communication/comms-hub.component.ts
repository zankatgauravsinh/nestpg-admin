import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { InsightChipComponent } from '../../shared/components/insight-chip.component';
import { IconComponent } from '../../shared/components/icon.component';

@Component({
  selector: 'os-comms-hub',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, EmptyStateComponent, InsightChipComponent, IconComponent],
  template: `
    <os-page-header eyebrow="Communication" title="Communication Hub"
      subtitle="Broadcast announcements and resident conversations in one place.">
      <div actions><os-insight-chip icon="api" tone="warning">Messaging API pending</os-insight-chip></div>
    </os-page-header>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:h-[calc(100vh-220px)]">
      <!-- Conversations list -->
      <div class="bg-panel border border-border rounded-[16px] flex flex-col overflow-hidden">
        <div class="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 class="text-sm font-semibold text-content">Conversations</h3>
          <button class="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:bg-canvas"><os-icon name="edit_square" [size]="18" /></button>
        </div>
        <div class="flex-1 flex items-center justify-center p-6 text-center text-faint">
          <div><os-icon name="forum" [size]="26" /><p class="text-xs mt-2">No conversations</p></div>
        </div>
      </div>

      <!-- Thread -->
      <div class="lg:col-span-2 bg-panel border border-border rounded-[16px] flex items-center justify-center">
        <os-empty-state icon="chat" title="Select a conversation"
          message="Integration point: threads and broadcasts render here once a messaging endpoint is exposed by the backend." />
      </div>
    </div>
  `,
})
export class CommsHubComponent {}
