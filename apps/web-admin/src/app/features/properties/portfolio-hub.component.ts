import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { PropertiesService, CreatePropertyPayload } from '../../core/data/properties.service';
import { BookingsService, ApiBooking } from '../../core/data/bookings.service';
import { Property, PropertyType } from '../../core/data/models';
import { SessionStore } from '../../core/auth/session.store';
import { apiErrorMessage } from '../../core/http/api-error';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { InsightChipComponent } from '../../shared/components/insight-chip.component';
import { SearchInputComponent } from '../../shared/components/search-input.component';
import { EntityAvatarComponent } from '../../shared/components/entity-avatar.component';
import { IconComponent } from '../../shared/components/icon.component';
import { LocationPickerComponent } from '../../shared/components/location-picker.component';
import { LatLng, pinOf } from '../../core/maps/google-maps.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { DrawerShellComponent } from '../../shared/components/drawer-shell.component';
import { InrPipe } from '../../shared/pipes/inr.pipe';

const TYPE_LABEL: Record<PropertyType, string> = {
  PG: 'PG', HOSTEL: 'Hostel', CO_LIVING: 'Co-Living', RENTAL: 'Rental',
};

interface Health { label: string; cls: string; bar: string; }
function health(rate: number): Health {
  if (rate >= 90) return { label: 'Excellent', cls: 'bg-success-subtle text-success', bar: 'bg-success' };
  if (rate >= 70) return { label: 'Healthy', cls: 'bg-info-subtle text-info', bar: 'bg-info' };
  if (rate >= 40) return { label: 'Attention', cls: 'bg-warning-subtle text-warning', bar: 'bg-warning' };
  return { label: 'Critical', cls: 'bg-danger-subtle text-danger', bar: 'bg-danger' };
}

