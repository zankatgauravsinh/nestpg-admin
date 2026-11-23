import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionStore } from '../../core/auth/session.store';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject, switchMap } from 'rxjs';
import { BookingsService, ApiBooking, ApiReservation } from '../../core/data/bookings.service';
import { holdState, reservationOptionLabel } from '../../core/data/reservation-display';
import { apiErrorMessage } from '../../core/http/api-error';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { MetricCardComponent } from '../../shared/components/metric-card.component';
import { SearchInputComponent } from '../../shared/components/search-input.component';
import { EntityAvatarComponent } from '../../shared/components/entity-avatar.component';
import { StatusPillComponent } from '../../shared/components/status-pill.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { DrawerShellComponent } from '../../shared/components/drawer-shell.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { IconComponent } from '../../shared/components/icon.component';
import { InrPipe } from '../../shared/pipes/inr.pipe';

type Mode = 'all' | 'check-in' | 'check-out';

/** Shared bookings queue. `mode` filters the queue and exposes the right action. */
@Component({
  selector: 'os-bookings-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent, MetricCardComponent, SearchInputComponent,
    FormsModule, EntityAvatarComponent, StatusPillComponent, EmptyStateComponent, DrawerShellComponent, ModalComponent, IconComponent, InrPipe,
    RouterLink,
  ],
  template: `
    <os-page-header [eyebrow]="eyebrow()" [title]="title()" [subtitle]="subtitle()">
      <div actions>
        <button (click)="newBooking()" class="h-9 px-3.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition flex items-center gap-1.5">
          <os-icon name="add" [size]="18" /> New booking
        </button>
      </div>
    </os-page-header>
    @if (toast()) { <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] bg-[var(--primary-container)] text-white text-sm px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2"><os-icon name="info" [size]="18" /> {{ toast() }}</div> }

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <os-metric label="In Queue" [value]="filtered().length" [icon]="icon()" />
      <os-metric label="Confirmed" [value]="count('CONFIRMED')" icon="bookmark_added" />
      <os-metric label="Checked In" [value]="count('CHECKED_IN')" icon="login" />
      <os-metric label="Checked Out" [value]="count('CHECKED_OUT')" icon="logout" />
    </div>

    <div class="mb-5"><os-search [(value)]="query" placeholder="Search bookings…" width="100%" /></div>

    <div class="bg-panel border border-border rounded-[16px] overflow-hidden">
      @if (filtered().length) {
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-[11px] uppercase tracking-wider text-faint bg-canvas">
              <th class="px-5 py-2.5 font-medium">Guest</th>
              <th class="px-5 py-2.5 font-medium">Bed</th>
              <th class="px-5 py-2.5 font-medium">Check-in</th>
              <th class="px-5 py-2.5 font-medium">Status</th>
              <th class="px-5 py-2.5 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            @for (b of filtered(); track b.id) {
              <tr class="border-t border-border-subtle hover:bg-canvas/60 transition">
                <td class="px-5 py-3">
                  <div class="flex items-center gap-3">
                    <os-avatar [name]="name(b)" [size]="34" />
                    <span class="font-medium text-content">{{ name(b) }}</span>
                  </div>
                </td>
                <td class="px-5 py-3 text-muted">{{ b.bedLabel ?? b.bedNumber ?? '—' }}</td>
                <td class="px-5 py-3 text-muted">{{ b.checkInDate ?? b.checkIn ?? '—' }}</td>
                <td class="px-5 py-3">@if (b.status) { <os-status-pill [status]="b.status" /> }</td>
                <td class="px-5 py-3 text-right">
                  @if (mode() === 'check-in') {
                    <button (click)="act(b, 'in')" class="h-8 px-3 rounded-lg bg-success text-white text-[13px] font-semibold hover:opacity-90">Check in</button>
                  } @else if (mode() === 'check-out') {
                    <button (click)="act(b, 'out')" class="h-8 px-3 rounded-lg bg-primary-container text-white text-[13px] font-semibold hover:opacity-90">Check out</button>
                  } @else {
                    <button (click)="view.set(b)" class="h-8 px-3 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas">View</button>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      } @else {
        <os-empty-state [icon]="icon()" title="Nothing in the queue"
          message="Bookings matching this view will appear here, pulled live from the bookings service." />
      }
      @if (msg()) { <p class="px-5 py-3 text-xs text-success flex items-center gap-1 border-t border-border-subtle"><os-icon name="check" [size]="14" /> {{ msg() }}</p> }
    </div>

    <!-- Booking view drawer -->
    <os-drawer [open]="!!view()" [title]="view()?.tenantName || view()?.bookingNumber || 'Booking'" subtitle="Booking detail" (closed)="view.set(null)">
      @if (view(); as b) {
        <div class="space-y-5">
          <div class="flex items-center justify-between"><span class="text-sm text-muted">Status</span><os-status-pill [status]="b.status ?? 'CONFIRMED'" /></div>
          <div class="rounded-xl border border-border divide-y divide-border-subtle">
            <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Booking #</span><span class="text-sm font-medium text-content">{{ b.bookingNumber ?? '—' }}</span></div>
            <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Resident</span><span class="text-sm font-medium text-content">{{ b.tenantName ?? 'Guest' }}</span></div>
            <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Property</span><span class="text-sm font-medium text-content">{{ b.propertyName ?? '—' }}</span></div>
            <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Unit</span><span class="text-sm font-medium text-content">{{ b.floorNumber != null ? 'Floor ' + b.floorNumber + ' · ' : '' }}{{ b.roomNumber ?? '—' }}{{ b.bedLabel ? '-' + b.bedLabel : '' }}</span></div>
            <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Check-in</span><span class="text-sm font-medium text-content">{{ b.checkInDate ?? '—' }}</span></div>
            <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Check-out</span><span class="text-sm font-medium text-content">{{ b.checkOutDate ?? 'Ongoing' }}</span></div>
            <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Rent</span><span class="text-sm font-medium text-content">{{ b.rentPaisa | inr }}/mo</span></div>
            <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Paid</span><span class="text-sm font-medium text-success">{{ b.totalPaidPaisa | inr }}</span></div>
          </div>
          @if (canReadDeposits() && b.id) {
            <!-- ADM-D.1 — read-only link to the booking's deposit history (settlements, refunds, disputes). -->
            <a [routerLink]="['/finance/deposits', b.id]" data-testid="drawer-deposit-history"
               class="inline-flex items-center gap-1 text-[13px] font-medium text-accent underline-offset-2 hover:underline">Deposit history</a>
          }
        </div>
      }
      <div footer class="w-full">
        @if (view(); as b) {
          @if (panel() === 'cancel') {
            <div class="rounded-lg border border-border p-3 space-y-2 mb-2">
              <input [(ngModel)]="reason" placeholder="Cancellation reason" class="fld" />
              <div class="flex gap-2">
                <button (click)="cancel(b)" [disabled]="acting() || !reason.trim()" class="flex-1 h-9 rounded-lg bg-danger text-white text-[13px] font-semibold disabled:opacity-60">Confirm cancel</button>
                <button (click)="panel.set(null)" class="h-9 px-3 rounded-lg border border-border text-[13px] text-content">Back</button>
              </div>
            </div>
          } @else if (panel() === 'notice') {
            <div class="rounded-lg border border-border p-3 space-y-2 mb-2">
              <label class="block text-[12px] text-muted">Expected move-out date (optional)</label>
              <input type="date" [(ngModel)]="moveOutDate" class="fld" />
              <div class="flex gap-2">
                <button (click)="notice(b)" [disabled]="acting()" class="flex-1 h-9 rounded-lg bg-warning text-white text-[13px] font-semibold disabled:opacity-60">Record notice</button>
                <button (click)="panel.set(null)" class="h-9 px-3 rounded-lg border border-border text-[13px] text-content">Back</button>
              </div>
            </div>
          } @else if (panel() === 'noshow') {
            <div class="rounded-lg border border-danger/40 bg-danger-subtle p-3 flex items-center justify-between gap-2 mb-2">
              <span class="text-[13px] text-content">Mark as no-show?</span>
              <div class="flex gap-2">
                <button (click)="noShow(b)" [disabled]="acting()" class="h-8 px-3 rounded-lg bg-danger text-white text-[13px] font-semibold disabled:opacity-60">No-show</button>
                <button (click)="panel.set(null)" class="h-8 px-3 rounded-lg border border-border text-[13px] text-content">Back</button>
              </div>
            </div>
          }
          <div class="flex flex-wrap gap-2">
            @if (b.status === 'CONFIRMED') {
              <button (click)="act(b, 'in')" [disabled]="acting()" class="flex-1 h-10 rounded-lg bg-success text-white text-sm font-semibold disabled:opacity-60">Check in</button>
              <button (click)="panel.set('noshow')" [disabled]="acting()" class="h-10 px-3 rounded-lg border border-border text-content text-sm font-medium">No-show</button>
            }
            @if (b.status === 'CHECKED_IN') {
              <button (click)="act(b, 'out')" [disabled]="acting()" class="flex-1 h-10 rounded-lg bg-primary-container text-white text-sm font-semibold disabled:opacity-60">Check out</button>
              <button (click)="panel.set('notice')" [disabled]="acting()" class="h-10 px-3 rounded-lg border border-border text-content text-sm font-medium">Give notice</button>
            }
            @if (b.status === 'PENDING' || b.status === 'CONFIRMED') {
              <button (click)="panel.set('cancel')" [disabled]="acting()" class="h-10 px-3 rounded-lg border border-danger text-danger text-sm font-medium">Cancel booking</button>
            }
            <button (click)="view.set(null)" class="h-10 px-3 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas">Close</button>
          </div>
        }
      </div>
    </os-drawer>

    <!-- New booking (convert reservation) -->
    <os-modal [open]="showCreate()" title="New booking" subtitle="Confirm a booking from an active reservation" (closed)="showCreate.set(false)">
      <form id="bkForm" class="space-y-4" (ngSubmit)="submitBooking()">
        <div>
          <label class="block text-[12px] font-medium text-muted mb-1.5">Active reservation *</label>
          <select name="res" [(ngModel)]="reservationId" (ngModelChange)="pickHold($event)" class="fld" [disabled]="!reservations().length">
            <option value="" disabled>{{ reservations().length ? 'Select reservation' : 'No live holds' }}</option>
            @for (r of reservations(); track r.id) { <option [value]="r.id">{{ holdOption(r) }}</option> }
          </select>
          <p class="text-[11px] text-faint mt-1.5">Reserve a bed first (Reservations → New reservation).</p>
        </div>
        <div>
          <label class="block text-[12px] font-medium text-muted mb-1.5">Monthly rent (₹) *</label>
          <input name="rent" type="number" [(ngModel)]="rent" placeholder="12000" class="fld" />
          @if (quotedRent() !== null) {
            <p class="text-[11px] text-faint mt-1.5" data-testid="quoted-rent">Quoted rent for this hold: {{ quotedRent()! | inr: 'full' }}. The booking must use this amount.</p>
          }
        </div>
        @if (createErr()) { <p class="text-[13px] text-danger flex items-center gap-1.5"><os-icon name="error" [size]="15" /> {{ createErr() }}</p> }
      </form>
      <div footer>
        <button (click)="showCreate.set(false)" class="h-9 px-4 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas">Cancel</button>
        <button type="submit" form="bkForm" [disabled]="saving()" class="h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover disabled:opacity-60 flex items-center gap-2">
          @if (saving()) { <span class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span> }
          Create booking
        </button>
      </div>
    </os-modal>
  `,
  styles: [`
    .fld { width:100%; height:40px; padding:0 12px; border-radius:8px; border:1px solid var(--border);
      background:var(--panel); font-size:14px; color:var(--text-primary); outline:none; }
    .fld:focus { border-color:var(--accent); box-shadow:0 0 0 2px color-mix(in srgb, var(--accent) 15%, transparent); }
  `],
})
export class BookingsListComponent {
  readonly view = signal<ApiBooking | null>(null);
  private readonly session = inject(SessionStore);
  /** ADM-D.1 — the deposit-history route needs OPERATIONAL_READ (same as the backend read). */
  readonly canReadDeposits = computed(() => this.session.hasCapability('OPERATIONAL_READ'));
  private readonly svc = inject(BookingsService);
  readonly mode = input<Mode>('all');
  readonly eyebrow = input('Bookings');
  readonly title = input('Bookings');
  readonly subtitle = input<string | null>(null);

