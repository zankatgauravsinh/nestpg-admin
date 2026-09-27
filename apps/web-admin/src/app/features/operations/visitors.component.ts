import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { VisitorsService, ApiVisitor, VisitorPass, VisitorLog } from '../../core/data/visitors.service';
import { SessionStore } from '../../core/auth/session.store';
import { apiErrorMessage } from '../../core/http/api-error';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { MetricCardComponent } from '../../shared/components/metric-card.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { StatusPillComponent } from '../../shared/components/status-pill.component';
import { DrawerShellComponent } from '../../shared/components/drawer-shell.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { IconComponent } from '../../shared/components/icon.component';

type Tab = { id: string; label: string; status?: string };

@Component({
  selector: 'os-visitors',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, DatePipe, PageHeaderComponent, MetricCardComponent, EmptyStateComponent,
    LoadingStateComponent, StatusPillComponent, DrawerShellComponent, ModalComponent, IconComponent,
  ],
  template: `
    <os-page-header eyebrow="Operations" title="Visitor Management" subtitle="Approve, track and log property visitors.">
      <div actions><button (click)="openCreate()" class="h-9 px-3.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover flex items-center gap-1.5"><os-icon name="person_add" [size]="18" /> Invite visitor</button></div>
    </os-page-header>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
      <os-metric label="Pending" [value]="counts().PENDING + ''" icon="hourglass_top" />
      <os-metric label="Upcoming (approved)" [value]="counts().APPROVED + ''" icon="event_upcoming" />
      <os-metric label="Active (checked-in)" [value]="counts().CHECKED_IN + ''" icon="login" />
      <os-metric label="Expired passes" [value]="counts().EXPIRED + ''" icon="timer_off" />
    </div>

    <div class="bg-panel border border-border rounded-[16px] overflow-hidden">
      <div class="flex items-center gap-1 px-3 pt-3 border-b border-border overflow-x-auto">
        @for (t of tabs; track t.id) {
          <button (click)="setTab(t)" class="px-3.5 h-9 text-[13px] font-medium border-b-2 -mb-px whitespace-nowrap transition" [class]="tab().id === t.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-content'">{{ t.label }}</button>
        }
        <div class="ml-auto pb-2 flex items-center gap-2">
          <input [(ngModel)]="search" (keyup.enter)="reload()" placeholder="Search name/phone" class="h-8 px-3 rounded-lg border border-border bg-panel text-[13px] text-content outline-none w-44" />
          <button (click)="reload()" class="h-8 px-3 rounded-lg border border-border text-[13px] text-content hover:bg-canvas flex items-center gap-1.5"><os-icon name="refresh" [size]="15" /> Refresh</button>
        </div>
      </div>

      @if (loading()) {
        <div class="p-5"><os-loading variant="skeleton" /></div>
      } @else if (rows().length === 0) {
        <os-empty-state icon="badge" title="No visitors" message="No visitors match this filter." />
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead><tr class="text-left text-[12px] uppercase tracking-wider text-faint border-b border-border">
              <th class="px-5 py-3">Visitor</th><th class="px-5 py-3">Phone</th><th class="px-5 py-3">Purpose</th>
              <th class="px-5 py-3">Expected</th><th class="px-5 py-3">Arrival</th><th class="px-5 py-3">Status</th><th class="px-5 py-3"></th>
            </tr></thead>
            <tbody>
              @for (v of rows(); track v.id) {
                <tr class="border-t border-border-subtle hover:bg-canvas/60 transition">
                  <td class="px-5 py-3 font-medium text-content">{{ v.name }}</td>
                  <td class="px-5 py-3 text-muted">{{ v.phone }}</td>
                  <td class="px-5 py-3 text-muted truncate max-w-[180px]">{{ v.purpose ?? '—' }}</td>
                  <td class="px-5 py-3 text-muted">{{ v.expected_at ? (v.expected_at | date:'dd MMM, HH:mm') : '—' }}</td>
                  <td class="px-5 py-3 text-muted">{{ v.checked_in_at ? (v.checked_in_at | date:'HH:mm') : '—' }}</td>
                  <td class="px-5 py-3"><os-status-pill [status]="v.status" /></td>
                  <td class="px-5 py-3 text-right"><button (click)="open(v)" class="h-8 px-3 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas">View</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="flex items-center justify-between px-5 py-3 border-t border-border text-[13px] text-muted">
          <span>{{ total() }} visitor(s)</span>
          <div class="flex items-center gap-2">
            <button (click)="prev()" [disabled]="page() <= 1" class="h-8 px-3 rounded-lg border border-border disabled:opacity-40 hover:bg-canvas">Prev</button>
            <span>Page {{ page() }} / {{ totalPages() }}</span>
            <button (click)="next()" [disabled]="page() >= totalPages()" class="h-8 px-3 rounded-lg border border-border disabled:opacity-40 hover:bg-canvas">Next</button>
          </div>
        </div>
      }
    </div>

    <!-- Visitor drawer -->
    <os-drawer [open]="!!detail()" [title]="detail()?.name ?? 'Visitor'" subtitle="Visitor detail" width="460px" (closed)="closeDrawer()">
      @if (detail(); as v) {
        <div class="space-y-5">
          <div class="flex items-center justify-between"><span class="text-sm text-muted">Status</span><os-status-pill [status]="v.status" /></div>
          @if (passData()?.qr; as qr) {
            <div class="flex flex-col items-center gap-2 py-2"><img [src]="qr" alt="Visitor pass QR" class="w-44 h-44 rounded-xl border border-border" /><p class="text-[11px] text-faint">Valid until {{ passData()?.pass?.validUntil | date:'dd MMM, HH:mm' }}</p></div>
          }
          <div class="rounded-xl border border-border divide-y divide-border-subtle">
            <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">Phone</span><span class="text-sm text-content">{{ v.phone }}</span></div>
            <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">Purpose</span><span class="text-sm text-content text-right">{{ v.purpose ?? '—' }}</span></div>
            @if (v.vehicle_no) { <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">Vehicle</span><span class="text-sm text-content">{{ v.vehicle_no }}</span></div> }
            <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">Expected</span><span class="text-sm text-content">{{ v.expected_at ? (v.expected_at | date:'dd MMM, HH:mm') : '—' }}</span></div>
          </div>
          @if (logs().length) {
            <div><p class="text-[12px] uppercase tracking-wider text-faint mb-2">Gate timeline</p>
              <ul class="space-y-3">
                @for (l of logs(); track l.id) {
                  <li class="flex items-start gap-3"><span class="w-7 h-7 rounded-lg bg-canvas flex items-center justify-center text-muted shrink-0"><os-icon [name]="l.action === 'CHECK_IN' ? 'login' : l.action === 'CHECK_OUT' ? 'logout' : 'block'" [size]="14" /></span>
                    <div><p class="text-sm text-content">{{ label(l.action) }}{{ l.gate ? ' · ' + l.gate : '' }}</p><p class="text-[11px] text-faint">{{ l.created_at | date:'dd MMM yyyy, HH:mm' }}</p></div></li>
                }
              </ul>
            </div>
          }
        </div>
      }
      <div footer class="w-full space-y-2">
        @if (detail(); as v) {
          <div class="flex flex-wrap gap-2">
            @if (v.status === 'PENDING') {
              <button (click)="act('approve')" [disabled]="acting()" class="flex-1 h-10 rounded-lg bg-success text-white text-[13px] font-semibold disabled:opacity-60">Approve</button>
              <button (click)="act('reject')" [disabled]="acting()" class="h-10 px-3 rounded-lg border border-danger text-danger text-[13px] font-semibold disabled:opacity-60">Reject</button>
            }
            @if (v.status === 'APPROVED' && canGate()) { <button (click)="act('check-in')" [disabled]="acting()" class="flex-1 h-10 rounded-lg bg-accent text-white text-[13px] font-semibold disabled:opacity-60">Check in</button> }
            @if (v.status === 'CHECKED_IN' && canGate()) { <button (click)="act('check-out')" [disabled]="acting()" class="flex-1 h-10 rounded-lg bg-primary-container text-white text-[13px] font-semibold disabled:opacity-60">Check out</button> }
            @if (v.status === 'PENDING' || v.status === 'APPROVED') { <button (click)="act('cancel')" [disabled]="acting()" class="h-10 px-3 rounded-lg border border-border text-content text-[13px] font-medium disabled:opacity-60">Cancel</button> }
          </div>
        }
        @if (msg()) { <p class="text-[12px]" [class.text-danger]="err()" [class.text-success]="!err()">{{ msg() }}</p> }
        <button (click)="closeDrawer()" class="w-full h-10 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas">Close</button>
      </div>
    </os-drawer>

    <!-- Invite modal -->
    <os-modal [open]="showCreate()" title="Invite visitor" subtitle="Generates a pass for gate entry" (closed)="showCreate.set(false)">
      <form id="visForm" class="space-y-3" (ngSubmit)="submitCreate()">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="lbl">Name *</label><input name="n" [(ngModel)]="form.name" required class="fld" /></div>
          <div><label class="lbl">Phone *</label><input name="p" [(ngModel)]="form.phone" required placeholder="9876543210" class="fld" /></div>
        </div>
        <div><label class="lbl">Property id *</label><input name="pr" [(ngModel)]="form.propertyId" required placeholder="UUID" class="fld" /></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="lbl">Purpose</label><input name="pu" [(ngModel)]="form.purpose" class="fld" /></div>
          <div><label class="lbl">Expected at</label><input name="e" type="datetime-local" [(ngModel)]="form.expectedAt" class="fld" /></div>
        </div>
        @if (createErr()) { <p class="text-[13px] text-danger flex items-center gap-1.5"><os-icon name="error" [size]="15" /> {{ createErr() }}</p> }
      </form>
      <div footer>
        <button (click)="showCreate.set(false)" class="h-9 px-4 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas">Cancel</button>
        <button type="submit" form="visForm" [disabled]="saving()" class="h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-60 flex items-center gap-2">
          @if (saving()) { <span class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span> } Invite
        </button>
      </div>
    </os-modal>
  `,
  styles: [`.lbl{display:block;font-size:12px;font-weight:500;color:var(--text-secondary);margin-bottom:6px}.fld{width:100%;height:38px;padding:0 10px;border-radius:8px;border:1px solid var(--border);background:var(--panel);font-size:13px;color:var(--text-primary);outline:none}.fld:focus{border-color:var(--accent)}`],
})
export class VisitorsComponent {
  private readonly svc = inject(VisitorsService);
  private readonly session = inject(SessionStore);