@Component({
  selector: 'os-portfolio-hub',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, RouterLink, PageHeaderComponent, InsightChipComponent, SearchInputComponent,
    EntityAvatarComponent, IconComponent, EmptyStateComponent, ModalComponent, DrawerShellComponent, InrPipe, LocationPickerComponent],
  template: `
    <os-page-header eyebrow="Properties" title="Property Portfolio"
      subtitle="Manage all properties, occupancy, revenue, and operational health.">
      <div actions class="flex items-center gap-2">
        <button (click)="toast.set('Import accepts a CSV of properties — endpoint pending.'); clear()" class="h-9 px-3 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas transition flex items-center gap-1.5">
          <os-icon name="upload" [size]="18" /> Import
        </button>
        <button (click)="exportCsv()" class="h-9 px-3 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas transition flex items-center gap-1.5">
          <os-icon name="download" [size]="18" /> Export
        </button>
        <a routerLink="/properties/new" class="h-9 px-3.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition flex items-center gap-1.5">
          <os-icon name="add" [size]="18" /> Add Property
        </a>
      </div>
    </os-page-header>

    <!-- Summary strip (insight chips) -->
    <div class="flex flex-wrap items-center gap-2.5 mb-6">
      <os-insight-chip icon="domain" tone="neutral">{{ filtered().length }} Properties</os-insight-chip>
      <os-insight-chip icon="bed" tone="neutral">{{ sum('totalBeds') }} Beds</os-insight-chip>
      <os-insight-chip icon="groups" tone="success">{{ sum('occupiedBeds') }} Occupied</os-insight-chip>
      <os-insight-chip icon="bookmark_added" tone="warning">{{ sum('reservedBeds') }} Reserved</os-insight-chip>
      <os-insight-chip icon="meeting_room" tone="info">{{ sum('availableBeds') }} Available</os-insight-chip>
      <os-insight-chip icon="pie_chart" tone="accent">{{ portfolioOccupancy() }}% Occupancy</os-insight-chip>
      <os-insight-chip icon="payments" tone="neutral">{{ sum('monthlyRevenuePaise') | inr }} / mo</os-insight-chip>
      <os-insight-chip icon="confirmation_number" tone="neutral">{{ openIssues() }} Open Issues</os-insight-chip>
      <os-insight-chip icon="location_city" tone="neutral">{{ activeCities() }} Cities</os-insight-chip>
    </div>

    <!-- Filter bar -->
    <div class="flex flex-wrap items-center gap-2.5 mb-5">
      <os-search [(value)]="query" placeholder="Search property…" width="240px" />
      <select [(ngModel)]="city" class="ctl"><option value="">All cities</option>@for (c of cities(); track c) { <option [value]="c">{{ c }}</option> }</select>
      <select [(ngModel)]="type" class="ctl"><option value="">All types</option>@for (t of typeOpts; track t.v) { <option [value]="t.v">{{ t.l }}</option> }</select>
      <select [(ngModel)]="status" class="ctl"><option value="">All statuses</option>@for (s of statusOpts; track s) { <option [value]="s">{{ s }}</option> }</select>
      <select [(ngModel)]="occ" class="ctl"><option value="">Any occupancy</option><option value="high">High (≥80%)</option><option value="mid">Medium (40–79%)</option><option value="low">Low (&lt;40%)</option></select>
      <div class="flex-1"></div>
      <div class="flex items-center gap-1.5">
        <span class="text-[12px] text-faint">Sort</span>
        <select [(ngModel)]="sort" class="ctl"><option value="revenue">Revenue</option><option value="occupancy">Occupancy</option><option value="newest">Newest</option></select>
      </div>
    </div>

    <!-- Property grid -->
    @if (filtered().length) {
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        @for (p of filtered(); track p.id) {
          <article (click)="open(p)" class="bg-panel border border-border rounded-[16px] overflow-hidden hover:border-accent/50 hover:shadow-[var(--shadow-md)] transition cursor-pointer flex flex-col">
            <!-- Top: image + name + status -->
            <div class="flex gap-4 p-4">
              <div class="w-24 h-24 rounded-xl overflow-hidden shrink-0 flex items-center justify-center text-white text-2xl font-bold"
                   [style.background]="p.coverImageUrl ? 'transparent' : gradient(p.id)">
                @if (p.coverImageUrl) { <img [src]="p.coverImageUrl" [alt]="p.name" class="w-full h-full object-cover" /> }
                @else { {{ p.name.charAt(0) }} }
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <h3 class="text-base font-semibold text-content truncate">{{ p.name }}</h3>
                    <p class="text-xs text-muted flex items-center gap-1 mt-0.5"><os-icon name="location_on" [size]="14" /> {{ p.city }} · {{ label(p.type) }}</p>
                  </div>
                  <span class="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full" [class]="statusCls(p.status)">{{ p.status }}</span>
                </div>
                <!-- Occupancy bar -->
                <div class="mt-3">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-[11px] font-semibold px-1.5 py-0.5 rounded" [class]="hp(p).cls">{{ hp(p).label }}</span>
                    <span class="text-xs font-semibold text-content">{{ rate(p) }}%</span>
                  </div>
                  <div class="h-2 rounded-full bg-canvas overflow-hidden"><div class="h-full rounded-full" [class]="hp(p).bar" [style.width.%]="rate(p)"></div></div>
                </div>
              </div>
            </div>

            <!-- Middle: counts -->
            <div class="grid grid-cols-4 gap-2 px-4 pb-3 border-b border-border-subtle">
              <div><p class="text-sm font-semibold text-content">{{ p.occupiedBeds }}</p><p class="text-[10px] text-faint uppercase tracking-wide">Occupied</p></div>
              <div><p class="text-sm font-semibold text-content">{{ p.reservedBeds ?? 0 }}</p><p class="text-[10px] text-faint uppercase tracking-wide">Reserved</p></div>
              <div><p class="text-sm font-semibold text-content">{{ p.availableBeds ?? 0 }}</p><p class="text-[10px] text-faint uppercase tracking-wide">Vacant</p></div>
              <div><p class="text-sm font-semibold text-content">{{ p.monthlyRevenuePaise | inr }}</p><p class="text-[10px] text-faint uppercase tracking-wide">Revenue</p></div>
            </div>

            <!-- Insight row -->
            <div class="flex items-center gap-4 px-4 py-2.5 text-xs">
              <span class="flex items-center gap-1 text-muted"><os-icon name="flight_land" [size]="15" class="text-success" /> {{ ops(p.id).arr }} arrivals</span>
              <span class="flex items-center gap-1 text-muted"><os-icon name="flight_takeoff" [size]="15" class="text-warning" /> {{ ops(p.id).dep }} departures</span>
              <span class="flex items-center gap-1 text-muted"><os-icon name="confirmation_number" [size]="15" class="text-faint" /> {{ openTickets }} tickets</span>
            </div>

            <!-- Bottom: activity + manager + action -->
            <div class="flex items-center justify-between px-4 py-3 mt-auto bg-canvas/40 border-t border-border-subtle">
              <div class="flex items-center gap-2 min-w-0">
                <os-avatar [name]="p.manager === '—' ? 'Unassigned' : p.manager" [size]="28" />
                <div class="min-w-0">
                  <p class="text-[12px] font-medium text-content truncate">{{ p.manager === '—' ? 'Unassigned' : p.manager }}</p>
                  <p class="text-[10px] text-faint">Last activity {{ ops(p.id).last }}</p>
                </div>
              </div>
              <a [routerLink]="['/properties/workspace']" [queryParams]="{ id: p.id }" (click)="$event.stopPropagation()"
                 class="h-8 px-3 rounded-lg bg-[var(--primary-container)] text-white text-[12px] font-semibold hover:opacity-90 transition flex items-center gap-1">
                Workspace <os-icon name="arrow_forward" [size]="14" />
              </a>
            </div>
          </article>
        }
      </div>
    } @else {
      <os-empty-state icon="domain" title="No properties found"
        message="Try a different search or filter, or add your first property to get started." />
    }

    <!-- Quick view drawer -->
    <os-drawer [open]="!!selected()" [title]="selected()?.name ?? ''" [subtitle]="selected() ? selected()!.city + ' · ' + label(selected()!.type) : ''" width="460px" (closed)="selected.set(null)">
      @if (selected(); as p) {
        <div class="flex gap-1 border-b border-border mb-4 -mt-1">
          @for (t of tabs; track t) {
            <button (click)="tab.set(t)" class="px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition" [class]="tab() === t ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-content'">{{ t }}</button>
          }
        </div>
        @switch (tab()) {
          @case ('Overview') {
            <div class="rounded-xl border border-border divide-y divide-border-subtle">
              <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Status</span><span class="text-sm font-medium text-content">{{ p.status }}</span></div>
              <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Type</span><span class="text-sm font-medium text-content">{{ label(p.type) }}</span></div>
              <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Address</span><span class="text-sm font-medium text-content text-right">{{ p.address }}</span></div>
              <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Manager</span><span class="text-sm font-medium text-content">{{ p.manager === '—' ? 'Unassigned' : p.manager }}</span></div>
              <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Total beds</span><span class="text-sm font-medium text-content">{{ p.totalBeds }}</span></div>
            </div>
          }
          @case ('Occupancy') {
            <div class="space-y-3">
              <div class="flex items-center justify-between"><span class="text-sm text-muted">Health</span><span class="text-[12px] font-semibold px-2 py-0.5 rounded-full" [class]="hp(p).cls">{{ hp(p).label }} · {{ rate(p) }}%</span></div>
              @for (s of occBreakdown(p); track s.label) {
                <div><div class="flex justify-between text-sm mb-1"><span class="text-muted">{{ s.label }}</span><span class="font-medium text-content">{{ s.value }}</span></div>
                  <div class="h-1.5 rounded-full bg-canvas overflow-hidden"><div class="h-full rounded-full" [class]="s.color" [style.width.%]="p.totalBeds ? (s.value/p.totalBeds*100) : 0"></div></div></div>
              }
            </div>
          }
          @case ('Revenue') {
            <div class="rounded-xl border border-border divide-y divide-border-subtle">
              <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Monthly run-rate</span><span class="text-sm font-semibold text-content">{{ p.monthlyRevenuePaise | inr }}</span></div>
              <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Occupied beds</span><span class="text-sm font-medium text-content">{{ p.occupiedBeds }}</span></div>
              <div class="flex justify-between px-4 py-2.5"><span class="text-sm text-muted">Avg / occupied bed</span><span class="text-sm font-medium text-content">{{ (p.occupiedBeds ? p.monthlyRevenuePaise / p.occupiedBeds : 0) | inr }}</span></div>
            </div>
          }
          @default {
            <div class="space-y-3">
              <div class="grid grid-cols-3 gap-2">
                <div class="rounded-xl border border-border p-3 text-center"><p class="text-lg font-semibold text-success">{{ ops(p.id).arr }}</p><p class="text-[10px] text-faint uppercase">Arrivals</p></div>
                <div class="rounded-xl border border-border p-3 text-center"><p class="text-lg font-semibold text-warning">{{ ops(p.id).dep }}</p><p class="text-[10px] text-faint uppercase">Departures</p></div>
                <div class="rounded-xl border border-border p-3 text-center"><p class="text-lg font-semibold text-content">{{ openTickets }}</p><p class="text-[10px] text-faint uppercase">Tickets</p></div>
              </div>
              <p class="text-xs text-faint">Last activity {{ ops(p.id).last }}. Tickets endpoint pending.</p>
            </div>
          }
        }
        <!-- Lifecycle actions (backend-enforced; UI gates by status + persona) -->
        <div class="mt-5 space-y-2">
          @if (p.status === 'DRAFT' || p.status === 'REJECTED') {
            <button (click)="submit(p)" [disabled]="acting()" class="w-full h-10 rounded-lg bg-accent text-white text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60">
              <os-icon name="send" [size]="16" /> Submit for review
            </button>
          }
          @if (p.status === 'PENDING_REVIEW' && isOps()) {
            <div class="grid grid-cols-2 gap-2">
              <button (click)="verify(p)" [disabled]="acting()" class="h-10 rounded-lg bg-success text-white text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60">
                <os-icon name="check_circle" [size]="16" /> Approve
              </button>
              <button (click)="rejectFor.set(p.id)" [disabled]="acting()" class="h-10 rounded-lg border border-danger text-danger text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60">
                <os-icon name="cancel" [size]="16" /> Reject
              </button>
            </div>
          }
          @if (rejectFor() === p.id) {
            <div class="rounded-lg border border-border p-3 space-y-2">
              <input [(ngModel)]="rejectReason" placeholder="Reason for rejection" class="fld" />
              <div class="flex gap-2">
                <button (click)="reject(p)" [disabled]="acting() || !rejectReason.trim()" class="flex-1 h-9 rounded-lg bg-danger text-white text-[13px] font-semibold disabled:opacity-60">Confirm reject</button>
                <button (click)="rejectFor.set(null)" class="h-9 px-3 rounded-lg border border-border text-[13px] text-content">Cancel</button>
              </div>
            </div>
          }
          <button (click)="openEdit(p)" [disabled]="acting()" class="w-full h-10 rounded-lg border border-border text-content text-sm font-semibold flex items-center justify-center gap-1.5 hover:border-accent hover:text-accent disabled:opacity-60">
            <os-icon name="edit" [size]="16" /> Edit details
          </button>
          <div class="grid grid-cols-2 gap-2">
            <a [routerLink]="['/properties/workspace']" [queryParams]="{ id: p.id }" class="h-10 rounded-lg bg-accent text-white text-sm font-semibold flex items-center justify-center gap-1.5">
              Workspace <os-icon name="arrow_forward" [size]="16" />
            </a>
            <button (click)="confirmDelete.set(p.id)" [disabled]="acting()" class="h-10 rounded-lg border border-border text-danger text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-danger-subtle disabled:opacity-60">
              <os-icon name="delete" [size]="16" /> Delete
            </button>
          </div>
          @if (confirmDelete() === p.id) {
            <div class="rounded-lg border border-danger/40 bg-danger-subtle p-3 flex items-center justify-between gap-2">
              <span class="text-[13px] text-content">Delete this property?</span>
              <div class="flex gap-2">
                <button (click)="del(p)" [disabled]="acting()" class="h-8 px-3 rounded-lg bg-danger text-white text-[13px] font-semibold disabled:opacity-60">Delete</button>
                <button (click)="confirmDelete.set(null)" class="h-8 px-3 rounded-lg border border-border text-[13px] text-content">Cancel</button>
              </div>
            </div>
          }
        </div>
      }
    </os-drawer>

    <!-- Add property modal -->
    <os-modal [open]="showCreate()" title="Add property" subtitle="Creates a DRAFT listing you can configure" (closed)="showCreate.set(false)">
      <form id="createProp" class="space-y-4" (ngSubmit)="submitCreate()">
        <div><label class="block text-[12px] font-medium text-muted mb-1.5">Property name *</label><input name="name" [(ngModel)]="form.name" required placeholder="Skyview PG for Girls" class="fld" /></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-[12px] font-medium text-muted mb-1.5">Type *</label><select name="type" [(ngModel)]="form.propertyType" class="fld">@for (t of apiTypes; track t.value) { <option [value]="t.value">{{ t.label }}</option> }</select></div>
          <div><label class="block text-[12px] font-medium text-muted mb-1.5">Pincode *</label><input name="pincode" [(ngModel)]="form.pincode" required placeholder="560001" class="fld" /></div>
        </div>
        <div><label class="block text-[12px] font-medium text-muted mb-1.5">Address line 1 *</label><input name="addr" [(ngModel)]="form.addressLine1" required placeholder="14, MG Road" class="fld" /></div>
        <div class="grid grid-cols-3 gap-3">
          <div><label class="block text-[12px] font-medium text-muted mb-1.5">Locality *</label><input name="loc" [(ngModel)]="form.areaLocality" required class="fld" /></div>
          <div><label class="block text-[12px] font-medium text-muted mb-1.5">City *</label><input name="city" [(ngModel)]="form.city" required class="fld" /></div>
          <div><label class="block text-[12px] font-medium text-muted mb-1.5">State *</label><input name="state" [(ngModel)]="form.state" required class="fld" /></div>
        </div>
        <div>
          <label class="block text-[12px] font-medium text-muted mb-1.5">Exact location</label>
          <os-location-picker [value]="pinFor(form)" [address]="addressOf(form)" (pinChange)="setPin(form, $event)" />
        </div>
        @if (error()) { <p class="text-[13px] text-danger flex items-center gap-1.5"><os-icon name="error" [size]="15" /> {{ error() }}</p> }
      </form>
      <div footer>
        <button (click)="showCreate.set(false)" class="h-9 px-4 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas">Cancel</button>
        <button type="submit" form="createProp" [disabled]="saving()" class="h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover disabled:opacity-60 flex items-center gap-2">
          @if (saving()) { <span class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span> } Create property
        </button>
      </div>
    </os-modal>

    <!-- Edit property modal -->
    <os-modal [open]="showEdit()" title="Edit property" subtitle="Update listing details" (closed)="showEdit.set(false)">
      <form id="editProp" class="space-y-4" (ngSubmit)="submitEdit()">
        <div><label class="block text-[12px] font-medium text-muted mb-1.5">Property name *</label><input name="ename" [(ngModel)]="editForm.name" required class="fld" /></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-[12px] font-medium text-muted mb-1.5">Type *</label><select name="etype" [(ngModel)]="editForm.propertyType" class="fld">@for (t of apiTypes; track t.value) { <option [value]="t.value">{{ t.label }}</option> }</select></div>
          <div><label class="block text-[12px] font-medium text-muted mb-1.5">Pincode *</label><input name="epincode" [(ngModel)]="editForm.pincode" required class="fld" /></div>
        </div>
        <div><label class="block text-[12px] font-medium text-muted mb-1.5">Address line 1 *</label><input name="eaddr" [(ngModel)]="editForm.addressLine1" required class="fld" /></div>
        <div class="grid grid-cols-3 gap-3">
          <div><label class="block text-[12px] font-medium text-muted mb-1.5">Locality *</label><input name="eloc" [(ngModel)]="editForm.areaLocality" required class="fld" /></div>
          <div><label class="block text-[12px] font-medium text-muted mb-1.5">City *</label><input name="ecity" [(ngModel)]="editForm.city" required class="fld" /></div>
          <div><label class="block text-[12px] font-medium text-muted mb-1.5">State *</label><input name="estate" [(ngModel)]="editForm.state" required class="fld" /></div>
        </div>
        <div>
          <label class="block text-[12px] font-medium text-muted mb-1.5">Exact location</label>
          <os-location-picker [value]="pinFor(editForm)" [address]="addressOf(editForm)" (pinChange)="setPin(editForm, $event)" />
        </div>
        <div><label class="block text-[12px] font-medium text-muted mb-1.5">Description</label><textarea name="edesc" [(ngModel)]="editForm.description" rows="2" class="fld" style="height:auto;padding:8px 12px"></textarea></div>
        @if (editErr()) { <p class="text-[13px] text-danger flex items-center gap-1.5"><os-icon name="error" [size]="15" /> {{ editErr() }}</p> }
      </form>
      <div footer>
        <button (click)="showEdit.set(false)" class="h-9 px-4 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas">Cancel</button>
        <button type="submit" form="editProp" [disabled]="saving()" class="h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover disabled:opacity-60 flex items-center gap-2">
          @if (saving()) { <span class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span> } Save changes
        </button>
      </div>
    </os-modal>
    @if (toast()) { <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] bg-[var(--primary-container)] text-white text-sm px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2"><os-icon name="check_circle" [size]="18" /> {{ toast() }}</div> }
  `,
  styles: [`
    .ctl { height:36px; padding:0 10px; border-radius:8px; border:1px solid var(--border); background:var(--panel);
      font-size:13px; color:var(--text-primary); outline:none; }
    .ctl:focus { border-color:var(--accent); }
    .fld { width:100%; height:40px; padding:0 12px; border-radius:8px; border:1px solid var(--border);
      background:var(--panel); font-size:14px; color:var(--text-primary); outline:none; }
    .fld:focus { border-color:var(--accent); box-shadow:0 0 0 2px color-mix(in srgb, var(--accent) 15%, transparent); }
  `],
})
export class PortfolioHubComponent {
  private readonly svc = inject(PropertiesService);
  private readonly bookingsSvc = inject(BookingsService);

