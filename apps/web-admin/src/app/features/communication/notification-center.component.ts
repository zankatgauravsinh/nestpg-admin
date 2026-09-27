import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, JsonPipe } from '@angular/common';
import { NotificationsApiService, ApiNotification, NotificationPreference, NotificationTemplate } from '../../core/data/notifications.service';
import { SessionStore } from '../../core/auth/session.store';
import { apiErrorMessage } from '../../core/http/api-error';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { StatusPillComponent } from '../../shared/components/status-pill.component';
import { DrawerShellComponent } from '../../shared/components/drawer-shell.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { IconComponent } from '../../shared/components/icon.component';

@Component({
  selector: 'os-notification-center',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, DatePipe, JsonPipe, PageHeaderComponent, EmptyStateComponent, LoadingStateComponent,
    StatusPillComponent, DrawerShellComponent, ModalComponent, IconComponent,
  ],
  template: `
    <os-page-header eyebrow="Communication" title="Notification Center" subtitle="Your feed, delivery preferences and templates." />

    <div class="bg-panel border border-border rounded-[16px] overflow-hidden">
      <div class="flex items-center gap-1 px-3 pt-3 border-b border-border overflow-x-auto">
        @for (t of tabs; track t.id) {
          <button (click)="tab.set(t.id)" class="px-3.5 h-9 text-[13px] font-medium border-b-2 -mb-px whitespace-nowrap transition" [class]="tab() === t.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-content'">{{ t.label }}@if (t.id === 'feed' && unread()) { <span class="ml-1 text-[11px] px-1.5 rounded-full bg-accent text-white">{{ unread() }}</span> }</button>
        }
      </div>

      <!-- FEED -->
      @if (tab() === 'feed') {
        <div class="flex items-center justify-end px-5 py-2.5 border-b border-border-subtle gap-2">
          <button (click)="loadFeed()" class="h-8 px-3 rounded-lg border border-border text-[13px] text-content hover:bg-canvas flex items-center gap-1.5"><os-icon name="refresh" [size]="15" /> Refresh</button>
          <button (click)="markAll()" [disabled]="!unread()" class="h-8 px-3 rounded-lg border border-border text-[13px] text-content hover:bg-canvas disabled:opacity-40">Mark all read</button>
        </div>
        @if (loading()) { <div class="p-5"><os-loading variant="skeleton" /></div> }
        @else if (feed().length === 0) { <os-empty-state icon="notifications" title="No notifications" message="You're all caught up." /> }
        @else {
          <div class="divide-y divide-border-subtle">
            @for (n of feed(); track n.id) {
              <button (click)="open(n)" class="w-full text-left px-5 py-3.5 hover:bg-canvas/60 transition flex items-start gap-3" [class.bg-accent-subtle]="!n.read_at">
                <span class="w-2 h-2 rounded-full mt-2 shrink-0" [class]="n.read_at ? 'bg-transparent' : 'bg-accent'"></span>
                <div class="flex-1 min-w-0"><div class="flex items-center gap-2"><p class="text-sm font-medium text-content truncate">{{ n.title }}</p><os-status-pill [status]="n.category" [dot]="false" /></div>
                  <p class="text-[13px] text-muted line-clamp-2">{{ n.body }}</p>
                  <p class="text-[11px] text-faint mt-0.5">{{ n.created_at | date:'dd MMM yyyy, HH:mm' }}</p></div>
              </button>
            }
          </div>
        }
      }

      <!-- PREFERENCES -->
      @if (tab() === 'preferences') {
        <div class="p-5">
          @if (prefs().length === 0) {
            <p class="text-sm text-muted">No custom preferences set — you're opted in to all channels by default. Add one below.</p>
          } @else {
            <div class="overflow-x-auto mb-4"><table class="w-full text-sm">
              <thead><tr class="text-left text-[12px] uppercase tracking-wider text-faint border-b border-border"><th class="py-2 pr-4">Channel</th><th class="py-2 pr-4">Category</th><th class="py-2 pr-4 text-center">Enabled</th><th class="py-2 pr-4 text-center">Muted</th><th class="py-2">Quiet hours</th></tr></thead>
              <tbody>@for (p of prefs(); track p.channel + p.category) {
                <tr class="border-t border-border-subtle"><td class="py-2.5 pr-4 text-content">{{ p.channel }}</td><td class="py-2.5 pr-4 text-muted">{{ p.category }}</td>
                  <td class="py-2.5 pr-4 text-center"><os-status-pill [status]="p.enabled ? 'ON' : 'OFF'" [tone]="p.enabled ? 'success' : 'neutral'" [dot]="false" /></td>
                  <td class="py-2.5 pr-4 text-center">{{ p.muted ? 'Yes' : '—' }}</td>
                  <td class="py-2.5 text-muted">{{ p.quiet_from != null ? (p.quiet_from + ':00–' + p.quiet_to + ':00') : '—' }}</td></tr>
              }</tbody>
            </table></div>
          }
          <div class="rounded-xl border border-border p-4 grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
            <div><label class="lbl">Channel</label><select [(ngModel)]="pf.channel" class="fld">@for (c of channels; track c) { <option [value]="c">{{ c }}</option> }</select></div>
            <div><label class="lbl">Category</label><select [(ngModel)]="pf.category" class="fld">@for (c of categories; track c) { <option [value]="c">{{ c }}</option> }</select></div>
            <div class="flex items-center gap-1.5"><input id="en" type="checkbox" [(ngModel)]="pf.enabled" /><label for="en" class="text-[13px] text-muted">Enabled</label></div>
            <div class="flex items-center gap-1.5"><input id="mu" type="checkbox" [(ngModel)]="pf.muted" /><label for="mu" class="text-[13px] text-muted">Muted</label></div>
            <button (click)="savePref()" [disabled]="savingPref()" class="h-9 rounded-lg bg-accent text-white text-[13px] font-semibold disabled:opacity-60">Save</button>
          </div>
        </div>
      }

      <!-- TEMPLATES -->
      @if (tab() === 'templates') {
        @if (!isAdmin()) {
          <os-empty-state icon="lock" title="Admins only" message="Template management is restricted to administrators." />
        } @else {
          <div class="flex items-center justify-end px-5 py-2.5 border-b border-border-subtle"><button (click)="openTemplate()" class="h-8 px-3 rounded-lg bg-accent text-white text-[13px] font-semibold flex items-center gap-1.5"><os-icon name="add" [size]="16" /> New template</button></div>
          @if (templates().length === 0) { <os-empty-state icon="description" title="No templates" message="Create a template to customize notification copy." /> }
          @else {
            <div class="overflow-x-auto"><table class="w-full text-sm">
              <thead><tr class="text-left text-[12px] uppercase tracking-wider text-faint border-b border-border"><th class="px-5 py-3">Key</th><th class="px-5 py-3">Channel</th><th class="px-5 py-3">Locale</th><th class="px-5 py-3">Ver</th><th class="px-5 py-3">Active</th><th class="px-5 py-3"></th></tr></thead>
              <tbody>@for (t of templates(); track t.id) {
                <tr class="border-t border-border-subtle hover:bg-canvas/60"><td class="px-5 py-3 font-medium text-content">{{ t.key }}</td><td class="px-5 py-3 text-muted">{{ t.channel }}</td><td class="px-5 py-3 text-muted">{{ t.locale }}</td><td class="px-5 py-3 text-muted">v{{ t.version }}</td><td class="px-5 py-3"><os-status-pill [status]="t.is_active ? 'ACTIVE' : 'INACTIVE'" [dot]="false" /></td><td class="px-5 py-3 text-right"><button (click)="editTemplate(t)" class="h-8 px-3 rounded-lg border border-border text-[13px] text-content hover:bg-canvas">Edit</button></td></tr>
              }</tbody>
            </table></div>
          }
        }
      }

      <!-- DELIVERY HISTORY / RETRY QUEUE — endpoint not available -->
      @if (tab() === 'deliveries' || tab() === 'retry') {
        <os-empty-state icon="cloud_off" title="Delivery admin not available"
          message="The backend exposes no delivery-listing or retry endpoint (dispatch is internal cron only). See phase-b-api-gaps.md." />
      }
    </div>

    <!-- Notification detail drawer -->
    <os-drawer [open]="!!detail()" [title]="detail()?.title ?? 'Notification'" subtitle="Notification detail" width="440px" (closed)="detail.set(null)">
      @if (detail(); as n) {
        <div class="space-y-4">
          <div class="flex items-center justify-between"><os-status-pill [status]="n.category" /><span class="text-[12px] text-faint">{{ n.created_at | date:'dd MMM yyyy, HH:mm' }}</span></div>
          <p class="text-sm text-content leading-relaxed">{{ n.body }}</p>
          <div><p class="text-[12px] uppercase tracking-wider text-faint mb-2">Payload</p>
            <pre class="text-[12px] bg-canvas rounded-lg border border-border p-3 overflow-x-auto text-muted">{{ n.data | json }}</pre>
          </div>
        </div>
      }
    </os-drawer>

    <!-- Template editor -->
    <os-modal [open]="showTemplate()" [title]="tf.key ? 'Edit template' : 'New template'" subtitle="Placeholders use double-brace variable syntax" width="600px" (closed)="showTemplate.set(false)">
      <form id="tplForm" class="space-y-3" (ngSubmit)="saveTemplate()">
        <div class="grid grid-cols-3 gap-3">
          <div><label class="lbl">Key *</label><input name="k" [(ngModel)]="tf.key" required placeholder="payment.success" class="fld" /></div>
          <div><label class="lbl">Channel</label><select name="ch" [(ngModel)]="tf.channel" class="fld">@for (c of channels; track c) { <option [value]="c">{{ c }}</option> }</select></div>
          <div><label class="lbl">Category</label><select name="cat" [(ngModel)]="tf.category" class="fld">@for (c of categories; track c) { <option [value]="c">{{ c }}</option> }</select></div>
        </div>
        <div><label class="lbl">Subject</label><input name="s" [(ngModel)]="tf.subject" class="fld" /></div>
        <div><label class="lbl">Body *</label><textarea name="b" [(ngModel)]="tf.body" rows="4" required class="fld" style="height:auto;padding:8px 10px"></textarea></div>
        <div class="flex items-center gap-2">
          <button type="button" (click)="preview()" class="h-9 px-3 rounded-lg border border-border text-[13px] text-content hover:bg-canvas">Preview</button>
          <input [(ngModel)]="previewVars" name="pv" placeholder='{"name":"Asha","amount":"₹15,000"}' class="fld flex-1" />
        </div>
        @if (previewOut()) { <div class="rounded-lg bg-canvas border border-border p-3 text-[13px] text-content"><strong>{{ previewOut()!.subject }}</strong><br/>{{ previewOut()!.body }}</div> }
        @if (tplErr()) { <p class="text-[13px] text-danger">{{ tplErr() }}</p> }
      </form>
      <div footer>
        <button (click)="showTemplate.set(false)" class="h-9 px-4 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas">Cancel</button>
        <button type="submit" form="tplForm" [disabled]="savingTpl()" class="h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-60">Save template</button>
      </div>
    </os-modal>

    @if (toast()) { <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] bg-[var(--primary-container)] text-white text-sm px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2"><os-icon name="check_circle" [size]="18" /> {{ toast() }}</div> }
  `,
  styles: [`.lbl{display:block;font-size:12px;font-weight:500;color:var(--text-secondary);margin-bottom:6px}.fld{width:100%;height:38px;padding:0 10px;border-radius:8px;border:1px solid var(--border);background:var(--panel);font-size:13px;color:var(--text-primary);outline:none}.fld:focus{border-color:var(--accent)}`],
})
export class NotificationCenterComponent {
  private readonly svc = inject(NotificationsApiService);
  private readonly session = inject(SessionStore);