  private readonly reload$ = new BehaviorSubject<void>(undefined);
  private readonly all = toSignal(this.reload$.pipe(switchMap(() => this.svc.bookings())), { initialValue: [] as ApiBooking[] });
  readonly query = signal('');
  readonly msg = signal<string | null>(null);
  readonly toast = signal<string | null>(null);

  // ── Add booking (convert an ACTIVE reservation) ──────────────────────────
  readonly showCreate = signal(false);
  readonly saving = signal(false);
  readonly createErr = signal<string | null>(null);
  readonly reservations = signal<ApiReservation[]>([]);
  protected reservationId = '';
  protected rent: number | null = null;

  /** The server's quote for the selected hold, in paise (null until known). */
  readonly quotedRent = signal<number | null>(null);

  /** Picking a hold fills in the server's quoted rent, so Ops never has to guess it. */
  pickHold(id: string): void {
    this.quotedRent.set(null);
    if (!id) return;
    this.svc.reservationQuote(id).subscribe((q) => {
      if (!q || this.reservationId !== id) return;
      this.quotedRent.set(q.rentPaisa);
      this.rent = q.rentPaisa / 100;
    });
  }

  newBooking(): void {
    this.reservationId = ''; this.rent = null; this.createErr.set(null); this.quotedRent.set(null);
    this.showCreate.set(true);
    // D4: only holds that can still be confirmed (ACTIVE and inside their 15 minutes).
    this.svc.reservations().subscribe((rs) => this.reservations.set(rs.filter((r) => holdState(r).live)));
  }