  readonly properties = signal<Property[]>([]);
  private readonly bookings = toSignal(this.bookingsSvc.bookings({ limit: 200 }), { initialValue: [] as ApiBooking[] });
  protected readonly openTickets = 0; // no tickets endpoint yet

  readonly query = signal('');
  city = ''; type = ''; status = ''; occ = ''; sort: 'revenue' | 'occupancy' | 'newest' = 'revenue';

  protected readonly typeOpts = [{ v: 'PG', l: 'PG' }, { v: 'HOSTEL', l: 'Hostel' }, { v: 'CO_LIVING', l: 'Co-Living' }, { v: 'RENTAL', l: 'Rental' }];
  protected readonly statusOpts = ['ACTIVE', 'DRAFT', 'PENDING_REVIEW', 'PAUSED'];
  protected readonly tabs = ['Overview', 'Occupancy', 'Revenue', 'Operations'];
  readonly tab = signal('Overview');
  readonly selected = signal<Property | null>(null);

  // Add-property modal
  readonly showCreate = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly toast = signal<string | null>(null);
  protected form: CreatePropertyPayload = this.blankForm();
  protected readonly apiTypes = [
    { value: 'COLIVING', label: 'Co-Living' }, { value: 'MALE_ONLY', label: 'PG (Male)' },
    { value: 'FEMALE_ONLY', label: 'PG (Female)' }, { value: 'FAMILY', label: 'Family' }, { value: 'CORPORATE', label: 'Corporate' },
  ];