  protected readonly tabs = [
    { id: 'feed', label: 'Notifications' }, { id: 'templates', label: 'Templates' }, { id: 'preferences', label: 'Preferences' },
    { id: 'deliveries', label: 'Delivery History' }, { id: 'retry', label: 'Retry Queue' },
  ];
  protected readonly channels = ['IN_APP', 'PUSH', 'EMAIL', 'SMS', 'WHATSAPP'];
  protected readonly categories = ['BOOKING', 'PAYMENT', 'INVOICE', 'COLLECTION', 'KYC', 'WAITLIST', 'VISITOR', 'REVIEW', 'SYSTEM'];

  readonly tab = signal('feed');
  readonly feed = signal<ApiNotification[]>([]);
  readonly unread = signal(0);
  readonly loading = signal(false);
  readonly detail = signal<ApiNotification | null>(null);
  readonly prefs = signal<NotificationPreference[]>([]);
  readonly templates = signal<NotificationTemplate[]>([]);
  readonly toast = signal<string | null>(null);

  readonly savingPref = signal(false);
  protected pf = { channel: 'EMAIL', category: 'PAYMENT', enabled: true, muted: false };

  readonly showTemplate = signal(false);
  readonly savingTpl = signal(false);
  readonly tplErr = signal<string | null>(null);
  readonly previewOut = signal<{ subject: string | null; body: string } | null>(null);
  protected tf = this.blankTpl();
  previewVars = '{"name":"Asha"}';

