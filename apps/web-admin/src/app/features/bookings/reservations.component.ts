import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { BookingsService, ApiReservation } from '../../core/data/bookings.service';
import { PropertiesService } from '../../core/data/properties.service';
import { InventoryService, ApiBed } from '../../core/data/inventory.service';
import { Property } from '../../core/data/models';
import { apiErrorMessage } from '../../core/http/api-error';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EntityAvatarComponent } from '../../shared/components/entity-avatar.component';
import { StatusPillComponent } from '../../shared/components/status-pill.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { DrawerShellComponent } from '../../shared/components/drawer-shell.component';
import { IconComponent } from '../../shared/components/icon.component';
import { InrPipe } from '../../shared/pipes/inr.pipe';

@Component({
  selector: 'os-reservations',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, PageHeaderComponent, EntityAvatarComponent, StatusPillComponent,
    EmptyStateComponent, ModalComponent, DrawerShellComponent, IconComponent, InrPipe,
  ],
  template: `
    <os-page-header eyebrow="Bookings" title="Reservations"
      subtitle="Confirmed upcoming reservations awaiting arrival.">
      <div actions>
        <button (click)="openCreate()" class="h-9 px-3.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition flex items-center gap-1.5">
          <os-icon name="add" [size]="18" /> New reservation
        </button>
      </div>
    </os-page-header>

    <div class="bg-panel border border-border rounded-[16px] overflow-hidden">
      @if (reservations().length) {
        <table class="w-full text-sm">
          <thead><tr class="text-left text-[11px] uppercase tracking-wider text-faint bg-canvas">
            <th class="px-5 py-2.5 font-medium">Guest</th>
            <th class="px-5 py-2.5 font-medium">Bed</th>
            <th class="px-5 py-2.5 font-medium">Reserved until</th>
            <th class="px-5 py-2.5 font-medium">Status</th>
            <th class="px-5 py-2.5 font-medium text-right">Action</th>
          </tr></thead>
          <tbody>
            @for (r of reservations(); track r.id) {
              <tr class="border-t border-border-subtle hover:bg-canvas/60 transition">
                <td class="px-5 py-3"><div class="flex items-center gap-3"><os-avatar [name]="name(r)" [size]="34" /><span class="font-medium text-content">{{ name(r) }}</span></div></td>
                <td class="px-5 py-3 text-muted">{{ r.bedLabel ?? r.bedNumber ?? '—' }}</td>
                <td class="px-5 py-3 text-muted">{{ r.reservedUntil ?? '—' }}</td>
                <td class="px-5 py-3"><os-status-pill [status]="r.status ?? 'RESERVED'" /></td>
                <td class="px-5 py-3 text-right"><button (click)="view.set(r)" class="h-8 px-3 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas">View</button></td>
              </tr>
            }
          </tbody>
        </table>
      } @else {
        <os-empty-state icon="bookmark_added" title="No reservations" message="Reserve an available bed to create one." />
      }
      @if (msg()) { <p class="px-5 py-3 text-xs border-t border-border-subtle flex items-center gap-1" [class.text-success]="!err()" [class.text-danger]="err()"><os-icon [name]="err()?'error':'check'" [size]="14" /> {{ msg() }}</p> }
    </div>

    <!-- Create reservation modal -->
    <os-modal [open]="show()" title="New reservation" subtitle="Hold an available bed for a guest" (closed)="show.set(false)">
      <form id="resForm" class="space-y-4" (ngSubmit)="submit()">
        <div>
          <label class="block text-[12px] font-medium text-muted mb-1.5">Property *</label>
          <select name="prop" [(ngModel)]="propertyId" (ngModelChange)="loadBeds($event)" class="fld">
            <option value="" disabled>Select property</option>
            @for (p of properties(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
          </select>
        </div>
        <div>
          <label class="block text-[12px] font-medium text-muted mb-1.5">Available bed *</label>
          @if (loadingBeds()) { <p class="text-xs text-muted py-2">Loading beds…</p> }
          @else {
            <select name="bed" [(ngModel)]="bedId" class="fld" [disabled]="!availableBeds().length">
              <option value="" disabled>{{ availableBeds().length ? 'Select bed' : 'No available beds' }}</option>
              @for (b of availableBeds(); track b.id) { <option [value]="b.id">{{ b.label ?? b.bedNumber }} — {{ b.pricePaisa | inr }}/mo</option> }
            </select>
          }
        </div>
        <div>
          <label class="block text-[12px] font-medium text-muted mb-1.5">Reserved from *</label>
          <input name="from" type="date" [(ngModel)]="reservedFrom" class="fld" />
        </div>
        @if (formErr()) { <p class="text-[13px] text-danger flex items-center gap-1.5"><os-icon name="error" [size]="15" /> {{ formErr() }}</p> }
      </form>
      <div footer>
        <button (click)="show.set(false)" class="h-9 px-4 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas">Cancel</button>
        <button type="submit" form="resForm" [disabled]="saving()" class="h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover disabled:opacity-60 flex items-center gap-2">
          @if (saving()) { <span class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span> }
          Reserve bed
        </button>
      </div>
    </os-modal>

    <!-- View drawer -->
    <os-drawer [open]="!!view()" [title]="view() ? name(view()!) : ''" subtitle="Reservation detail" (closed)="view.set(null)">
      @if (view(); as r) {
        <div class="space-y-3">
          <div class="flex items-center justify-between"><span class="text-sm text-muted">Status</span><os-status-pill [status]="r.status ?? 'RESERVED'" /></div>
          <div class="rounded-xl border border-border divide-y divide-border-subtle">
            <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Bed</span><span class="text-sm font-medium text-content">{{ r.bedLabel ?? r.bedNumber ?? '—' }}</span></div>
            <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Reserved until</span><span class="text-sm font-medium text-content">{{ r.reservedUntil ?? '—' }}</span></div>
          </div>
          @if ((r.status ?? 'ACTIVE').toUpperCase() === 'ACTIVE') {
            <button (click)="cancel(r)" [disabled]="acting()" class="w-full h-10 rounded-lg border border-danger text-danger text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-danger-subtle disabled:opacity-60">
              <os-icon name="cancel" [size]="16" /> Cancel reservation (release bed)
            </button>
          }
        </div>
      }
    </os-drawer>
  `,
  styles: [`
    .fld { width:100%; height:40px; padding:0 12px; border-radius:8px; border:1px solid var(--border);
      background:var(--panel); font-size:14px; color:var(--text-primary); outline:none; }
    .fld:focus { border-color:var(--accent); box-shadow:0 0 0 2px color-mix(in srgb, var(--accent) 15%, transparent); }
  `],
})
export class ReservationsComponent {
  private readonly svc = inject(BookingsService);
  private readonly propsSvc = inject(PropertiesService);
  private readonly inv = inject(InventoryService);