  constructor() { this.reload(); }
  private reload(): void { this.svc.portfolio().subscribe((p) => this.properties.set(p)); }

  // ── filtering / sorting ──────────────────────────────────────────────────
  readonly cities = computed(() => [...new Set(this.properties().map((p) => p.city).filter((c) => c && c !== '—'))].sort());
  readonly filtered = computed(() => {
    const q = this.query().toLowerCase().trim();
    let list = this.properties().filter((p) => {
      if (q && !`${p.name} ${p.city} ${p.address}`.toLowerCase().includes(q)) return false;
      if (this.city && p.city !== this.city) return false;
      if (this.type && p.type !== this.type) return false;
      if (this.status && p.status !== this.status) return false;
      const r = this.rate(p);
      if (this.occ === 'high' && r < 80) return false;
      if (this.occ === 'mid' && (r < 40 || r >= 80)) return false;
      if (this.occ === 'low' && r >= 40) return false;
      return true;
    });
    list = [...list].sort((a, b) =>
      this.sort === 'occupancy' ? this.rate(b) - this.rate(a)
        : this.sort === 'newest' ? a.id.localeCompare(b.id) * -1
          : b.monthlyRevenuePaise - a.monthlyRevenuePaise);
    return list;
  });

  // ── aggregates ───────────────────────────────────────────────────────────
  sum(k: 'totalBeds' | 'occupiedBeds' | 'reservedBeds' | 'availableBeds' | 'monthlyRevenuePaise'): number {
    return this.filtered().reduce((s, p) => s + (Number(p[k]) || 0), 0);
  }
  readonly portfolioOccupancy = computed(() => { const t = this.sum('totalBeds'); return t ? Math.round((this.sum('occupiedBeds') / t) * 100) : 0; });
  readonly activeCities = computed(() => new Set(this.filtered().map((p) => p.city)).size);
  readonly openIssues = computed(() => this.filtered().reduce((s, p) => s + (p.maintenanceBeds ?? 0), 0));