  /** Templates are SYSTEM_ADMINISTRATION — not FINANCE_ADMIN, which the old
   *  persona check wrongly included (A3-7). */
  readonly isAdmin = computed(() => this.session.hasCapability('SYSTEM_ADMINISTRATION'));

  constructor() { this.loadFeed(); this.svc.preferences().subscribe((p) => this.prefs.set(p)); if (this.isAdmin()) this.svc.templates().subscribe((t) => this.templates.set(t)); }

  loadFeed(): void {
    this.loading.set(true);
    this.svc.feed(false, 1, 50).subscribe((f) => { this.feed.set(f.items); this.unread.set(f.unread); this.loading.set(false); });
  }
  open(n: ApiNotification): void {
    this.detail.set(n);
    if (!n.read_at) this.svc.markRead(n.id).subscribe(() => { n.read_at = new Date().toISOString(); this.unread.update((u) => Math.max(0, u - 1)); });
  }
  markAll(): void { this.svc.markAllRead().subscribe(() => this.loadFeed()); }

  savePref(): void {
    this.savingPref.set(true);
    this.svc.setPreference({ ...this.pf }).subscribe({
      next: () => { this.savingPref.set(false); this.flash('Preference saved.'); this.svc.preferences().subscribe((p) => this.prefs.set(p)); },
      error: (e) => { this.savingPref.set(false); this.flash(apiErrorMessage(e, 'Could not save.')); },
    });
  }