  holdOption(r: ApiReservation): string { return reservationOptionLabel(r); }

  submitBooking(): void {
    if (!this.reservationId || !this.rent) { this.createErr.set('Pick a reservation and enter the monthly rent.'); return; }
    this.saving.set(true); this.createErr.set(null);
    this.svc.createBooking({ reservationId: this.reservationId, rentPaisa: this.rent * 100 }).subscribe({
      next: () => { this.saving.set(false); this.showCreate.set(false); this.msg.set('Booking created from reservation.'); this.reload$.next(); },
      error: (e) => {
        this.saving.set(false);
        const msg = apiErrorMessage(e, 'Could not create booking.');
        const q = this.quotedRent();
        // Say what the rent must be, not just that it is wrong.
        this.createErr.set(/rent mismatch/i.test(msg) && q !== null
          ? `Rent mismatch: this hold's quoted rent is ₹${(q / 100).toLocaleString('en-IN')}. Use the quoted amount.`
          : msg);
      },
    });
  }

  readonly filtered = computed(() => {
    const q = this.query().toLowerCase().trim();
    const m = this.mode();
    return this.all().filter((b) => {
      if (m === 'check-in' && !(b.status === 'CONFIRMED' || b.status === 'RESERVED')) return false;
      if (m === 'check-out' && !(b.status === 'CHECKED_IN' || b.status === 'NOTICE_GIVEN')) return false;
      if (q && !this.name(b).toLowerCase().includes(q)) return false;
      return true;
    });
  });