  // per-property today's ops from bookings
  private readonly today = new Date().toISOString().slice(0, 10);
  ops(propertyId: string): { arr: number; dep: number; last: string } {
    const bs = this.bookings().filter((b) => b.propertyId === propertyId);
    const arr = bs.filter((b) => (b.checkInDate ?? '') === this.today).length;
    const dep = bs.filter((b) => (b.checkOutDate ?? '') === this.today || b.status === 'NOTICE_GIVEN').length;
    const last = bs.map((b) => b.checkInDate ?? '').filter(Boolean).sort().pop();
    return { arr, dep, last: last || '—' };
  }

  occBreakdown(p: Property) {
    return [
      { label: 'Occupied', value: p.occupiedBeds, color: 'bg-[var(--primary-container)]' },
      { label: 'Reserved', value: p.reservedBeds ?? 0, color: 'bg-warning' },
      { label: 'Available', value: p.availableBeds ?? 0, color: 'bg-success' },
      { label: 'Maintenance', value: p.maintenanceBeds ?? 0, color: 'bg-danger' },
    ];
  }

  // ── helpers ──────────────────────────────────────────────────────────────
  label(t: PropertyType): string { return TYPE_LABEL[t]; }
  /** Use the backend-provided occupancyRate — never computed on the frontend. */
  rate(p: Property): number { return Math.round(p.occupancyRate ?? 0); }
  hp(p: Property): Health { return health(this.rate(p)); }
  statusCls(s?: string): string {
    return s === 'ACTIVE' ? 'bg-success-subtle text-success' : s === 'DRAFT' ? 'bg-canvas text-muted' : 'bg-warning-subtle text-warning';
  }
  gradient(id: string): string {
    let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const a = h % 360, b = (a + 40) % 360;
    return `linear-gradient(135deg, hsl(${a} 55% 45%), hsl(${b} 60% 35%))`;
  }