  readonly reservations = signal<ApiReservation[]>([]);
  readonly properties = toSignal(this.propsSvc.list(), { initialValue: [] as Property[] });
  readonly view = signal<ApiReservation | null>(null);
  readonly msg = signal<string | null>(null);
  readonly err = signal(false);

  readonly show = signal(false);
  readonly saving = signal(false);
  readonly formErr = signal<string | null>(null);
  readonly loadingBeds = signal(false);
  readonly availableBeds = signal<ApiBed[]>([]);
  protected propertyId = '';
  protected bedId = '';
  protected reservedFrom = new Date().toISOString().slice(0, 10);

  constructor() { this.reload(); }
  private reload(): void { this.svc.reservations().subscribe((r) => this.reservations.set(r)); }

  openCreate(): void { this.propertyId = ''; this.bedId = ''; this.availableBeds.set([]); this.formErr.set(null); this.show.set(true); }

  loadBeds(propertyId: string): void {
    this.bedId = '';
    this.availableBeds.set([]);
    if (!propertyId) return;
    this.loadingBeds.set(true);
    this.inv.board(propertyId).subscribe((board) => {
      const beds = board.rooms.flatMap((r) => r.beds).filter((b) => (b.status ?? 'AVAILABLE').toUpperCase() === 'AVAILABLE');
      this.availableBeds.set(beds);
      this.loadingBeds.set(false);
    });
  }

  submit(): void {
    if (!this.bedId || !this.reservedFrom) { this.formErr.set('Select a bed and a reservation date.'); return; }
    this.saving.set(true);
    this.formErr.set(null);
    this.svc.createReservation({ bedId: this.bedId, reservedFrom: this.reservedFrom }).subscribe({
      next: () => { this.saving.set(false); this.show.set(false); this.err.set(false); this.msg.set('Bed reserved.'); this.reload(); },
      error: (e) => { this.saving.set(false); this.formErr.set(apiErrorMessage(e, 'Could not create reservation.')); },
    });
  }

  name(r: ApiReservation): string { return r.tenantName || r.residentName || r.guestName || r.userName || r.bookingNumber || 'Reservation'; }

  readonly acting = signal(false);
  cancel(r: ApiReservation): void {
    this.acting.set(true);
    this.svc.cancelReservation(r.id).subscribe({
      next: () => { this.acting.set(false); this.view.set(null); this.err.set(false); this.msg.set('Reservation cancelled — bed released.'); this.reload(); },
      error: (e) => { this.acting.set(false); this.err.set(true); this.msg.set(apiErrorMessage(e, 'Could not cancel reservation.')); },
    });
  }
}