  icon(): string { return this.mode() === 'check-in' ? 'login' : this.mode() === 'check-out' ? 'logout' : 'event_available'; }
  count(s: string): number { return this.all().filter((b) => b.status === s).length; }
  name(b: ApiBooking): string { return b.tenantName || b.residentName || b.guestName || b.userName || b.bookingNumber || 'Guest'; }

  // ── booking lifecycle actions ──────────────────────────────────────────────
  readonly acting = signal(false);
  readonly panel = signal<'cancel' | 'notice' | 'noshow' | null>(null);
  reason = '';
  moveOutDate = '';

  private run(b: ApiBooking, obs: import('rxjs').Observable<unknown>, okMsg: string, failMsg: string): void {
    this.acting.set(true);
    obs.subscribe({
      next: () => {
        this.acting.set(false); this.panel.set(null); this.view.set(null);
        this.reason = ''; this.moveOutDate = '';
        this.msg.set(okMsg); this.reload$.next();
      },
      error: (e) => { this.acting.set(false); this.msg.set(apiErrorMessage(e, failMsg)); },
    });
  }

  act(b: ApiBooking, kind: 'in' | 'out'): void {
    this.run(b, kind === 'in' ? this.svc.checkIn(b.id) : this.svc.checkOut(b.id),
      `${this.name(b)} ${kind === 'in' ? 'checked in' : 'checked out'}.`, 'Action failed.');
  }
  cancel(b: ApiBooking): void {
    const reason = this.reason.trim(); if (!reason) return;
    this.run(b, this.svc.cancel(b.id, { reason }), `Booking ${b.bookingNumber ?? ''} cancelled.`, 'Could not cancel.');
  }
  notice(b: ApiBooking): void {
    const body = this.moveOutDate ? { expectedMoveOutDate: this.moveOutDate } : {};
    this.run(b, this.svc.giveNotice(b.id, body), `Notice recorded for ${this.name(b)}.`, 'Could not record notice.');
  }
  noShow(b: ApiBooking): void {
    this.run(b, this.svc.noShow(b.id, {}), `${this.name(b)} marked no-show.`, 'Could not mark no-show.');
  }
}