  protected readonly tabs: Tab[] = [
    { id: 'all', label: 'All' }, { id: 'pending', label: 'Pending', status: 'PENDING' }, { id: 'approved', label: 'Approved', status: 'APPROVED' },
    { id: 'in', label: 'Checked-in', status: 'CHECKED_IN' }, { id: 'out', label: 'Checked-out', status: 'CHECKED_OUT' }, { id: 'expired', label: 'Expired', status: 'EXPIRED' },
  ];
  readonly tab = signal<Tab>(this.tabs[0]);
  readonly rows = signal<ApiVisitor[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly limit = 20;
  readonly loading = signal(false);
  readonly detail = signal<ApiVisitor | null>(null);
  readonly passData = signal<VisitorPass | null>(null);
  readonly logs = signal<VisitorLog[]>([]);
  readonly acting = signal(false);
  readonly msg = signal<string | null>(null);
  readonly err = signal(false);
  readonly counts = signal<{ PENDING: number; APPROVED: number; CHECKED_IN: number; EXPIRED: number }>({ PENDING: 0, APPROVED: 0, CHECKED_IN: 0, EXPIRED: 0 });
  search = '';

  readonly showCreate = signal(false);
  readonly saving = signal(false);
  readonly createErr = signal<string | null>(null);
  protected form = this.blankForm();

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.limit)));
  /** Gate actions are COMMUNITY_OPERATIONS (A3). */
  readonly canGate = computed(() => this.session.hasCapability('COMMUNITY_OPERATIONS'));

  label(s?: string): string { return s ? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ') : '—'; }

  constructor() { this.reload(); this.refreshCounts(); }

  setTab(t: Tab): void { this.tab.set(t); this.page.set(1); this.reload(); }
  prev(): void { if (this.page() > 1) { this.page.update((p) => p - 1); this.reload(); } }
  next(): void { if (this.page() < this.totalPages()) { this.page.update((p) => p + 1); this.reload(); } }

  reload(): void {
    this.loading.set(true);
    this.svc.list({ status: this.tab().status, search: this.search || undefined, page: this.page(), limit: this.limit }).subscribe((res) => {
      this.rows.set(res.data ?? []); this.total.set(res.meta?.total ?? (res.data?.length ?? 0)); this.loading.set(false);
    });
  }
  private refreshCounts(): void {
    const keys: ('PENDING' | 'APPROVED' | 'CHECKED_IN' | 'EXPIRED')[] = ['PENDING', 'APPROVED', 'CHECKED_IN', 'EXPIRED'];
    for (const s of keys) {
      this.svc.list({ status: s, limit: 1 }).subscribe((res) => this.counts.update((c) => ({ ...c, [s]: res.meta?.total ?? (res.data?.length ?? 0) })));
    }
  }

  open(v: ApiVisitor): void {
    this.msg.set(null); this.passData.set(null); this.logs.set([]);
    this.svc.get(v.id).subscribe((d) => this.detail.set(d ?? v));
    this.svc.pass(v.id).subscribe((p) => this.passData.set(p));
    this.svc.logs(v.id).subscribe((l) => this.logs.set(l));
  }
  closeDrawer(): void { this.detail.set(null); this.passData.set(null); this.logs.set([]); }

  act(kind: 'approve' | 'reject' | 'cancel' | 'check-in' | 'check-out'): void {
    const v = this.detail(); if (!v) return;
    this.acting.set(true); this.msg.set(null);
    const op = kind === 'approve' ? this.svc.approve(v.id) : kind === 'reject' ? this.svc.reject(v.id) : kind === 'cancel' ? this.svc.cancel(v.id) : kind === 'check-in' ? this.svc.checkIn(v.id) : this.svc.checkOut(v.id);
    op.subscribe({
      next: (u) => { this.acting.set(false); this.err.set(false); this.msg.set(`Visitor ${kind.replace('-', ' ')} done.`); this.detail.set(u); this.svc.logs(v.id).subscribe((l) => this.logs.set(l)); this.reload(); this.refreshCounts(); },
      error: (e) => { this.acting.set(false); this.err.set(true); this.msg.set(apiErrorMessage(e, 'Action failed.')); },
    });
  }

  private blankForm() { return { name: '', phone: '', propertyId: '', purpose: '', expectedAt: '' }; }
  openCreate(): void { this.form = this.blankForm(); this.createErr.set(null); this.showCreate.set(true); }
  submitCreate(): void {
    const f = this.form;
    if (!f.name || !f.phone || !f.propertyId) { this.createErr.set('Name, phone and property id are required.'); return; }
    this.saving.set(true); this.createErr.set(null);
    this.svc.create({ name: f.name, phone: f.phone, propertyId: f.propertyId, purpose: f.purpose || undefined, expectedAt: f.expectedAt ? new Date(f.expectedAt).toISOString() : undefined }).subscribe({
      next: () => { this.saving.set(false); this.showCreate.set(false); this.reload(); this.refreshCounts(); },
      error: (e) => { this.saving.set(false); this.createErr.set(apiErrorMessage(e, 'Could not invite visitor.')); },
    });
  }
}