  open(p: Property): void { this.tab.set('Overview'); this.selected.set(p); }

  // ── actions ──────────────────────────────────────────────────────────────
  exportCsv(): void {
    const rows = [['Name', 'City', 'Type', 'Status', 'TotalBeds', 'Occupied', 'OccupancyRate', 'RevenuePaise'],
    ...this.filtered().map((p) => [p.name, p.city, p.type, p.status ?? '', p.totalBeds, p.occupiedBeds, this.rate(p), p.monthlyRevenuePaise])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'properties.csv'; a.click(); URL.revokeObjectURL(url);
    this.toast.set('Exported properties.csv'); this.clear();
  }
  protected clear(): void { setTimeout(() => this.toast.set(null), 3000); }

  // ── property lifecycle ─────────────────────────────────────────────────────
  private readonly session = inject(SessionStore);
  readonly acting = signal(false);
  readonly rejectFor = signal<string | null>(null);
  readonly confirmDelete = signal<string | null>(null);
  rejectReason = '';
  /**
   * Whether this admin may DECIDE a review — the capability the backend checks
   * on `verify` / `reject` (A3). FINANCE_ADMIN may view the queue but holds no
   * decision capability, so it sees no Approve/Reject here either.
   */
  isOps(): boolean { return this.session.hasCapability('PROPERTY_REVIEW_DECISION'); }

  private run(obs: import('rxjs').Observable<unknown>, okMsg: string, failMsg: string): void {
    this.acting.set(true);
    obs.subscribe({
      next: () => {
        this.acting.set(false); this.rejectFor.set(null); this.confirmDelete.set(null);
        this.selected.set(null); this.toast.set(okMsg); this.clear(); this.reload();
      },
      error: (e) => { this.acting.set(false); this.toast.set(apiErrorMessage(e, failMsg)); this.clear(); },
    });
  }
  submit(p: Property): void { this.run(this.svc.submit(p.id), `"${p.name}" submitted for review.`, 'Could not submit.'); }
  verify(p: Property): void { this.run(this.svc.verify(p.id), `"${p.name}" approved & published.`, 'Could not approve.'); }
  reject(p: Property): void {
    const reason = this.rejectReason.trim(); if (!reason) return;
    this.run(this.svc.reject(p.id, reason), `"${p.name}" rejected.`, 'Could not reject.');
    this.rejectReason = '';
  }
  del(p: Property): void { this.run(this.svc.remove(p.id), `"${p.name}" deleted.`, 'Could not delete.'); }

  // ── property edit ──────────────────────────────────────────────────────────
  readonly showEdit = signal(false);
  readonly editErr = signal<string | null>(null);
  private editId = '';
  editForm: CreatePropertyPayload = this.blankForm();
  openEdit(p: Property): void {
    this.editId = p.id; this.editErr.set(null);
    // Prefill from the raw (un-adapted) record so all required PUT fields are set.
    this.svc.raw(p.id).subscribe((r) => {
      this.editForm = {
        name: r?.name ?? p.name,
        propertyType: r?.propertyType ?? 'COLIVING',
        addressLine1: r?.addressLine1 ?? '',
        areaLocality: r?.areaLocality ?? '',
        city: r?.city ?? p.city,
        state: r?.state ?? '',
        pincode: r?.pincode ?? '',
        description: r?.description ?? '',
        ...(pinOf(r) ? { latitude: pinOf(r)!.lat, longitude: pinOf(r)!.lng } : {}),
      };
      this.selected.set(null);
      this.showEdit.set(true);
    });
  }
  submitEdit(): void {
    const f = this.editForm;
    if (!f.name || !f.propertyType || !f.addressLine1 || !f.areaLocality || !f.city || !f.state || !f.pincode) {
      this.editErr.set('Please fill all required fields.'); return;
    }
    this.saving.set(true); this.editErr.set(null);
    this.svc.update(this.editId, f).subscribe({
      next: () => { this.saving.set(false); this.showEdit.set(false); this.toast.set(`"${f.name}" updated.`); this.clear(); this.reload(); },
      error: (e) => { this.saving.set(false); this.editErr.set(apiErrorMessage(e, 'Could not update property.')); },
    });
  }

  pinFor(f: CreatePropertyPayload): LatLng | null { return pinOf(f); }
  addressOf(f: CreatePropertyPayload): string { return [f.addressLine1, f.areaLocality, f.city, f.state, f.pincode].filter(Boolean).join(', '); }
  setPin(f: CreatePropertyPayload, p: LatLng): void { f.latitude = p.lat; f.longitude = p.lng; }

  private blankForm(): CreatePropertyPayload { return { name: '', propertyType: 'COLIVING', addressLine1: '', areaLocality: '', city: '', state: '', pincode: '' }; }
  openCreate(): void { this.form = this.blankForm(); this.error.set(null); this.showCreate.set(true); }
  submitCreate(): void {
    const f = this.form;
    if (!f.name || !f.addressLine1 || !f.areaLocality || !f.city || !f.state || !f.pincode) { this.error.set('Please fill all required fields.'); return; }
    this.saving.set(true); this.error.set(null);
    this.svc.create(f).subscribe({
      next: () => { this.saving.set(false); this.showCreate.set(false); this.toast.set(`Property "${f.name}" created.`); this.clear(); this.reload(); },
      error: (e) => { this.saving.set(false); this.error.set(apiErrorMessage(e, 'Could not create property.')); },
    });
  }
}