  private blankTpl() { return { key: '', channel: 'EMAIL', category: 'SYSTEM', subject: '', body: '', isActive: true }; }
  openTemplate(): void { this.tf = this.blankTpl(); this.tplErr.set(null); this.previewOut.set(null); this.showTemplate.set(true); }
  editTemplate(t: NotificationTemplate): void { this.tf = { key: t.key, channel: t.channel, category: t.category, subject: t.subject ?? '', body: t.body, isActive: t.is_active }; this.tplErr.set(null); this.previewOut.set(null); this.showTemplate.set(true); }
  preview(): void {
    let vars: Record<string, unknown> = {};
    try { vars = JSON.parse(this.previewVars || '{}'); } catch { this.tplErr.set('Preview variables must be valid JSON.'); return; }
    this.svc.previewTemplate(this.tf.subject || null, this.tf.body, vars).subscribe((o) => this.previewOut.set(o));
  }
  saveTemplate(): void {
    if (!this.tf.key || !this.tf.body) { this.tplErr.set('Key and body are required.'); return; }
    this.savingTpl.set(true); this.tplErr.set(null);
    this.svc.upsertTemplate({ ...this.tf, subject: this.tf.subject || undefined }).subscribe({
      next: () => { this.savingTpl.set(false); this.showTemplate.set(false); this.flash('Template saved.'); this.svc.templates().subscribe((t) => this.templates.set(t)); },
      error: (e) => { this.savingTpl.set(false); this.tplErr.set(apiErrorMessage(e, 'Could not save template.')); },
    });
  }

  private flash(m: string): void { this.toast.set(m); setTimeout(() => this.toast.set(null), 3000); }
}
