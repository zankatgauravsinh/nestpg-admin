import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { PropertiesService } from '../../core/data/properties.service';
import { InventoryService, Board, BoardRoom, BoardFloor, BoardBuilding, ApiBed } from '../../core/data/inventory.service';
import { BookingsService, ApiBooking, ApiReservation, paymentFromBooking } from '../../core/data/bookings.service';
import { UsersService, ApiUser, KycDocument, KycRecord, userDisplayName } from '../../core/data/users.service';
import { CollectionsApiService } from '../../core/data/collections.service';
import { InvoicesService, ApiInvoice } from '../../core/data/invoices.service';
import { PaymentsService, ApiPayment, paise } from '../../core/data/payments.service';
import { VisitorsService, ApiVisitor } from '../../core/data/visitors.service';
import { SessionStore } from '../../core/auth/session.store';
import { Property } from '../../core/data/models';
import { apiErrorMessage } from '../../core/http/api-error';
import { IconComponent } from '../../shared/components/icon.component';
import { ImageUploadComponent } from '../../shared/components/image-upload.component';
import { UploadService, MediaItem } from '../../core/data/upload.service';
import { EntityAvatarComponent } from '../../shared/components/entity-avatar.component';
import { DrawerShellComponent } from '../../shared/components/drawer-shell.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { StatusPillComponent } from '../../shared/components/status-pill.component';
import { PrivateDocComponent } from '../../shared/components/private-doc.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { InrPipe } from '../../shared/pipes/inr.pipe';

interface Occupant {
  tenantId: string;
  name: string;
  phone: string;
  avatarUrl: string | null;
  bookingNumber: string;
  bookingId: string | null;
  bookingStatus: string;
  moveIn: string | null;
  leaseEnd: string | null;
  rentStatus: string;
  kycStatus: string;
  outstandingPaisa: number;
}
interface ReservedInfo { tenantName: string; reservedUntil: string | null; status: string }
interface RoomStats {
  capacity: number; occupied: number; reserved: number; available: number;
  maintenance: number; blocked: number; pct: number; revenuePaisa: number;
  badge: string; badgeClass: string;
}
interface TimelineEntry { kind: string; label: string; date: string | null; amountPaisa: number | null }
interface FinanceSnapshot {
  currentMonthRentPaisa: number;
  outstandingPaisa: number;
  depositPaisa: number;
  invoiceCount: number;
  paymentCount: number;
  lastPayment: { id: string; amountPaisa: number; date: string | null; method: string } | null;
  nextDueDate: string | null;
  status: string;
  firstOpenInvoiceId: string | null;
}
interface KycSummary { status: string; submittedAt: string | null; reviewedAt: string | null; rejectionReason: string | null; docCount: number }
interface RoomActivity { kind: string; label: string; date: string | null }
type HealthLevel = 'green' | 'yellow' | 'red';
interface Health { level: HealthLevel; label: string }
interface OpsAlert { id: string; kind: string; icon: string; label: string; detail: string; cls: string; link: string }
interface ActivityItem { id: string; kind: string; icon: string; label: string; detail: string; date: string | null }

type Status = 'OCCUPIED' | 'AVAILABLE' | 'RESERVED' | 'MAINTENANCE' | 'BLOCKED' | 'VACATING_SOON';

const ROOM_TYPE_LABEL: Record<string, string> = {
  SINGLE: 'Single Occupancy', DOUBLE: 'Standard Twin', TRIPLE: 'Standard Triple',
  QUAD: 'Standard Quad', DORMITORY: 'Dormitory', STUDIO: 'Premium Studio',
};

@Component({
  selector: 'os-inventory-workspace',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, RouterLink, DatePipe, IconComponent, EntityAvatarComponent,
    DrawerShellComponent, ModalComponent, StatusPillComponent, PrivateDocComponent,
    LoadingStateComponent, EmptyStateComponent, InrPipe, ImageUploadComponent,
  ],
  template: `
    <!-- Header + sub-tabs -->
    <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
      <div>
        <h1 class="text-[26px] font-semibold tracking-tight text-content">Inventory Board</h1>
        <nav class="flex items-center gap-5 mt-2 text-sm">
          <a routerLink="/properties" class="text-muted hover:text-content transition">Portfolio</a>
          <span class="text-accent font-semibold border-b-2 border-accent pb-1.5">Workspaces</span>
          <a routerLink="/analytics/occupancy" class="text-muted hover:text-content transition">Reports</a>
        </nav>
      </div>
      <div class="flex items-center gap-2 self-start sm:self-auto">
        <button (click)="autoRefresh.set(!autoRefresh())" role="switch" [attr.aria-checked]="autoRefresh()"
          [attr.aria-label]="'Background auto-refresh ' + (autoRefresh() ? 'on' : 'off')"
          class="h-9 px-3 rounded-lg border text-[13px] font-medium flex items-center gap-1.5 transition"
          [class]="autoRefresh() ? 'border-success/40 text-success bg-success-subtle' : 'border-border text-muted hover:bg-canvas'">
          <span class="w-2 h-2 rounded-full" [class]="autoRefresh() ? 'bg-success animate-pulse' : 'bg-faint'"></span> Live
        </button>
        <button (click)="refresh()" [disabled]="loading()" aria-label="Refresh board"
          class="h-9 px-3 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas flex items-center gap-1.5 disabled:opacity-50">
          <os-icon name="refresh" [size]="15" /> Refresh
        </button>
      </div>
    </div>

    <!-- ── Occupancy analytics strip (Module 8 — drilldown) ──────────── -->
    @if (propertyId) {
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        @for (m of metrics(); track m.label) {
          @if (m.link) {
            <a [routerLink]="m.link" [queryParams]="ctxQuery()" [attr.aria-label]="m.label + ': ' + m.value"
              class="bg-panel border border-border rounded-xl px-4 py-3 hover:border-accent transition focus:outline-none focus:ring-2 focus:ring-accent">
              <p class="text-[10px] font-semibold uppercase tracking-wider text-faint">{{ m.label }}</p>
              <p class="text-lg font-semibold tracking-tight mt-0.5" [class]="m.cls || 'text-content'">{{ m.value }}</p>
              @if (m.hint) { <p class="text-[10px] text-faint">{{ m.hint }}</p> }
            </a>
          } @else {
            <div class="bg-panel border border-border rounded-xl px-4 py-3">
              <p class="text-[10px] font-semibold uppercase tracking-wider text-faint">{{ m.label }}</p>
              <p class="text-lg font-semibold tracking-tight mt-0.5" [class]="m.cls || 'text-content'">{{ m.value }}</p>
              @if (m.hint) { <p class="text-[10px] text-faint">{{ m.hint }}</p> }
            </div>
          }
        }
      </div>
    }

    <div class="flex flex-col xl:flex-row gap-5 items-start">
      <!-- ── Main board ───────────────────────────────────────────────── -->
      <section class="flex-1 min-w-0 w-full bg-panel border border-border rounded-[16px] p-5">
        <!-- Toolbar: property · buildings · search · filters -->
        <div class="flex flex-wrap items-center gap-3 mb-4">
          <select [ngModel]="propertyId" (ngModelChange)="onProperty($event)"
            class="h-9 px-3 rounded-lg border border-border bg-canvas text-sm font-medium text-content outline-none focus:border-accent">
            <option value="" disabled>Select property</option>
            @for (p of properties(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
          </select>

          @if (buildings().length) {
            <div class="flex items-center gap-1 bg-canvas rounded-lg p-1">
              @for (b of buildings(); track b.id) {
                <button (click)="switchBuilding(b.id)"
                  class="h-7 px-3 rounded-md text-[13px] font-semibold transition"
                  [class]="building() === b.id ? 'bg-[var(--primary-container)] text-white' : 'text-muted hover:text-content'">
                  {{ b.name }}
                </button>
              }
            </div>
            @if (activeBuilding(); as ab) {
              <button (click)="openEditBuilding(ab)" title="Edit building"
                class="h-7 w-7 rounded-md border border-border text-muted hover:text-accent hover:border-accent flex items-center justify-center transition">
                <os-icon name="edit" [size]="14" />
              </button>
            }
          }

          <div class="flex-1"></div>

          <!-- Legend -->
          <div class="hidden lg:flex items-center gap-3 text-[12px] text-muted">
            <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-[var(--primary-container)]"></span> Occupied</span>
            <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded border border-border bg-panel"></span> Vacant</span>
            <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-danger-subtle border border-danger/30"></span> Maint.</span>
            <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded bg-warning-subtle border border-warning/30"></span> Rsvd.</span>
          </div>
        </div>

        <!-- Search + filters row -->
        <div class="flex flex-wrap items-center gap-2 mb-4">
          <div class="relative">
            <os-icon name="search" [size]="15" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
            <input [ngModel]="q()" (ngModelChange)="q.set($event)" placeholder="Search room, resident, booking, building…"
              class="h-9 w-[260px] max-w-full pl-8 pr-3 rounded-lg border border-border bg-canvas text-[13px] text-content outline-none focus:border-accent" />
          </div>
          <select [ngModel]="fFloor()" (ngModelChange)="fFloor.set($event)" class="h-9 px-2 rounded-lg border border-border bg-canvas text-[12px] text-content outline-none">
            <option value="">All floors</option>
            @for (f of allFloorNumbers(); track f) { <option [value]="f">Floor {{ pad(f) }}</option> }
          </select>
          <select [ngModel]="fStatus()" (ngModelChange)="fStatus.set($event)" class="h-9 px-2 rounded-lg border border-border bg-canvas text-[12px] text-content outline-none">
            <option value="">Any bed status</option>
            @for (s of allStatuses; track s) { <option [value]="s">{{ label(s) }}</option> }
          </select>
          <select [ngModel]="fType()" (ngModelChange)="fType.set($event)" class="h-9 px-2 rounded-lg border border-border bg-canvas text-[12px] text-content outline-none">
            <option value="">Any room type</option>
            @for (t of roomTypes; track t) { <option [value]="t">{{ roomTypeName(t) }}</option> }
          </select>
          <select [ngModel]="fOcc()" (ngModelChange)="fOcc.set($event)" class="h-9 px-2 rounded-lg border border-border bg-canvas text-[12px] text-content outline-none">
            <option value="">Any occupancy</option>
            <option value="VACANT">Vacant only</option>
            <option value="RESERVED">Reserved only</option>
          </select>
          <select disabled title="Gender is not tracked on rooms — data not available" class="h-9 px-2 rounded-lg border border-border bg-canvas text-[12px] text-faint outline-none opacity-60 cursor-not-allowed">
            <option>Gender — N/A</option>
          </select>
          @if (hasFilters()) {
            <button (click)="clearFilters()" class="h-9 px-2.5 rounded-lg text-[12px] font-medium text-accent hover:bg-canvas">Clear</button>
          }
          <div class="flex-1"></div>
          <button (click)="toggleSelectMode()"
            class="h-9 px-3 rounded-lg border text-[12px] font-semibold transition"
            [class]="selectMode() ? 'border-accent text-accent bg-accent-subtle' : 'border-border text-muted hover:text-content'">
            {{ selectMode() ? 'Done selecting' : 'Select beds' }}
          </button>
        </div>

        <!-- Bulk actions bar -->
        @if (selectMode()) {
          <div class="flex flex-wrap items-center gap-2 mb-4 rounded-xl border border-accent/30 bg-accent-subtle px-3 py-2">
            <span class="text-[12px] font-semibold text-accent">{{ selectedBeds().size }} selected</span>
            <span class="text-[12px] text-muted">Set status:</span>
            @for (s of actions; track s) {
              <button (click)="bulkStatus(s)" [disabled]="!selectedBeds().size || bulkBusy()"
                class="h-7 px-2.5 rounded-md border border-border bg-panel text-[12px] font-medium text-content hover:border-accent disabled:opacity-40">{{ label(s) }}</button>
            }
            <span class="w-px h-5 bg-border mx-1"></span>
            <button (click)="exportCsv()" [disabled]="!selectedBeds().size" class="h-7 px-2.5 rounded-md border border-border bg-panel text-[12px] font-medium text-content hover:border-accent disabled:opacity-40 flex items-center gap-1"><os-icon name="download" [size]="13" /> Export</button>
            <button (click)="printBoard()" class="h-7 px-2.5 rounded-md border border-border bg-panel text-[12px] font-medium text-content hover:border-accent flex items-center gap-1"><os-icon name="print" [size]="13" /> Print</button>
            <button disabled title="Bulk transfer is not supported by the backend (transfers are per-bed)" class="h-7 px-2.5 rounded-md border border-border bg-panel text-[12px] text-faint opacity-60 cursor-not-allowed">Transfer</button>
            <button disabled title="Bed price update is not supported by the backend" class="h-7 px-2.5 rounded-md border border-border bg-panel text-[12px] text-faint opacity-60 cursor-not-allowed">Update pricing</button>
            @if (bulkMsg()) { <span class="text-[12px]" [class.text-success]="!bulkErr()" [class.text-danger]="bulkErr()">{{ bulkMsg() }}</span> }
          </div>
        }

        @if (loading()) {
          <div class="flex items-center justify-center gap-3 py-20 text-muted">
            <span class="w-5 h-5 rounded-full border-2 border-border border-t-accent animate-spin"></span> Loading board…
          </div>
        } @else if (floors().length) {
          @for (fl of floors(); track fl) {
            <div class="mb-7 last:mb-0">
              <div class="flex items-center gap-2 mb-3">
                <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Floor {{ pad(fl) }}{{ floorLabel(fl) }}</p>
                @if (floorEntity(fl); as fe) {
                  <button (click)="openEditFloor(fe)" title="Edit floor"
                    class="w-5 h-5 rounded text-faint hover:text-accent flex items-center justify-center transition">
                    <os-icon name="edit" [size]="13" />
                  </button>
                }
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
                @for (room of roomsOnFloor(fl); track room.id) {
                  @if (roomStats(room); as st) {
                    <div class="border border-border rounded-xl p-4 hover:border-border-strong transition group">
                      <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                          <p class="text-[15px] font-semibold text-content truncate">Unit {{ room.name }}</p>
                          <p class="text-[12px] text-faint">{{ roomTypeLabel(room) }}</p>
                        </div>
                        <div class="flex items-center gap-1 shrink-0">
                          @if (roomRisk(room); as risk) {
                            <span class="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full flex items-center gap-1" [class]="healthPill(risk.level)" [title]="'Risk: ' + risk.label">
                              <span class="w-1.5 h-1.5 rounded-full" [class]="healthDot(risk.level)"></span>{{ risk.label }}
                            </span>
                          }
                          <span class="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" [class]="st.badgeClass">{{ st.badge }}</span>
                          <button (click)="openEditRoom(room)" title="Edit room" aria-label="Edit room"
                            class="w-6 h-6 rounded text-faint hover:text-accent opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center transition">
                            <os-icon name="edit" [size]="14" />
                          </button>
                        </div>
                      </div>

                      <!-- Occupancy bar + stats -->
                      <div class="h-1.5 rounded-full bg-canvas overflow-hidden mt-3">
                        <div class="h-full rounded-full bg-accent transition-all" [style.width.%]="st.pct"></div>
                      </div>
                      <div class="flex items-center justify-between mt-1.5 text-[11px] text-muted">
                        <span>{{ st.occupied }}/{{ st.capacity }} occupied · {{ st.pct }}%</span>
                        <span class="font-semibold text-content">{{ st.revenuePaisa | inr }}/mo</span>
                      </div>
                      <div class="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[11px] text-faint">
                        <span class="text-success">{{ st.available }} free</span>
                        @if (st.reserved) { <span class="text-warning">{{ st.reserved }} rsvd</span> }
                        @if (st.maintenance) { <span class="text-danger">{{ st.maintenance }} maint</span> }
                        @if (st.blocked) { <span>{{ st.blocked }} blocked</span> }
                      </div>
                      @if (roomFinance(room); as rf) {
                        @if (rf.outstandingPaisa > 0 || rf.nextDue) {
                          <div class="flex items-center justify-between mt-1.5 text-[11px]">
                            @if (rf.nextDue) { <span class="text-faint">Next due {{ relDay(rf.nextDue) }}</span> } @else { <span></span> }
                            @if (rf.outstandingPaisa > 0) { <span class="text-danger font-semibold">{{ rf.outstandingPaisa | inr }} due</span> }
                          </div>
                        }
                      }

                      <div class="flex flex-wrap gap-2 mt-3">
                        @for (bed of room.beds; track bed.id; let i = $index) {
                          <button (click)="bedClick(bed, room)"
                            class="relative w-11 h-11 rounded-lg border flex flex-col items-center justify-center transition active:scale-95 focus:outline-none focus:ring-2 focus:ring-accent"
                            [class]="tileClass(bed) + (selectMode() && selectedBeds().has(bed.id) ? ' ring-2 ring-accent' : '')"
                            [title]="status(bed)"
                            [attr.aria-label]="'Unit ' + room.name + ' bed ' + (bed.label ?? bed.bedNumber ?? letter(i)) + ' — ' + label(status(bed)) + (bedHealth(bed) ? ' — ' + bedHealth(bed)!.label : '')"
                            [attr.aria-pressed]="selectMode() ? selectedBeds().has(bed.id) : null">
                            <os-icon name="bed" [size]="16" [fill]="status(bed) === 'OCCUPIED'" />
                            <span class="text-[10px] font-bold leading-none mt-0.5">{{ bed.label ?? bed.bedNumber ?? letter(i) }}</span>
                            @if (status(bed) === 'RESERVED' || status(bed) === 'MAINTENANCE' || status(bed) === 'VACATING_SOON') {
                              <span class="absolute -top-1 -right-1 w-2 h-2 rounded-full" [class]="dotClass(bed)"></span>
                            } @else if (bedHealth(bed); as h) {
                              @if (h.level !== 'green') { <span class="absolute -top-1 -right-1 w-2 h-2 rounded-full" [class]="healthDot(h.level)" [attr.aria-hidden]="true"></span> }
                            }
                          </button>
                        }
                      </div>

                      <!-- Expandable bed detail list -->
                      <button (click)="toggleExpand(room.id)" class="mt-3 text-[11px] font-semibold text-accent flex items-center gap-0.5">
                        <os-icon [name]="expanded().has(room.id) ? 'expand_less' : 'expand_more'" [size]="14" />
                        {{ expanded().has(room.id) ? 'Hide beds' : 'Bed details' }}
                      </button>
                      @if (expanded().has(room.id)) {
                        <div class="mt-2 rounded-lg border border-border-subtle divide-y divide-border-subtle">
                          @for (bed of room.beds; track bed.id; let i = $index) {
                            <button (click)="open(bed, room)" class="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-canvas transition">
                              <span class="text-[12px] font-semibold text-content w-12 shrink-0">Bed {{ bed.label ?? bed.bedNumber ?? letter(i) }}</span>
                              <os-status-pill [status]="status(bed)" [dot]="false" />
                              <span class="text-[12px] text-muted truncate flex-1 text-right">
                                @if (bedResident(bed.id); as name) { {{ name }} } @else if (status(bed) === 'AVAILABLE') { {{ (bed.pricePaisa ?? 0) | inr }}/mo }
                              </span>
                            </button>
                          }
                        </div>
                        <!-- Room activity feed (existing events only) -->
                        <p class="text-[10px] font-semibold uppercase tracking-wider text-faint mt-3 mb-1.5">Recent activity</p>
                        @if (roomActivity(room); as acts) {
                          @if (acts.length) {
                            <ul class="space-y-1.5">
                              @for (a of acts; track $index) {
                                <li class="flex items-center gap-2 text-[12px]">
                                  <os-icon [name]="a.kind === 'VISITOR' ? 'badge' : a.kind === 'CHECK_OUT' ? 'logout' : 'login'" [size]="13" class="text-faint shrink-0" />
                                  <span class="text-content truncate flex-1">{{ a.label }}</span>
                                  <span class="text-faint shrink-0">{{ relDay(a.date) }}</span>
                                </li>
                              }
                            </ul>
                          } @else { <p class="text-[12px] text-faint">No recent activity.</p> }
                        }
                      }
                    </div>
                  }
                }
              </div>
            </div>
          }
        } @else if (board().rooms.length) {
          <os-empty-state icon="search_off" title="No rooms match" message="No rooms match the current search and filters.">
            <button (click)="clearFilters()" class="h-9 px-4 rounded-lg bg-accent text-white text-[13px] font-semibold">Clear filters</button>
          </os-empty-state>
        } @else {
          <div class="flex flex-col items-center justify-center text-center py-20">
            <span class="w-12 h-12 rounded-xl bg-canvas flex items-center justify-center text-faint mb-3"><os-icon name="bed" [size]="24" /></span>
            <p class="text-sm font-medium text-content">No inventory to display</p>
            <p class="text-xs text-muted mt-1">{{ propertyId ? 'This building has no rooms configured.' : 'Select a property to view its bed map.' }}</p>
          </div>
        }
      </section>

      <!-- ── Right rail ───────────────────────────────────────────────── -->
      <aside class="w-full xl:w-[320px] shrink-0 space-y-5">
        <!-- Smart alerts (Module 7) -->
        @if (alerts().length) {
          <div class="bg-panel border border-border rounded-[16px] p-5">
            <p class="text-[11px] font-semibold uppercase tracking-wider text-faint mb-3">Alerts</p>
            <ul class="space-y-2">
              @for (a of alerts(); track a.id) {
                <li>
                  <a [routerLink]="a.link" [queryParams]="ctxQuery()" class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:opacity-90 transition" [class]="a.cls">
                    <os-icon [name]="a.icon" [size]="16" class="shrink-0" />
                    <div class="min-w-0 flex-1"><p class="text-[13px] font-semibold truncate">{{ a.label }}</p><p class="text-[11px] opacity-80 truncate">{{ a.detail }}</p></div>
                    <os-icon name="chevron_right" [size]="15" class="shrink-0 opacity-70" />
                  </a>
                </li>
              }
            </ul>
          </div>
        }

        <!-- Activity center (Module 3) -->
        <div class="bg-panel border border-border rounded-[16px] p-5">
          <div class="flex items-center justify-between mb-3">
            <p class="text-[11px] font-semibold uppercase tracking-wider text-faint">Activity</p>
            @if (lastRefresh(); as lr) { <span class="text-[10px] text-faint">{{ lr | date:'HH:mm' }}</span> }
          </div>
          @if (activityStream().length) {
            <ul class="space-y-3 max-h-[320px] overflow-y-auto os-scroll">
              @for (a of activityStream(); track a.id) {
                <li class="flex items-start gap-2.5">
                  <span class="w-7 h-7 rounded-full bg-canvas border border-border flex items-center justify-center shrink-0"><os-icon [name]="a.icon" [size]="14" class="text-muted" /></span>
                  <div class="min-w-0 flex-1">
                    <p class="text-[13px] font-medium text-content truncate">{{ a.label }}</p>
                    <p class="text-[11px] text-muted truncate">{{ a.detail }}</p>
                  </div>
                  <span class="text-[10px] text-faint shrink-0 mt-0.5">{{ relDay(a.date) }}</span>
                </li>
              }
            </ul>
          } @else { <p class="text-xs text-muted text-center py-6">No recent activity.</p> }
        </div>

        <div class="bg-panel border border-border rounded-[16px] p-5">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-faint mb-2">Occupancy Health</p>
          <div class="flex items-end gap-2">
            <span class="text-[40px] leading-none font-semibold tracking-tight text-content">{{ occRate() }}%</span>
          </div>
          <div class="h-2 rounded-full bg-canvas overflow-hidden mt-4">
            <div class="h-full rounded-full bg-accent transition-all" [style.width.%]="occRate()"></div>
          </div>
          <p class="text-[11px] uppercase tracking-wider text-faint mt-2.5">
            {{ occupied() }} Occupied / {{ total() }} Beds
          </p>
        </div>

        <div class="rounded-[16px] p-5" style="background: linear-gradient(160deg,#1e293b,#0b1220);">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-accent mb-2">Revenue Leakage</p>
          <p class="text-[30px] font-semibold tracking-tight text-white">{{ leakagePaise() | inr: 'full' }}</p>
          <p class="text-[13px] text-white/55 mt-1.5 mb-4">Projected monthly loss from vacant inventory.</p>
          <a routerLink="/analytics/revenue" class="block w-full h-10 rounded-lg bg-white text-[#1e293b] text-[13px] font-bold uppercase tracking-wide hover:bg-white/90 transition text-center leading-10">
            Optimize Yield
          </a>
        </div>

        <!-- Visitor summary (property-wide) -->
        <div class="bg-panel border border-border rounded-[16px] p-5">
          <div class="flex items-center justify-between mb-3">
            <p class="text-[11px] font-semibold uppercase tracking-wider text-faint">Visitors</p>
            <a routerLink="/operations/visitors" class="text-[11px] font-bold uppercase tracking-wide text-accent hover:underline">Manage →</a>
          </div>
          @if (visitorSummary(); as vs) {
            <div class="grid grid-cols-3 gap-2 text-center">
              <div class="rounded-lg bg-canvas py-2"><p class="text-lg font-semibold text-content">{{ vs.today }}</p><p class="text-[10px] text-faint uppercase">Today</p></div>
              <div class="rounded-lg bg-canvas py-2"><p class="text-lg font-semibold text-warning">{{ vs.upcoming }}</p><p class="text-[10px] text-faint uppercase">Upcoming</p></div>
              <div class="rounded-lg bg-canvas py-2"><p class="text-lg font-semibold text-success">{{ vs.active }}</p><p class="text-[10px] text-faint uppercase">Active</p></div>
            </div>
            @if (vs.recent.length) {
              <ul class="mt-3 space-y-2">
                @for (v of vs.recent; track v.id) {
                  <li class="flex items-center gap-2 text-[12px]">
                    <os-icon name="badge" [size]="13" class="text-faint shrink-0" />
                    <span class="text-content truncate flex-1">{{ v.name }}</span>
                    <span class="text-faint shrink-0">{{ relDay(v.checked_in_at) }}</span>
                  </li>
                }
              </ul>
            } @else { <p class="text-[12px] text-faint text-center mt-3">No recent entries.</p> }
          }
        </div>

        <div class="bg-panel border border-border rounded-[16px] p-5">
          <div class="flex items-center justify-between mb-4">
            <p class="text-[11px] font-semibold uppercase tracking-wider text-faint">Upcoming Activity</p>
            <span class="text-[10px] font-bold uppercase tracking-wide text-success bg-success-subtle px-2 py-0.5 rounded-full">Real-time</span>
          </div>
          @if (activity().length) {
            <ul class="space-y-3.5">
              @for (a of activity(); track a.id) {
                <li class="flex items-center gap-3">
                  <os-avatar [name]="a.name" [size]="32" />
                  <div class="min-w-0 flex-1">
                    <p class="text-[13px] font-semibold text-content truncate">{{ a.name }}</p>
                    <p class="text-[11px] text-muted flex items-center gap-1 truncate"><os-icon name="grid_view" [size]="12" /> {{ a.unit }}</p>
                  </div>
                  <span class="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0" [class]="a.tagClass">{{ a.tag }}</span>
                </li>
              }
            </ul>
            <a routerLink="/bookings" class="block text-center text-[12px] font-bold uppercase tracking-wide text-accent hover:underline mt-5">View all schedule →</a>
          } @else {
            <p class="text-xs text-muted text-center py-6">No upcoming arrivals.</p>
          }
        </div>
      </aside>
    </div>

    <!-- ── Bed drawer ───────────────────────────────────────────────── -->
    <os-drawer [open]="!!selected()" [title]="'Bed ' + (selected()?.label ?? selected()?.bedNumber ?? '')"
      [subtitle]="selectedRoom() ? 'Unit ' + selectedRoom()!.name : ''" width="min(420px, 94vw)" (closed)="selected.set(null)">
      @if (selected(); as b) {
        <div class="space-y-5">
          <div class="flex items-center justify-between">
            <span class="text-sm text-muted">Current status</span><os-status-pill [status]="status(b)" />
          </div>

          @if (selectedRoom(); as room) {
            <div class="rounded-xl border border-border divide-y divide-border-subtle">
              <div class="flex justify-between px-4 py-2"><span class="text-[13px] text-muted">Unit · Floor</span><span class="text-[13px] font-medium text-content">{{ room.name }} · Floor {{ room.floor }}</span></div>
              <div class="grid grid-cols-4 text-center">
                <div class="py-2"><p class="text-base font-semibold text-content">{{ room.beds.length }}</p><p class="text-[10px] text-faint uppercase">Capacity</p></div>
                <div class="py-2"><p class="text-base font-semibold text-[var(--primary-container)]">{{ roomCount(room,'OCCUPIED') }}</p><p class="text-[10px] text-faint uppercase">Occupied</p></div>
                <div class="py-2"><p class="text-base font-semibold text-success">{{ roomCount(room,'AVAILABLE') }}</p><p class="text-[10px] text-faint uppercase">Available</p></div>
                <div class="py-2"><p class="text-base font-semibold text-warning">{{ roomCount(room,'RESERVED') }}</p><p class="text-[10px] text-faint uppercase">Reserved</p></div>
              </div>
            </div>
          }

          @if (b.pricePaisa) {
            <div class="rounded-xl border border-border p-3"><p class="text-[11px] text-faint mb-0.5">Monthly rent</p><p class="text-sm font-semibold text-content">{{ b.pricePaisa | inr }}</p></div>
          }

          <!-- OCCUPIED → resident card (fully clickable) -->
          @if (status(b) === 'OCCUPIED') {
            @if (loadingOccupant()) {
              <div class="rounded-xl border border-border p-4"><os-loading variant="skeleton" [rows]="['60%','90%','75%']" /></div>
            } @else if (occupant(); as o) {
              <div (click)="openResident(o.tenantId)" role="button" tabindex="0" (keydown.enter)="openResident(o.tenantId)"
                class="rounded-xl border border-border p-4 space-y-3 cursor-pointer hover:border-accent/50 transition">
                <div class="flex items-center gap-3">
                  <os-avatar [name]="o.name" [size]="44" [src]="o.avatarUrl" />
                  <div class="min-w-0 flex-1"><p class="text-sm font-semibold text-content truncate">{{ o.name }}</p><p class="text-[12px] text-muted">{{ o.phone || '—' }}</p></div>
                  <os-icon name="chevron_right" [size]="18" class="text-faint" />
                </div>
                <div class="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
                  <div class="flex justify-between"><span class="text-faint">Booking</span><span class="text-content font-medium">{{ o.bookingNumber }}</span></div>
                  <div class="flex justify-between"><span class="text-faint">Status</span><os-status-pill [status]="o.bookingStatus" [dot]="false" /></div>
                  <div class="flex justify-between"><span class="text-faint">Move-in</span><span class="text-content">{{ o.moveIn ? (o.moveIn | date:'dd MMM yy') : '—' }}</span></div>
                  <div class="flex justify-between"><span class="text-faint">Lease end</span><span class="text-content">{{ o.leaseEnd ? (o.leaseEnd | date:'dd MMM yy') : 'Ongoing' }}</span></div>
                  <div class="flex justify-between"><span class="text-faint">Rent</span><os-status-pill [status]="o.rentStatus" [dot]="false" /></div>
                  <div class="flex justify-between"><span class="text-faint">KYC</span><os-status-pill [status]="o.kycStatus" [dot]="false" /></div>
                  <div class="flex justify-between col-span-2"><span class="text-faint">Outstanding</span><span class="font-semibold" [class.text-danger]="o.outstandingPaisa > 0" [class.text-content]="o.outstandingPaisa <= 0">{{ o.outstandingPaisa | inr }}</span></div>
                </div>
                <div class="grid grid-cols-3 gap-1.5 pt-1">
                  <a [href]="'tel:' + o.phone" (click)="$event.stopPropagation()" class="h-8 rounded-lg border border-border text-[12px] font-medium text-content hover:bg-canvas flex items-center justify-center gap-1"><os-icon name="call" [size]="14" /> Call</a>
                  <a [href]="waLink(o.phone)" target="_blank" rel="noopener" (click)="$event.stopPropagation()" class="h-8 rounded-lg border border-border text-[12px] font-medium text-content hover:bg-canvas flex items-center justify-center gap-1"><os-icon name="chat" [size]="14" /> WhatsApp</a>
                  <button (click)="openResident(o.tenantId, 'Documents'); $event.stopPropagation()" class="h-8 rounded-lg border border-border text-[12px] font-medium text-content hover:bg-canvas flex items-center justify-center gap-1"><os-icon name="folder" [size]="14" /> Docs</button>
                </div>
                <div class="grid grid-cols-3 gap-1.5">
                  <button (click)="openResident(o.tenantId); $event.stopPropagation()" class="h-8 rounded-lg bg-accent text-white text-[12px] font-semibold flex items-center justify-center gap-1"><os-icon name="person" [size]="14" /> Resident</button>
                  <a routerLink="/bookings" (click)="$event.stopPropagation()" class="h-8 rounded-lg border border-border text-[12px] font-medium text-content hover:bg-canvas flex items-center justify-center gap-1"><os-icon name="event" [size]="14" /> Booking</a>
                  <button (click)="openResident(o.tenantId, 'Payments'); $event.stopPropagation()" class="h-8 rounded-lg border border-border text-[12px] font-medium text-content hover:bg-canvas flex items-center justify-center gap-1"><os-icon name="payments" [size]="14" /> Payments</button>
                </div>
              </div>
            } @else {
              <div class="rounded-xl border border-border p-3 flex items-center justify-between">
                <p class="text-[13px] text-muted">Occupied — resident could not be resolved.</p>
                <button (click)="resolveContext()" class="text-[12px] text-accent font-medium">Retry</button>
              </div>
            }
          }

          @if (status(b) === 'RESERVED') {
            <div class="rounded-xl border border-warning/30 bg-warning-subtle p-3">
              <p class="text-[12px] font-semibold text-warning mb-1">Reserved</p>
              @if (reservation(); as r) {
                <div class="space-y-0.5 text-[12px]">
                  <div class="flex justify-between"><span class="text-faint">Reserved by</span><span class="text-content font-medium">{{ r.tenantName }}</span></div>
                  <div class="flex justify-between"><span class="text-faint">Expires</span><span class="text-content">{{ r.reservedUntil ? (r.reservedUntil | date:'dd MMM yy') : '—' }}</span></div>
                  <div class="flex justify-between"><span class="text-faint">Status</span><span class="text-content">{{ r.status }}</span></div>
                </div>
              } @else { <p class="text-[12px] text-muted">No reservation detail available.</p> }
            </div>
          }

          @if (status(b) === 'AVAILABLE') {
            <div class="rounded-xl border border-border p-3 flex items-center gap-2 text-[13px] text-muted"><os-icon name="bed" [size]="16" class="text-success" /> Vacant · available to reserve · no resident.</div>
          }
          <div>
            <p class="text-[11px] uppercase tracking-wider text-faint mb-2">Set availability</p>
            <div class="grid grid-cols-3 gap-2">
              @for (s of actions; track s) {
                <button (click)="changeStatus(b, s)" [disabled]="status(b) === 'OCCUPIED' && s !== 'AVAILABLE'"
                  class="h-9 rounded-lg border border-border text-[13px] font-medium text-content hover:border-accent hover:text-accent transition disabled:opacity-40 disabled:cursor-not-allowed">{{ label(s) }}</button>
              }
            </div>
            <p class="text-[11px] text-faint mt-2 flex items-start gap-1"><os-icon name="info" [size]="13" /> Occupied / Reserved / Vacating are set automatically by bookings, reservations &amp; notices.</p>
          </div>

          @if (status(b) === 'OCCUPIED') {
            <div class="border-t border-border pt-4">
              <p class="text-[11px] uppercase tracking-wider text-faint mb-2">Transfer tenant</p>
              <select [(ngModel)]="transferTarget" class="fld mb-2">
                <option value="">Select target bed…</option>
                @for (t of transferTargets(); track t.id) {
                  <option [value]="t.id">{{ t.unit }} · Bed {{ t.label }} — {{ t.pricePaisa | inr }}/mo</option>
                }
              </select>
              <button (click)="transfer(b)" [disabled]="!transferTarget || acting()"
                class="w-full h-9 rounded-lg bg-accent text-white text-[13px] font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5">
                <os-icon name="swap_horiz" [size]="16" /> Move tenant to selected bed
              </button>
              @if (!transferTargets().length) { <p class="text-[11px] text-faint mt-1">No available beds to transfer into.</p> }
            </div>
          }
          @if (msg()) { <p class="text-xs flex items-center gap-1" [class.text-success]="!err()" [class.text-danger]="err()"><os-icon [name]="err() ? 'error' : 'check'" [size]="14" /> {{ msg() }}</p> }
        </div>
      }
    </os-drawer>

    <!-- ── Resident drawer ──────────────────────────────────────────── -->
    <os-drawer [open]="residentOpen()" [title]="resident() ? residentName() : 'Resident'" subtitle="Resident detail" width="min(480px, 96vw)" (closed)="closeResident()">
      @if (loadingResident()) {
        <os-loading variant="skeleton" />
      } @else if (!resident() && lastResidentId()) {
        <div class="flex flex-col items-center justify-center text-center py-16">
          <span class="w-12 h-12 rounded-xl bg-danger-subtle flex items-center justify-center text-danger mb-3"><os-icon name="error" [size]="24" /></span>
          <p class="text-sm font-medium text-content">Couldn't load this resident</p>
          <p class="text-xs text-muted mt-1 mb-4">The request failed. Your place is preserved — try again.</p>
          <button (click)="retryResident()" class="h-9 px-4 rounded-lg bg-accent text-white text-[13px] font-semibold flex items-center gap-1.5"><os-icon name="refresh" [size]="15" /> Retry</button>
        </div>
      } @else if (resident(); as u) {
        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <os-avatar [name]="residentName()" [size]="56" [src]="u.avatarUrl ?? null" />
            <div class="min-w-0 flex-1"><p class="text-base font-semibold text-content truncate">{{ residentName() }}</p><p class="text-sm text-muted">{{ u.phone ?? '—' }}</p></div>
            @if (residentHealth(); as h) {
              <span class="text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full flex items-center gap-1.5 shrink-0" [class]="healthPill(h.level)">
                <span class="w-2 h-2 rounded-full" [class]="healthDot(h.level)"></span>{{ h.label }}
              </span>
            }
          </div>
          <div class="flex gap-2">
            <a [href]="'tel:' + u.phone" class="flex-1 h-9 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas flex items-center justify-center gap-1.5"><os-icon name="call" [size]="15" /> Call</a>
            <a [href]="waLink(u.phone ?? '')" target="_blank" rel="noopener" class="flex-1 h-9 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas flex items-center justify-center gap-1.5"><os-icon name="chat" [size]="15" /> WhatsApp</a>
          </div>

          <div class="flex gap-1 border-b border-border overflow-x-auto os-scroll">
            @for (t of residentTabs; track t) {
              <button (click)="residentTab.set(t)" class="px-3 py-2 text-[13px] font-medium border-b-2 -mb-px whitespace-nowrap" [class]="residentTab() === t ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-content'">{{ t }}</button>
            }
          </div>

          @switch (residentTab()) {
            @case ('Profile') {
              <div class="rounded-xl border border-border divide-y divide-border-subtle">
                <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">Status</span>@if (u.status) { <os-status-pill [status]="u.status" /> } @else { <span class="text-sm text-faint">—</span> }</div>
                <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">City</span><span class="text-sm text-content">{{ u.profile?.city ?? '—' }}</span></div>
                <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">Occupation</span><span class="text-sm text-content">{{ u.profile?.occupation ?? '—' }}</span></div>
              </div>
              <!-- KYC summary (Module 6) -->
              <p class="text-[11px] font-semibold uppercase tracking-wider text-faint mt-4 mb-2">KYC</p>
              @if (residentKyc(); as k) {
                <div class="rounded-xl border border-border divide-y divide-border-subtle">
                  <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">Status</span><os-status-pill [status]="k.status" /></div>
                  <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">Submitted</span><span class="text-sm text-content">{{ k.submittedAt ? (k.submittedAt | date:'dd MMM yy') : '—' }}</span></div>
                  <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">Reviewed</span><span class="text-sm text-content">{{ k.reviewedAt ? (k.reviewedAt | date:'dd MMM yy') : 'Pending' }}</span></div>
                  <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">Documents</span><span class="text-sm text-content">{{ k.docCount }}</span></div>
                  @if (k.rejectionReason) { <div class="px-4 py-2"><span class="text-[12px] text-danger">Reason: {{ k.rejectionReason }}</span></div> }
                </div>
                <button (click)="residentTab.set('Documents')" class="mt-2 text-[12px] font-semibold text-accent">Open documents →</button>
              } @else { <os-loading variant="skeleton" [rows]="['60%','80%']" /> }
            }
            @case ('Booking') {
              @if (occupant(); as o) {
                <div class="rounded-xl border border-border divide-y divide-border-subtle">
                  <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">Booking #</span><span class="text-sm font-medium text-content">{{ o.bookingNumber }}</span></div>
                  <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">Status</span><os-status-pill [status]="o.bookingStatus" /></div>
                  <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">Move-in</span><span class="text-sm text-content">{{ o.moveIn ? (o.moveIn | date:'dd MMM yyyy') : '—' }}</span></div>
                  <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">Lease end</span><span class="text-sm text-content">{{ o.leaseEnd ? (o.leaseEnd | date:'dd MMM yyyy') : 'Ongoing' }}</span></div>
                  <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">Bed</span><span class="text-sm text-content">{{ selectedRoom() ? 'Unit ' + selectedRoom()!.name : '—' }} · {{ selected()?.label ?? selected()?.bedNumber ?? '' }}</span></div>
                </div>
                <!-- Booking timeline (Module 2) -->
                <p class="text-[11px] font-semibold uppercase tracking-wider text-faint mt-4 mb-2">Booking lifecycle</p>
                @if (bookingTimeline().length) {
                  <ol class="space-y-2.5">
                    @for (e of bookingTimeline(); track $index) {
                      <li class="flex items-start gap-2.5">
                        <span class="w-6 h-6 rounded-full bg-canvas border border-border flex items-center justify-center shrink-0 mt-0.5"><os-icon [name]="timelineIcon(e.kind)" [size]="13" class="text-muted" /></span>
                        <div class="min-w-0 flex-1"><p class="text-[13px] text-content">{{ e.label }}</p><p class="text-[11px] text-faint">{{ e.date ? (e.date | date:'dd MMM yyyy') : '—' }}</p></div>
                      </li>
                    }
                  </ol>
                } @else { <p class="text-[13px] text-faint">No booking events recorded.</p> }
                <a routerLink="/bookings" [queryParams]="ctxQuery()" class="mt-3 inline-flex text-[12px] font-semibold text-accent">Open in Bookings →</a>
              } @else { <p class="text-sm text-muted py-4 text-center">No active booking context for this resident.</p> }
            }
            @case ('Finance') {
              @if (residentFinance(); as f) {
                <div class="grid grid-cols-2 gap-2">
                  <div class="rounded-xl border border-border p-3"><p class="text-[11px] text-faint">Current month rent</p><p class="text-sm font-semibold text-content">{{ f.currentMonthRentPaisa | inr }}</p></div>
                  <div class="rounded-xl border border-border p-3"><p class="text-[11px] text-faint">Outstanding</p><p class="text-sm font-semibold" [class.text-danger]="f.outstandingPaisa > 0" [class.text-content]="f.outstandingPaisa <= 0">{{ f.outstandingPaisa | inr }}</p></div>
                  <div class="rounded-xl border border-border p-3"><p class="text-[11px] text-faint">Deposit</p><p class="text-sm font-semibold text-content">{{ f.depositPaisa | inr }}</p></div>
                  <div class="rounded-xl border border-border p-3"><p class="text-[11px] text-faint">Payment status</p><os-status-pill [status]="f.status" [dot]="false" /></div>
                  <div class="rounded-xl border border-border p-3"><p class="text-[11px] text-faint">Invoices</p><p class="text-sm font-semibold text-content">{{ f.invoiceCount }}</p></div>
                  <div class="rounded-xl border border-border p-3"><p class="text-[11px] text-faint">Payments</p><p class="text-sm font-semibold text-content">{{ f.paymentCount }}</p></div>
                  <div class="rounded-xl border border-border p-3"><p class="text-[11px] text-faint">Last payment</p><p class="text-sm font-semibold text-content">{{ f.lastPayment ? (f.lastPayment.amountPaisa | inr) : '—' }}</p>@if (f.lastPayment?.date) { <p class="text-[10px] text-faint">{{ f.lastPayment!.date | date:'dd MMM yy' }} · {{ f.lastPayment!.method }}</p> }</div>
                  <div class="rounded-xl border border-border p-3"><p class="text-[11px] text-faint">Next due date</p><p class="text-sm font-semibold text-content">{{ f.nextDueDate ? (f.nextDueDate | date:'dd MMM yy') : '—' }}</p></div>
                </div>
                <div class="flex flex-wrap gap-2 mt-3">
                  @if (f.firstOpenInvoiceId; as iid) {
                    <a routerLink="/finance/invoices" [queryParams]="ctxQuery()" class="h-8 px-3 rounded-lg border border-border text-[12px] font-medium text-content hover:bg-canvas flex items-center gap-1"><os-icon name="receipt_long" [size]="14" /> Open invoice</a>
                    <a [href]="invoicePdfUrl(iid)" target="_blank" rel="noopener" class="h-8 px-3 rounded-lg border border-border text-[12px] font-medium text-content hover:bg-canvas flex items-center gap-1"><os-icon name="download" [size]="14" /> Download</a>
                  }
                  @if (f.lastPayment; as lp) {
                    <a routerLink="/finance/payments" [queryParams]="ctxQuery()" class="h-8 px-3 rounded-lg border border-border text-[12px] font-medium text-content hover:bg-canvas flex items-center gap-1"><os-icon name="payments" [size]="14" /> Open payment</a>
                  }
                </div>
                <!-- Invoice rows -->
                @if (residentInvoiceRows().length) {
                  <p class="text-[11px] font-semibold uppercase tracking-wider text-faint mt-4 mb-2">Invoices</p>
                  <div class="rounded-xl border border-border divide-y divide-border-subtle">
                    @for (i of residentInvoiceRows(); track i.id) {
                      <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">{{ i.invoiceNumber }} · {{ i.status }}</span><span class="text-sm text-content">{{ num(i.balancePaisa) | inr }}</span></div>
                    }
                  </div>
                }
              } @else { <os-loading variant="skeleton" [rows]="['70%','90%','60%']" /> }
            }
            @case ('Visitors') {
              @if (residentVisitors().length) {
                <div class="rounded-xl border border-border divide-y divide-border-subtle">
                  @for (v of residentVisitors(); track v.id) {
                    <div class="flex items-center gap-2 px-4 py-2">
                      <os-icon name="badge" [size]="15" class="text-faint shrink-0" />
                      <div class="min-w-0 flex-1"><p class="text-[13px] text-content truncate">{{ v.name }}</p><p class="text-[11px] text-faint">{{ v.purpose || 'Visit' }} · {{ relDay(v.checked_in_at ?? v.expected_at) }}</p></div>
                      <os-status-pill [status]="v.status" [dot]="false" />
                    </div>
                  }
                </div>
              } @else { <p class="text-sm text-muted py-4 text-center">No visitors for this resident.</p> }
              <a routerLink="/operations/visitors" class="mt-3 inline-flex text-[12px] font-semibold text-accent">Open visitor management →</a>
            }
            @case ('Documents') {
              @if (residentDocs().length) {
                <div class="grid grid-cols-2 gap-3">
                  @for (d of residentDocs(); track d.id) { <os-private-doc [docKey]="d.s3Key" [label]="d.docType" /> }
                </div>
              } @else { <p class="text-sm text-muted py-4 text-center">No KYC documents on file.</p> }
              <!-- Maintenance (Module 7) — no backend endpoint exists -->
              <p class="text-[11px] font-semibold uppercase tracking-wider text-faint mt-4 mb-2">Maintenance</p>
              <div class="rounded-xl border border-border-subtle bg-warm p-3 flex items-center gap-2 text-[13px] text-muted"><os-icon name="build" [size]="15" class="text-faint" /> Feature not available.</div>
            }
            @case ('Timeline') {
              @if (residentTimeline().length) {
                <ol class="space-y-2.5">
                  @for (e of residentTimeline(); track $index) {
                    <li class="flex items-start gap-2.5">
                      <span class="w-6 h-6 rounded-full bg-canvas border border-border flex items-center justify-center shrink-0 mt-0.5"><os-icon [name]="timelineIcon(e.kind)" [size]="13" class="text-muted" /></span>
                      <div class="min-w-0 flex-1">
                        <p class="text-[13px] text-content">{{ e.label }}</p>
                        <p class="text-[11px] text-faint">{{ relDay(e.date) }}</p>
                      </div>
                      @if (e.amountPaisa !== null) { <span class="text-[13px] font-semibold text-content shrink-0">{{ e.amountPaisa | inr }}</span> }
                    </li>
                  }
                </ol>
              } @else { <p class="text-sm text-muted py-4 text-center">No activity yet.</p> }
            }
            @case ('Actions') {
              <div class="grid grid-cols-2 gap-2">
                <button (click)="askCheckOut()" [disabled]="!occupant()?.bookingId || acting()"
                  class="h-10 rounded-lg border border-danger/40 text-danger text-[13px] font-medium hover:bg-danger-subtle disabled:opacity-40 flex items-center justify-center gap-1.5"><os-icon name="logout" [size]="15" /> Check Out</button>
                <button (click)="jumpToTransfer()" class="h-10 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas flex items-center justify-center gap-1.5"><os-icon name="swap_horiz" [size]="15" /> Transfer Bed</button>
                <button (click)="sendReminder()" [disabled]="!firstDueInvoiceId() || acting()"
                  class="h-10 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas disabled:opacity-40 flex items-center justify-center gap-1.5"><os-icon name="notifications" [size]="15" /> Send Reminder</button>
                <a routerLink="/finance/invoices" [queryParams]="ctxQuery()" class="h-10 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas flex items-center justify-center gap-1.5"><os-icon name="receipt_long" [size]="15" /> Generate Invoice</a>
                <a routerLink="/finance/payments" [queryParams]="ctxQuery()" class="h-10 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas flex items-center justify-center gap-1.5"><os-icon name="payments" [size]="15" /> Record Payment</a>
                <a routerLink="/bookings" [queryParams]="ctxQuery()" class="h-10 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas flex items-center justify-center gap-1.5"><os-icon name="event" [size]="15" /> Open Booking</a>
                <a routerLink="/residents/crm" [queryParams]="{ id: u.id }" class="h-10 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas flex items-center justify-center gap-1.5"><os-icon name="contacts" [size]="15" /> Open CRM</a>
                <button (click)="residentTab.set('Documents')" class="h-10 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas flex items-center justify-center gap-1.5"><os-icon name="folder" [size]="15" /> Open Documents</button>
                <a routerLink="/operations/visitors" class="h-10 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas flex items-center justify-center gap-1.5"><os-icon name="badge" [size]="15" /> Visitor Passes</a>
              </div>
              @if (!firstDueInvoiceId()) { <p class="text-[11px] text-faint mt-2">Send Reminder needs an unpaid invoice — none found.</p> }
              @if (actionMsg()) { <p class="text-xs mt-2 flex items-center gap-1" [class.text-success]="!actionErr()" [class.text-danger]="actionErr()"><os-icon [name]="actionErr() ? 'error' : 'check'" [size]="14" /> {{ actionMsg() }}</p> }
            }
          }
        </div>
      }
    </os-drawer>

    <!-- ── Edit Building drawer ─────────────────────────────────────── -->
    <os-drawer [open]="!!editBuilding()" title="Edit Building" [subtitle]="editBuilding()?.name ?? ''" width="min(420px, 94vw)" (closed)="requestCloseManage()">
      @if (editBuilding(); as b) {
        <div class="space-y-4">
          <div>
            <label class="text-[12px] font-medium text-muted block mb-1">Building name *</label>
            <input class="fld" [(ngModel)]="bForm.name" placeholder="e.g. Tower A" maxlength="120" />
          </div>
          <div>
            <label class="text-[12px] font-medium text-muted block mb-1">Description</label>
            <textarea class="fld !h-auto py-2" rows="3" [(ngModel)]="bForm.description" placeholder="Optional"></textarea>
          </div>
          <div>
            <label class="text-[12px] font-medium text-muted block mb-1">Display order</label>
            <input class="fld" type="number" min="0" [(ngModel)]="bForm.sortOrder" placeholder="0" />
            <p class="text-[11px] text-faint mt-1">Lower numbers appear first.</p>
          </div>
          <div>
            <label class="text-[12px] font-medium text-muted block mb-1">Photos</label>
            <os-image-upload scope="building" entityType="building" [entityId]="b.id" role="gallery" [existing]="buildingMedia()" />
          </div>
          <button (click)="saveBuilding(b)" [disabled]="!bForm.name.trim() || saving()"
            class="w-full h-10 rounded-lg bg-accent text-white text-[13px] font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5">
            @if (saving()) { <span class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span> } @else { <os-icon name="check" [size]="16" /> }
            Save changes
          </button>

          @if (canDelete()) {
            <div class="border-t border-border pt-4">
              <p class="text-[11px] uppercase tracking-wider text-danger mb-2">Danger zone</p>
              @if (buildingBlockers(b); as blockers) {
                @if (blockers.length) {
                  <div class="rounded-lg border border-danger/30 bg-danger-subtle p-3">
                    <p class="text-[13px] font-medium text-danger mb-1">Building cannot be deleted.</p>
                    <ul class="text-[12px] text-content space-y-0.5">
                      @for (r of blockers; track r) { <li>· {{ r }}</li> }
                    </ul>
                    <p class="text-[11px] text-faint mt-2">Vacate or free these beds first.</p>
                  </div>
                } @else if (!confirmDelete()) {
                  <button (click)="confirmDelete.set(true)" class="w-full h-9 rounded-lg border border-danger/40 text-danger text-[13px] font-medium hover:bg-danger-subtle transition">Delete building…</button>
                  <p class="text-[11px] text-faint mt-2">Removes the building and hides its floors, rooms and beds from the board.</p>
                } @else {
                  <p class="text-[13px] text-content mb-2">Delete <span class="font-semibold">{{ b.name }}</span>? This cannot be undone from here.</p>
                  <div class="grid grid-cols-2 gap-2">
                    <button (click)="confirmDelete.set(false)" class="h-9 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas">Cancel</button>
                    <button (click)="removeBuilding(b)" [disabled]="saving()"
                      class="h-9 rounded-lg bg-danger text-white text-[13px] font-semibold disabled:opacity-50">Confirm delete</button>
                  </div>
                }
              }
            </div>
          }
          @if (manageMsg()) { <p class="text-xs flex items-center gap-1" [class.text-success]="!manageErr()" [class.text-danger]="manageErr()"><os-icon [name]="manageErr() ? 'error' : 'check'" [size]="14" /> {{ manageMsg() }}</p> }
        </div>
      }
    </os-drawer>

    <!-- ── Edit Floor drawer ────────────────────────────────────────── -->
    <os-drawer [open]="!!editFloor()" title="Edit Floor" [subtitle]="editFloor() ? 'Floor ' + pad(editFloor()!.floorNumber) : ''" width="min(420px, 94vw)" (closed)="requestCloseManage()">
      @if (editFloor(); as f) {
        <div class="space-y-4">
          <div>
            <label class="text-[12px] font-medium text-muted block mb-1">Floor number *</label>
            <input class="fld" type="number" min="0" [(ngModel)]="fForm.floorNumber" />
          </div>
          <div>
            <label class="text-[12px] font-medium text-muted block mb-1">Label</label>
            <input class="fld" [(ngModel)]="fForm.label" placeholder="e.g. Ground Floor" maxlength="60" />
          </div>
          <button (click)="saveFloor(f)" [disabled]="fForm.floorNumber === null || fForm.floorNumber < 0 || saving()"
            class="w-full h-10 rounded-lg bg-accent text-white text-[13px] font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5">
            @if (saving()) { <span class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span> } @else { <os-icon name="check" [size]="16" /> }
            Save changes
          </button>
          <p class="text-[11px] text-faint flex items-start gap-1"><os-icon name="info" [size]="13" /> Floors cannot be deleted — the backend has no floor-delete endpoint. Remove their rooms instead.</p>
          @if (manageMsg()) { <p class="text-xs flex items-center gap-1" [class.text-success]="!manageErr()" [class.text-danger]="manageErr()"><os-icon [name]="manageErr() ? 'error' : 'check'" [size]="14" /> {{ manageMsg() }}</p> }
        </div>
      }
    </os-drawer>

    <!-- ── Edit Room drawer ─────────────────────────────────────────── -->
    <os-drawer [open]="!!editRoom()" title="Edit Room" [subtitle]="editRoom() ? 'Unit ' + editRoom()!.name : ''" width="min(420px, 94vw)" (closed)="requestCloseManage()">
      @if (editRoom(); as r) {
        <div class="space-y-4">
          <div>
            <label class="text-[12px] font-medium text-muted block mb-1">Room number *</label>
            <input class="fld" [(ngModel)]="rForm.roomNumber" placeholder="e.g. 101" maxlength="20" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-[12px] font-medium text-muted block mb-1">Room type</label>
              <select class="fld" [(ngModel)]="rForm.roomType">
                @for (t of roomTypes; track t) { <option [value]="t">{{ roomTypeName(t) }}</option> }
              </select>
            </div>
            <div>
              <label class="text-[12px] font-medium text-muted block mb-1">Furnishing</label>
              <select class="fld" [(ngModel)]="rForm.furnishing">
                @for (t of furnishings; track t) { <option [value]="t">{{ label(t) }}</option> }
              </select>
            </div>
          </div>
          <div>
            <label class="text-[12px] font-medium text-muted block mb-1">Amenities</label>
            <div class="grid grid-cols-3 gap-2">
              <label class="flex items-center gap-2 text-[13px] text-content border border-border rounded-lg px-2.5 h-9 cursor-pointer hover:border-accent"><input type="checkbox" [(ngModel)]="rForm.acAvailable" class="accent-[var(--primary-container)]" /> AC</label>
              <label class="flex items-center gap-2 text-[13px] text-content border border-border rounded-lg px-2.5 h-9 cursor-pointer hover:border-accent"><input type="checkbox" [(ngModel)]="rForm.attachedBathroom" class="accent-[var(--primary-container)]" /> Bath</label>
              <label class="flex items-center gap-2 text-[13px] text-content border border-border rounded-lg px-2.5 h-9 cursor-pointer hover:border-accent"><input type="checkbox" [(ngModel)]="rForm.balcony" class="accent-[var(--primary-container)]" /> Balcony</label>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-[12px] font-medium text-muted block mb-1">Area (sq ft)</label>
              <input class="fld" type="number" min="0" [(ngModel)]="rForm.areaSqft" placeholder="—" />
            </div>
          </div>
          <div>
            <label class="text-[12px] font-medium text-muted block mb-1">Description</label>
            <textarea class="fld !h-auto py-2" rows="2" [(ngModel)]="rForm.description" placeholder="Optional"></textarea>
          </div>
          <div>
            <label class="text-[12px] font-medium text-muted block mb-1">Photos</label>
            <os-image-upload scope="room" entityType="room" [entityId]="r.id" role="gallery" [existing]="roomMedia()" />
            <p class="text-[11px] text-faint mt-1">Shown to residents on the room details screen.</p>
          </div>
          <button (click)="saveRoom(r)" [disabled]="!rForm.roomNumber.trim() || saving()"
            class="w-full h-10 rounded-lg bg-accent text-white text-[13px] font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5">
            @if (saving()) { <span class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span> } @else { <os-icon name="check" [size]="16" /> }
            Save changes
          </button>

          @if (canDelete()) {
            <div class="border-t border-border pt-4">
              <p class="text-[11px] uppercase tracking-wider text-danger mb-2">Danger zone</p>
              @if (roomBlockers(r); as blockers) {
                @if (blockers.length) {
                  <div class="rounded-lg border border-danger/30 bg-danger-subtle p-3">
                    <p class="text-[13px] font-medium text-danger mb-1">Room cannot be deleted.</p>
                    <ul class="text-[12px] text-content space-y-0.5">
                      @for (reason of blockers; track reason) { <li>· {{ reason }}</li> }
                    </ul>
                    <div class="grid grid-cols-2 gap-2 mt-3">
                      <button (click)="openRoomFirstBed(r)" class="h-8 rounded-lg border border-border bg-panel text-[12px] font-medium text-content hover:bg-canvas">Open Room</button>
                      <button (click)="requestCloseManage()" class="h-8 rounded-lg border border-border bg-panel text-[12px] font-medium text-content hover:bg-canvas">Cancel</button>
                    </div>
                  </div>
                } @else if (!confirmDelete()) {
                  <button (click)="confirmDelete.set(true)" class="w-full h-9 rounded-lg border border-danger/40 text-danger text-[13px] font-medium hover:bg-danger-subtle transition">Delete room…</button>
                } @else {
                  <p class="text-[13px] text-content mb-2">Delete <span class="font-semibold">Unit {{ r.name }}</span> and its beds?</p>
                  <div class="grid grid-cols-2 gap-2">
                    <button (click)="confirmDelete.set(false)" class="h-9 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas">Cancel</button>
                    <button (click)="removeRoom(r)" [disabled]="saving()"
                      class="h-9 rounded-lg bg-danger text-white text-[13px] font-semibold disabled:opacity-50">Confirm delete</button>
                  </div>
                }
              }
            </div>
          }
          @if (manageMsg()) { <p class="text-xs flex items-center gap-1" [class.text-success]="!manageErr()" [class.text-danger]="manageErr()"><os-icon [name]="manageErr() ? 'error' : 'check'" [size]="14" /> {{ manageMsg() }}</p> }
        </div>
      }
    </os-drawer>

    <!-- ── Unsaved changes dialog ───────────────────────────────────── -->
    <os-modal [open]="discardOpen()" title="Unsaved Changes" width="420px" (closed)="keepEditing()">
      <p class="text-sm text-content">You have unsaved changes.<br />Would you like to discard them?</p>
      <div footer class="flex gap-2">
        <button (click)="keepEditing()" class="h-9 px-4 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas">Continue Editing</button>
        <button (click)="discardChanges()" class="h-9 px-4 rounded-lg bg-danger text-white text-[13px] font-semibold">Discard</button>
      </div>
    </os-modal>

    <!-- ── Check-out confirm dialog ─────────────────────────────────── -->
    <os-modal [open]="checkOutOpen()" title="Confirm Check-Out" [subtitle]="occupant()?.name ?? null" width="420px" (closed)="checkOutOpen.set(false)">
      <p class="text-sm text-content">Check out <span class="font-semibold">{{ occupant()?.name }}</span> from
        {{ selectedRoom() ? 'Unit ' + selectedRoom()!.name : 'this bed' }}? The bed becomes available afterwards.</p>
      <div footer class="flex gap-2">
        <button (click)="checkOutOpen.set(false)" class="h-9 px-4 rounded-lg border border-border text-[13px] font-medium text-content hover:bg-canvas">Cancel</button>
        <button (click)="doCheckOut()" [disabled]="acting()" class="h-9 px-4 rounded-lg bg-danger text-white text-[13px] font-semibold disabled:opacity-50">Check Out</button>
      </div>
    </os-modal>
  `,
})
export class InventoryWorkspaceComponent {
  private readonly propsSvc = inject(PropertiesService);
  private readonly inv = inject(InventoryService);
  private readonly uploads = inject(UploadService);
  private readonly bookingsSvc = inject(BookingsService);
  private readonly usersSvc = inject(UsersService);
  private readonly collections = inject(CollectionsApiService);
  private readonly invoicesSvc = inject(InvoicesService);
  private readonly paymentsSvc = inject(PaymentsService);
  private readonly visitorsSvc = inject(VisitorsService);
  private readonly session = inject(SessionStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly properties = toSignal(this.propsSvc.list(), { initialValue: [] as Property[] });
  protected propertyId = '';
  readonly board = signal<Board>({ buildings: [], floors: [], rooms: [] });
  readonly building = signal<string>('');
  readonly loading = signal(false);
  readonly selected = signal<ApiBed | null>(null);
  readonly selectedRoom = signal<BoardRoom | null>(null);
  readonly msg = signal<string | null>(null);
  readonly err = signal(false);
  /** Bookings cache for the selected property — refreshed only on booking-affecting events. */
  private readonly bookings = signal<ApiBooking[]>([]);
  private readonly reservationsList = signal<ApiReservation[]>([]);
  /** Outstanding rent (sum of aging buckets) — null means data not available. */
  private readonly outstandingPaisa = signal<number | null>(null);

  readonly occupant = signal<Occupant | null>(null);
  readonly loadingOccupant = signal(false);
  readonly reservation = signal<ReservedInfo | null>(null);

  readonly resident = signal<ApiUser | null>(null);
  readonly residentOpen = signal(false);
  readonly loadingResident = signal(false);
  readonly residentDocs = signal<KycDocument[]>([]);
  readonly residentTimeline = signal<TimelineEntry[]>([]);
  /** Phase 3 resident-scoped data (all from existing per-user endpoints). */
  readonly residentFinance = signal<FinanceSnapshot | null>(null);
  readonly residentKyc = signal<KycSummary | null>(null);
  readonly residentVisitors = signal<ApiVisitor[]>([]);
  readonly residentInvoiceRows = signal<ApiInvoice[]>([]);
  /** Guards against stale async writes when the drawer switches residents quickly. */
  private residentReq = 0;
  /** Last resident id opened — enables retry-on-failure without losing context. */
  readonly lastResidentId = signal<string | null>(null);
  protected readonly residentTabs = ['Profile', 'Booking', 'Finance', 'Visitors', 'Documents', 'Timeline', 'Actions'];
  readonly residentTab = signal('Profile');
  readonly actionMsg = signal<string | null>(null);
  readonly actionErr = signal(false);
  readonly checkOutOpen = signal(false);
  /** Property-wide visitor cache (reused for room activity + visitor summary). */
  private readonly propVisitors = signal<ApiVisitor[]>([]);
  /** Property-scoped overdue invoices (for alerts) — single filtered call, cached. */
  private readonly overdueInvoices = signal<ApiInvoice[]>([]);
  /** Background auto-refresh toggle + in-flight guard against duplicate polls. */
  readonly autoRefresh = signal(true);
  private refreshing = false;
  readonly lastRefresh = signal<Date | null>(null);

  num = (v: unknown) => Number(v ?? 0);
  waLink(phone: string): string { const d = (phone || '').replace(/\D/g, ''); return `https://wa.me/${d.length === 10 ? '91' + d : d}`; }
  residentName = computed(() => { const u = this.resident(); return u ? userDisplayName(u) : 'Resident'; });
  roomCount = (room: BoardRoom, s: string) => room.beds.filter((b) => this.status(b) === s).length;

  // Only manually-settable statuses (backend UpdateBedStatusDto). Occupied/
  // Reserved/Vacating are driven by booking/reservation/notice flows.
  protected readonly actions: Status[] = ['AVAILABLE', 'MAINTENANCE', 'BLOCKED'];
  protected readonly allStatuses: Status[] = ['OCCUPIED', 'AVAILABLE', 'RESERVED', 'MAINTENANCE', 'BLOCKED', 'VACATING_SOON'];

  /** Building to restore after the board loads (from ?building= on return navigation). */
  private pendingBuilding: string | null = null;

  constructor() {
    // Restore prior context (?property=&building=) so cross-navigation round-trips
    // (Inventory → Resident → Booking → … → back) never lose the selected building/room.
    const qp = this.route.snapshot.queryParamMap;
    const ctxProperty = qp.get('property');
    this.pendingBuilding = qp.get('building');

    // Auto-select the restored (or first) property once the list loads.
    effect(() => {
      const list = this.properties();
      if (list.length && !this.propertyId) {
        const restore = ctxProperty && list.some((p) => p.id === ctxProperty) ? ctxProperty : list[0].id;
        this.propertyId = restore;
        this.loadProperty(this.propertyId);
      }
    });

    // Module 10 — background refresh of active datasets only. No server push exists,
    // so poll gently (45s) and skip when hidden, mid-edit, or a fetch is already running.
    interval(45000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.backgroundRefresh());
  }

  /** Lightweight poll of the live datasets (bookings + visitors + overdue invoices). */
  private backgroundRefresh(): void {
    if (!this.autoRefresh() || !this.propertyId) return;
    if (this.refreshing || this.loading()) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    if (this.editBuilding() || this.editFloor() || this.editRoom() || this.discardOpen()) return; // never disturb an edit
    this.refreshing = true;
    this.reloadBookings();
    this.reloadVisitors();
    this.reloadOverdue();
    this.lastRefresh.set(new Date());
    this.refreshing = false;
  }

  /** Persist current context to the URL (replace, no history spam) for return navigation. */
  private syncContextUrl(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { property: this.propertyId || null, building: this.building() || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  readonly buildings = computed(() => this.board().buildings);
  readonly activeBuilding = computed(() => this.buildings().find((b) => b.id === this.building()) ?? null);

  // ── Search + filters (client-side over the loaded board) ───────────────────
  readonly q = signal('');
  readonly fFloor = signal<string>('');
  readonly fStatus = signal<string>('');
  readonly fType = signal<string>('');
  readonly fOcc = signal<string>('');
  hasFilters(): boolean { return !!(this.q() || this.fFloor() || this.fStatus() || this.fType() || this.fOcc()); }
  clearFilters(): void { this.q.set(''); this.fFloor.set(''); this.fStatus.set(''); this.fType.set(''); this.fOcc.set(''); }

  readonly allFloorNumbers = computed(() =>
    [...new Set(this.board().rooms.filter((r) => !this.building() || r.buildingId === this.building()).map((r) => r.floor))].sort((a, b) => a - b),
  );

  /** Occupant name per bed, from the CHECKED_IN bookings cache. */
  private readonly bedTenantName = computed(() => {
    const map = new Map<string, string>();
    for (const bk of this.bookings()) {
      if (bk.status === 'CHECKED_IN' && bk.bedId && bk.tenantName) map.set(bk.bedId, bk.tenantName);
    }
    return map;
  });
  bedResident(bedId: string): string | null { return this.bedTenantName().get(bedId) ?? null; }

  /** Search haystack per room: unit, type, building, floor, residents, booking numbers. */
  private roomHaystack(r: BoardRoom): string {
    const bName = this.board().buildings.find((b) => b.id === r.buildingId)?.name ?? '';
    const residents = r.beds.map((bed) => this.bedTenantName().get(bed.id) ?? '').join(' ');
    const bookingNos = this.bookings()
      .filter((bk) => bk.bedId && r.beds.some((bed) => bed.id === bk.bedId))
      .map((bk) => bk.bookingNumber ?? '').join(' ');
    return `${r.name} ${r.roomType ?? ''} ${bName} floor ${r.floor} ${residents} ${bookingNos}`.toLowerCase();
  }

  private readonly visibleRooms = computed(() => {
    const term = this.q().trim().toLowerCase();
    const floor = this.fFloor();
    const st = this.fStatus();
    const type = this.fType();
    const occ = this.fOcc();
    return this.board().rooms.filter((r) => {
      if (this.building() && r.buildingId !== this.building()) return false;
      if (floor !== '' && r.floor !== Number(floor)) return false;
      if (type && r.roomType !== type) return false;
      if (st && !r.beds.some((b) => this.status(b) === st)) return false;
      if (occ === 'VACANT' && !r.beds.some((b) => this.status(b) === 'AVAILABLE')) return false;
      if (occ === 'RESERVED' && !r.beds.some((b) => this.status(b) === 'RESERVED')) return false;
      if (term && !this.roomHaystack(r).includes(term)) return false;
      return true;
    });
  });

  readonly floors = computed(() => [...new Set(this.visibleRooms().map((r) => r.floor))].sort((a, b) => b - a));
  roomsOnFloor(f: number): BoardRoom[] {
    return this.visibleRooms().filter((r) => r.floor === f).sort((a, b) => a.name.localeCompare(b.name));
  }

  // ── Room stats (per-card dashboard) ────────────────────────────────────────
  roomStats(room: BoardRoom): RoomStats {
    const count = (s: Status) => room.beds.filter((b) => this.status(b) === s).length;
    const capacity = room.beds.length;
    const occupied = count('OCCUPIED');
    const reserved = count('RESERVED');
    const available = count('AVAILABLE');
    const maintenance = count('MAINTENANCE');
    const blocked = count('BLOCKED');
    const pct = capacity ? Math.round((occupied / capacity) * 100) : 0;
    const revenuePaisa = room.beds.filter((b) => this.status(b) === 'OCCUPIED').reduce((s, b) => s + (b.pricePaisa ?? 0), 0);
    let badge = 'Vacant', badgeClass = 'text-success bg-success-subtle';
    if (capacity && occupied === capacity) { badge = 'Full'; badgeClass = 'text-white bg-[var(--primary-container)]'; }
    else if (maintenance === capacity && capacity) { badge = 'Maint.'; badgeClass = 'text-danger bg-danger-subtle'; }
    else if (occupied > 0) { badge = 'Partial'; badgeClass = 'text-warning bg-warning-subtle'; }
    return { capacity, occupied, reserved, available, maintenance, blocked, pct, revenuePaisa, badge, badgeClass };
  }

  readonly expanded = signal<Set<string>>(new Set());
  toggleExpand(roomId: string): void {
    const next = new Set(this.expanded());
    if (next.has(roomId)) next.delete(roomId); else next.add(roomId);
    this.expanded.set(next);
  }

  // ── Occupancy metrics (board + bookings cache + collections aging) ────────
  private readonly beds = computed(() => this.visibleRooms().flatMap((r) => r.beds));
  readonly total = computed(() => this.beds().length);
  readonly occupied = computed(() => this.beds().filter((b) => this.status(b) === 'OCCUPIED').length);
  readonly occRate = computed(() => (this.total() ? Math.round((this.occupied() / this.total()) * 100) : 0));
  readonly leakagePaise = computed(() =>
    this.beds().filter((b) => this.status(b) === 'AVAILABLE').reduce((s, b) => s + (b.pricePaisa ?? 0), 0),
  );

  readonly metrics = computed(() => {
    const board = this.board();
    const beds = board.rooms.flatMap((r) => r.beds);
    const by = (s: Status) => beds.filter((b) => this.status(b) === s).length;
    const inr = (p: number) => '₹' + Math.round(p / 100).toLocaleString('en-IN');
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    const bks = this.bookings();
    const checkIns = bks.filter((b) => (b.checkInDate ?? b.checkIn ?? '').slice(0, 10) === today && b.status !== 'CANCELLED').length;
    const checkOuts = bks.filter((b) => (b.checkOutDate ?? '').slice(0, 10) === today && b.status === 'CHECKED_IN').length;
    const moveOuts = bks.filter((b) => {
      const d = (b.checkOutDate ?? '').slice(0, 10);
      return b.status === 'CHECKED_IN' && d > today && d <= soon;
    }).length;
    const potential = beds.reduce((s, b) => s + (b.pricePaisa ?? 0), 0);
    const occ = by('OCCUPIED');
    const out = this.outstandingPaisa();
    return [
      { label: 'Buildings', value: String(board.buildings.length), hint: `${board.floors.length} floors`, cls: '', link: '' },
      { label: 'Rooms · Beds', value: `${board.rooms.length} · ${beds.length}`, hint: '', cls: '', link: '' },
      { label: 'Occupied', value: String(occ), hint: beds.length ? Math.round((occ / beds.length) * 100) + '% occupancy' : '', cls: 'text-[var(--primary-container)]', link: '/analytics/occupancy' },
      { label: 'Vacant · Rsvd', value: `${by('AVAILABLE')} · ${by('RESERVED')}`, hint: `${by('MAINTENANCE')} maint · ${by('BLOCKED')} blocked`, cls: 'text-success', link: '/bookings/reservations' },
      { label: 'Revenue Potential', value: inr(potential), hint: inr(beds.filter((b) => this.status(b) === 'OCCUPIED').reduce((s, b) => s + (b.pricePaisa ?? 0), 0)) + ' realised', cls: '', link: '/analytics/revenue' },
      { label: 'Today In · Out', value: `${checkIns} · ${checkOuts}`, hint: `${moveOuts} move-outs in 14d`, cls: '', link: '/bookings/check-in' },
      { label: 'Outstanding Rent', value: out === null ? '—' : inr(out), hint: out === null ? 'Data not available' : 'from unpaid invoices', cls: out ? 'text-danger' : '', link: '/finance/collections' },
      { label: 'Pending KYC', value: '—', hint: 'Not available per property', cls: '', link: '/operations/kyc' },
    ];
  });

  readonly activity = computed(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return this.bookings()
      .filter((b) => b.status === 'CONFIRMED' || b.status === 'RESERVED' || b.status === 'CHECKED_IN')
      .map((b) => {
        const d = b.checkInDate ?? b.checkIn;
        const days = d ? Math.round((new Date(d).setHours(0, 0, 0, 0) - today.getTime()) / 86400000) : 99;
        let tag = 'SCHEDULED', tagClass = 'text-muted bg-canvas';
        if (b.status !== 'CHECKED_IN' && days < 0) { tag = 'OVERDUE'; tagClass = 'text-danger bg-danger-subtle'; }
        else if (days === 0) { tag = 'TODAY'; tagClass = 'text-success bg-success-subtle'; }
        else if (days === 1) { tag = 'TOMORROW'; tagClass = 'text-warning bg-warning-subtle'; }
        else if (days > 1) { tag = '+' + days + 'D'; tagClass = 'text-muted bg-canvas'; }
        const unit = b.roomNumber ? `Unit ${b.roomNumber}${b.bedLabel ? '-' + b.bedLabel : ''}` : (b.bookingNumber ?? '—');
        return { id: b.id, name: b.tenantName || 'Guest', unit, tag, tagClass, sort: days };
      })
      .sort((a, b) => a.sort - b.sort)
      .slice(0, 6);
  });

  // ── Loading / refresh (cache-aware) ────────────────────────────────────────
  onProperty(id: string): void {
    if (id === this.propertyId) return;
    this.guard(() => { this.propertyId = id; this.loadProperty(id); });
  }
  switchBuilding(id: string): void {
    if (id === this.building()) return;
    this.guard(() => { this.building.set(id); this.syncContextUrl(); });
  }
  refresh(): void {
    if (this.propertyId) this.guard(() => this.loadProperty(this.propertyId));
  }

  private loadProperty(id: string): void {
    this.building.set('');
    this.board.set({ buildings: [], floors: [], rooms: [] });
    this.bookings.set([]);
    this.propVisitors.set([]);
    this.outstandingPaisa.set(null);
    this.selectedBeds.set(new Set());
    this.expanded.set(new Set());
    if (!id) return;
    this.reloadBoard();
    this.reloadBookings();
    this.reloadVisitors();
    this.reloadOverdue();
    this.bookingsSvc.reservations().subscribe((rows) => this.reservationsList.set(rows));
    this.collections.aging(id).subscribe((aging) => {
      const buckets = Object.values(aging ?? {});
      this.outstandingPaisa.set(buckets.length ? buckets.reduce((s, b) => s + this.num(b.amountPaisa), 0) : null);
    });
    this.syncContextUrl();
  }
  /** Board-only reload (structure edits). Preserves the selected building tab. */
  private reloadBoard(): void {
    const prevBuilding = this.pendingBuilding || this.building();
    this.pendingBuilding = null;
    this.loading.set(true);
    this.inv.board(this.propertyId).subscribe((b) => {
      this.board.set(b);
      const keep = b.buildings.some((x) => x.id === prevBuilding);
      this.building.set(keep ? prevBuilding : (b.buildings[0]?.id ?? ''));
      this.loading.set(false);
      this.syncContextUrl();
    });
  }
  /** Property-wide visitor cache — reused for the visitor summary + room activity feed. */
  private reloadVisitors(): void {
    this.visitorsSvc.list({ propertyId: this.propertyId, limit: 200 }).subscribe((res) => this.propVisitors.set(res.data ?? []));
  }
  /** Property-scoped overdue invoices — powers the finance alerts (single filtered call). */
  private reloadOverdue(): void {
    this.invoicesSvc.list({ propertyId: this.propertyId, status: 'OVERDUE', limit: 100 }).subscribe((res) => this.overdueInvoices.set(res.data ?? []));
  }
  /** Bookings-cache reload — only after booking-affecting events (check-out, transfer…). */
  private reloadBookings(): void {
    this.bookingsSvc.bookings({ propertyId: this.propertyId }).subscribe((rows) => {
      this.bookings.set(rows);
      if (this.selected()) this.resolveContext();
    });
  }

  // ── Bed drawer ─────────────────────────────────────────────────────────────
  bedClick(bed: ApiBed, room: BoardRoom): void {
    if (this.selectMode()) { this.toggleBedSelection(bed.id); return; }
    this.open(bed, room);
  }
  open(bed: ApiBed, room: BoardRoom): void {
    this.msg.set(null); this.selectedRoom.set(room); this.selected.set(bed);
    this.resolveContext();
  }

  /** Resolve the occupant (OCCUPIED) or reservation (RESERVED) for the selected bed — reuses bookings/users/collections; no new endpoint. */
  resolveContext(): void {
    this.occupant.set(null); this.reservation.set(null);
    const b = this.selected(); const room = this.selectedRoom();
    if (!b) return;
    const st = this.status(b);

    if (st === 'OCCUPIED') {
      this.loadingOccupant.set(true);
      const match = (bk: ApiBooking) =>
        (bk.bedId && bk.bedId === b.id) ||
        (!!room && bk.roomNumber === room.name && (bk.bedLabel ?? bk.bedNumber) === (b.label ?? b.bedNumber));
      const active = this.bookings().filter((bk) => match(bk) && (bk.status === 'CHECKED_IN' || bk.status === 'CONFIRMED'));
      const bk = active.find((x) => x.status === 'CHECKED_IN') ?? active[0];
      const tenantId = bk?.tenantId ?? b.currentTenantId ?? null;
      if (!tenantId) { this.loadingOccupant.set(false); return; }

      const pay = bk ? paymentFromBooking(bk) : null;
      const baseOutstanding = bk ? Math.max(0, this.num(bk['rentPaisa']) - this.num(bk['totalPaidPaisa'])) : 0;
      const card: Occupant = {
        tenantId,
        name: bk?.tenantName || 'Resident',
        phone: '',
        avatarUrl: null,
        bookingNumber: bk?.bookingNumber || '—',
        bookingId: (bk?.['id'] as string) ?? b.currentBookingId ?? null,
        bookingStatus: bk?.status ?? 'CHECKED_IN',
        moveIn: bk?.checkInDate ?? null,
        leaseEnd: (bk?.['checkOutDate'] as string) ?? null,
        rentStatus: pay?.status ?? 'DUE',
        kycStatus: 'NOT_STARTED',
        outstandingPaisa: baseOutstanding,
      };
      this.occupant.set(card);
      // Enrich from the resident + collections (real APIs).
      this.usersSvc.get(tenantId).subscribe((u) => {
        if (!u || this.occupant()?.tenantId !== tenantId) return;
        this.occupant.update((o) => o ? { ...o, name: userDisplayName(u), phone: u.phone ?? '', avatarUrl: u.avatarUrl ?? null, kycStatus: (u.kycStatus as string) ?? 'NOT_STARTED' } : o);
      });
      this.collections.timeline(tenantId).subscribe((t) => {
        if (!t || this.occupant()?.tenantId !== tenantId) { this.loadingOccupant.set(false); return; }
        const outstanding = (t.invoices as Record<string, unknown>[]).reduce((s, i) => s + this.num(i['balance_paisa']), 0);
        this.occupant.update((o) => o ? { ...o, outstandingPaisa: outstanding || o.outstandingPaisa } : o);
        this.loadingOccupant.set(false);
      });
    } else if (st === 'RESERVED') {
      const r = this.reservationsList().find((x) => x.bedId === b.id && (x.status ?? 'ACTIVE').toUpperCase() === 'ACTIVE');
      if (r) this.reservation.set({ tenantName: r.tenantName || 'Reserved', reservedUntil: (r['reservedUntil'] as string) ?? (r['reserved_until'] as string) ?? null, status: r.status ?? 'ACTIVE' });
    }
  }

  // ── Resident drawer ────────────────────────────────────────────────────────
  openResident(tenantId: string, tab = 'Profile'): void {
    const req = ++this.residentReq;
    this.lastResidentId.set(tenantId);
    this.residentOpen.set(true);
    this.residentTab.set(tab);
    this.residentDocs.set([]); this.residentTimeline.set([]);
    this.residentFinance.set(null); this.residentKyc.set(null); this.residentVisitors.set([]);
    this.residentInvoiceRows.set([]);
    this.actionMsg.set(null); this.actionErr.set(false);
    this.loadingResident.set(true); this.resident.set(null);
    const fresh = () => req === this.residentReq;

    this.usersSvc.get(tenantId).subscribe((u) => { if (fresh()) { this.resident.set(u); this.loadingResident.set(false); } });
    this.usersSvc.kycDocuments(tenantId).subscribe((d) => {
      if (!fresh()) return;
      this.residentDocs.set(d);
      this.residentKyc.update((k) => k ? { ...k, docCount: d.length } : k);
    });
    this.usersSvc.kyc(tenantId).subscribe((k) => { if (fresh()) this.setResidentKyc(k); });
    this.residentVisitors.set(this.visitorsForHost(tenantId));
    this.loadResidentFinance(tenantId, req);
    this.loadResidentTimeline(tenantId, req);
  }

  closeResident(): void { this.residentOpen.set(false); this.resident.set(null); this.lastResidentId.set(null); }

  /** Retry loading the resident drawer without losing context (Module 13). */
  retryResident(): void {
    const id = this.lastResidentId();
    if (id) this.openResident(id, this.residentTab());
  }

  /** Merge KYC record + doc count into the summary card. */
  private setResidentKyc(k: KycRecord | null): void {
    const docCount = this.residentDocs().length;
    this.residentKyc.set({
      status: (k?.status as string) ?? 'NOT_STARTED',
      submittedAt: (k?.submittedAt as string) ?? null,
      reviewedAt: (k?.reviewedAt as string) ?? null,
      rejectionReason: (k?.rejectionReason as string) ?? null,
      docCount,
    });
  }

  /** This resident's visitors, newest first, from the property visitor cache. */
  private visitorsForHost(tenantId: string): ApiVisitor[] {
    return this.propVisitors()
      .filter((v) => v.host_user_id === tenantId)
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  }

  /** Finance snapshot from invoices + payments (existing per-user endpoints). */
  private loadResidentFinance(tenantId: string, req: number): void {
    const fresh = () => req === this.residentReq;
    const forThisResident = this.occupant()?.tenantId === tenantId;
    const rentPaisa = forThisResident ? this.num(this.selected()?.pricePaisa) : 0;
    const booking = this.bookings().find((x) => x.id === this.occupant()?.bookingId);
    const depositPaisa = forThisResident ? this.num(booking?.securityDepositPaisa) : 0;
    this.invoicesSvc.list({ customerUserId: tenantId, limit: 100 }).subscribe((res) => {
      if (!fresh()) return;
      const rows = res.data ?? [];
      this.residentInvoiceRows.set(rows);
      this.paymentsSvc.list({ payerUserId: tenantId, limit: 100 }).subscribe((pr) => {
        if (!fresh()) return;
        const pays = pr.data ?? [];
        this.computeFinance(rows, pays, rentPaisa, depositPaisa);
      });
    });
  }
  private computeFinance(invoices: ApiInvoice[], payments: ApiPayment[], rentPaisa: number, deposit: number): void {
    const outstanding = invoices.reduce((s, i) => s + paise(i.balancePaisa), 0);
    const openInvoices = invoices.filter((i) => paise(i.balancePaisa) > 0)
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
    const succeeded = payments.filter((p) => p.status === 'SUCCESS' || p.status === 'PARTIAL')
      .sort((a, b) => (b.paid_at ?? b.created_at ?? '').localeCompare(a.paid_at ?? a.created_at ?? ''));
    const last = succeeded[0] ?? null;
    let status = 'NO DUES';
    if (outstanding > 0) status = openInvoices.some((i) => i.status === 'OVERDUE') ? 'OVERDUE' : 'DUE';
    this.residentFinance.set({
      currentMonthRentPaisa: rentPaisa,
      outstandingPaisa: outstanding,
      depositPaisa: deposit,
      invoiceCount: invoices.length,
      paymentCount: payments.length,
      lastPayment: last ? { id: last.id, amountPaisa: paise(last.amount_paisa), date: last.paid_at ?? last.created_at ?? null, method: last.method } : null,
      nextDueDate: openInvoices[0]?.dueDate ?? null,
      status,
      firstOpenInvoiceId: openInvoices[0]?.id ?? null,
    });
  }

  /** Full lifecycle timeline merged from booking, KYC, invoices, payments, reminders, visitors. */
  private loadResidentTimeline(tenantId: string, req: number): void {
    const fresh = () => req === this.residentReq;
    this.collections.timeline(tenantId).subscribe((t) => {
      if (!fresh()) return;
      const invoices = (t?.invoices ?? []) as Record<string, unknown>[];
      const payments = (t?.payments ?? []) as Record<string, unknown>[];
      const reminders = (t?.reminders ?? []) as Record<string, unknown>[];
      const o = this.occupant();
      const k = this.residentKyc();
      const entries: TimelineEntry[] = [
        ...(o?.moveIn ? [{ kind: 'MOVE_IN', label: 'Moved in · check-in', date: o.moveIn, amountPaisa: null }] : []),
        ...(k?.submittedAt ? [{ kind: 'KYC', label: 'KYC submitted', date: k.submittedAt, amountPaisa: null }] : []),
        ...(k?.reviewedAt ? [{ kind: 'KYC', label: `KYC ${String(k.status).toLowerCase()}`, date: k.reviewedAt, amountPaisa: null }] : []),
        ...invoices.map((i) => ({
          kind: 'INVOICE', label: `Invoice ${String(i['invoice_number'] ?? '')} · ${String(i['status'] ?? '')}`,
          date: (i['due_date'] as string) ?? (i['created_at'] as string) ?? null, amountPaisa: this.num(i['total_paisa']),
        })),
        ...payments.map((p) => ({
          kind: 'PAYMENT', label: `Payment · ${String(p['status'] ?? 'RECORDED')}`,
          date: (p['created_at'] as string) ?? null, amountPaisa: this.num(p['amount_paisa']),
        })),
        ...reminders.map((r) => ({
          kind: 'REMINDER', label: 'Payment reminder sent',
          date: (r['created_at'] as string) ?? null, amountPaisa: null,
        })),
        ...this.visitorsForHost(tenantId).map((v) => ({
          kind: 'VISITOR', label: `Visitor · ${v.name}${v.checked_in_at ? ' entered' : ''}`,
          date: v.checked_in_at ?? v.expected_at ?? v.created_at ?? null, amountPaisa: null,
        })),
        ...(o?.bookingStatus === 'CHECKED_OUT' && o.leaseEnd ? [{ kind: 'CHECK_OUT', label: 'Checked out', date: o.leaseEnd, amountPaisa: null }] : []),
      ].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
      this.residentTimeline.set(entries);
    });
  }

  readonly firstDueInvoiceId = computed(() => this.residentFinance()?.firstOpenInvoiceId ?? null);

  invoicePdfUrl(id: string): string { return this.invoicesSvc.pdfUrl(id); }
  ctxQuery(): Record<string, string> { return { property: this.propertyId, building: this.building() }; }

  // ── Visitor summary (property-wide, from the cache) ─────────────────────────
  private todayStr(): string { return new Date().toISOString().slice(0, 10); }
  readonly visitorSummary = computed(() => {
    const today = this.todayStr();
    const list = this.propVisitors();
    const isToday = (d: string | null) => !!d && d.slice(0, 10) === today;
    return {
      today: list.filter((v) => isToday(v.expected_at) || isToday(v.checked_in_at)).length,
      upcoming: list.filter((v) => (v.status === 'PENDING' || v.status === 'APPROVED') && !!v.expected_at && v.expected_at.slice(0, 10) > today).length,
      active: list.filter((v) => v.status === 'CHECKED_IN').length,
      recent: [...list]
        .filter((v) => v.checked_in_at)
        .sort((a, b) => (b.checked_in_at ?? '').localeCompare(a.checked_in_at ?? ''))
        .slice(0, 4),
    };
  });

  // ── Booking timeline (from the resolved occupant booking) ───────────────────
  readonly bookingTimeline = computed<TimelineEntry[]>(() => {
    const o = this.occupant();
    if (!o) return [];
    const bk = this.bookings().find((x) => x.id === o.bookingId);
    const entries: TimelineEntry[] = [];
    const created = (bk?.['createdAt'] as string) ?? (bk?.['bookingDate'] as string) ?? null;
    if (created) entries.push({ kind: 'BOOKING', label: `Booking created · ${o.bookingNumber}`, date: created, amountPaisa: null });
    const res = this.reservationsList().find((r) => r.bedId === this.selected()?.id);
    if (res?.reservedUntil) entries.push({ kind: 'RESERVATION', label: 'Reservation held', date: res.reservedUntil, amountPaisa: null });
    if (o.moveIn) entries.push({ kind: 'CHECK_IN', label: 'Checked in', date: o.moveIn, amountPaisa: null });
    if (o.bookingStatus === 'CHECKED_OUT' && o.leaseEnd) entries.push({ kind: 'CHECK_OUT', label: 'Checked out', date: o.leaseEnd, amountPaisa: null });
    return entries.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  });

  // ── Room activity feed (existing events: check-in/out + visitor entries) ────
  roomActivity(room: BoardRoom): RoomActivity[] {
    const bedIds = new Set(room.beds.map((b) => b.id));
    const tenantIds = new Set(
      this.bookings().filter((bk) => bk.bedId && bedIds.has(bk.bedId) && bk.tenantId).map((bk) => bk.tenantId as string),
    );
    const acts: RoomActivity[] = [];
    for (const bk of this.bookings()) {
      if (!bk.bedId || !bedIds.has(bk.bedId)) continue;
      if (bk.checkInDate && (bk.status === 'CHECKED_IN' || bk.status === 'CHECKED_OUT')) {
        acts.push({ kind: 'CHECK_IN', label: `${bk.tenantName || 'Resident'} checked in`, date: bk.checkInDate });
      }
      if (bk.checkOutDate && bk.status === 'CHECKED_OUT') {
        acts.push({ kind: 'CHECK_OUT', label: `${bk.tenantName || 'Resident'} checked out`, date: bk.checkOutDate });
      }
    }
    for (const v of this.propVisitors()) {
      if (v.checked_in_at && tenantIds.has(v.host_user_id)) {
        acts.push({ kind: 'VISITOR', label: `Visitor ${v.name} entered`, date: v.checked_in_at });
      }
    }
    return acts.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 5);
  }
  /** Relative day label for activity/timeline dates. */
  relDay(date: string | null): string {
    if (!date) return '—';
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((today.getTime() - d.getTime()) / 86400000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }

  // ── Operational intelligence (health · activity · alerts) ──────────────────
  private daysUntil(date: string | null): number | null {
    if (!date) return null;
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - today.getTime()) / 86400000);
  }
  /** The active CHECKED_IN booking occupying a bed, if any. */
  private bookingForBed(bedId: string): ApiBooking | undefined {
    return this.bookings().find((b) => b.bedId === bedId && b.status === 'CHECKED_IN');
  }
  private outstandingForBooking(b: ApiBooking | undefined): number {
    if (!b) return 0;
    return Math.max(0, this.num(b['rentPaisa']) - this.num(b['totalPaidPaisa']));
  }

  /** Module 6 — resident health from booking dues + checkout date (+ KYC when drawer-loaded). */
  bedHealth(bed: ApiBed): Health | null {
    if (this.status(bed) !== 'OCCUPIED') return null;
    const bk = this.bookingForBed(bed.id);
    const out = this.outstandingForBooking(bk);
    const checkoutIn = this.daysUntil((bk?.['checkOutDate'] as string) ?? null);
    const overdueInvoice = this.overdueInvoices().some((i) => bk && i.bookingId === bk.id);
    if (overdueInvoice || (out > 0 && checkoutIn !== null && checkoutIn < 0)) return { level: 'red', label: 'Overdue' };
    if (out > 0) return { level: 'yellow', label: 'Payment due' };
    if (checkoutIn !== null && checkoutIn >= 0 && checkoutIn <= 3) return { level: 'yellow', label: 'Checkout soon' };
    return { level: 'green', label: 'On track' };
  }
  /** Resident health for the currently open drawer occupant (adds KYC signals). */
  readonly residentHealth = computed<Health | null>(() => {
    const o = this.occupant();
    if (!o) return null;
    const kyc = this.residentKyc()?.status ?? o.kycStatus;
    const checkoutIn = this.daysUntil(o.leaseEnd);
    if (o.outstandingPaisa > 0 && checkoutIn !== null && checkoutIn < 0) return { level: 'red', label: 'Checkout overdue' };
    if (kyc === 'REJECTED') return { level: 'red', label: 'KYC rejected' };
    if (o.outstandingPaisa > 0 && (o.rentStatus === 'OVERDUE')) return { level: 'red', label: 'Payment overdue' };
    if (o.outstandingPaisa > 0) return { level: 'yellow', label: 'Payment due' };
    if (['NOT_STARTED', 'PENDING', 'SUBMITTED', 'IN_REVIEW'].includes(kyc)) return { level: 'yellow', label: 'KYC pending' };
    if (checkoutIn !== null && checkoutIn >= 0 && checkoutIn <= 7) return { level: 'yellow', label: 'Move-out soon' };
    return { level: 'green', label: 'All good' };
  });
  healthDot(level: HealthLevel): string {
    return level === 'red' ? 'bg-danger' : level === 'yellow' ? 'bg-warning' : 'bg-success';
  }
  healthPill(level: HealthLevel): string {
    return level === 'red' ? 'text-danger bg-danger-subtle'
      : level === 'yellow' ? 'text-warning bg-warning-subtle'
      : 'text-success bg-success-subtle';
  }

  /** Module 5 — room risk indicator derived from its beds' bookings/dues. */
  roomRisk(room: BoardRoom): Health {
    const healths = room.beds.map((b) => this.bedHealth(b)).filter((h): h is Health => !!h);
    if (healths.some((h) => h.level === 'red')) return { level: 'red', label: 'Overdue' };
    if (healths.some((h) => h.label === 'Checkout soon')) return { level: 'yellow', label: 'Checkout soon' };
    if (healths.some((h) => h.level === 'yellow')) return { level: 'yellow', label: 'Payment due' };
    return { level: 'green', label: 'Low risk' };
  }
  /** Next due date + outstanding across a room's occupied beds. */
  roomFinance(room: BoardRoom): { nextDue: string | null; outstandingPaisa: number; resident: string | null } {
    let nextDue: string | null = null;
    let outstanding = 0;
    let resident: string | null = null;
    for (const bed of room.beds) {
      const bk = this.bookingForBed(bed.id);
      if (!bk) continue;
      outstanding += this.outstandingForBooking(bk);
      const due = (bk['checkOutDate'] as string) ?? null;
      if (due && (!nextDue || due < nextDue)) nextDue = due;
      resident = resident ?? bk.tenantName ?? null;
    }
    return { nextDue, outstandingPaisa: outstanding, resident };
  }

  /** Module 3 — property activity stream from real cached events (newest first). */
  readonly activityStream = computed<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    for (const b of this.bookings()) {
      if (b.checkInDate && (b.status === 'CHECKED_IN' || b.status === 'CHECKED_OUT')) {
        items.push({ id: `ci-${b.id}`, kind: 'CHECK_IN', icon: 'login', label: 'Check-in', detail: `${b.tenantName || 'Resident'} · ${b.roomNumber ? 'Unit ' + b.roomNumber : b.bookingNumber ?? ''}`, date: b.checkInDate });
      }
      if (b.checkOutDate && b.status === 'CHECKED_OUT') {
        items.push({ id: `co-${b.id}`, kind: 'CHECK_OUT', icon: 'logout', label: 'Check-out', detail: `${b.tenantName || 'Resident'}`, date: b.checkOutDate });
      }
      if ((b.status === 'CONFIRMED' || b.status === 'RESERVED') && (b['createdAt'] || b['bookingDate'])) {
        items.push({ id: `bk-${b.id}`, kind: 'BOOKING', icon: 'event', label: 'New booking', detail: `${b.tenantName || 'Guest'} · ${b.bookingNumber ?? ''}`, date: (b['createdAt'] as string) ?? (b['bookingDate'] as string) ?? null });
      }
    }
    for (const r of this.reservationsList()) {
      if (r.propertyId && r.propertyId !== this.propertyId) continue;
      items.push({ id: `rs-${r.id}`, kind: 'RESERVATION', icon: 'bookmark', label: 'Reservation', detail: `${r.tenantName || 'Guest'}`, date: (r['createdAt'] as string) ?? r.reservedUntil ?? null });
    }
    for (const v of this.propVisitors()) {
      if (v.checked_in_at) items.push({ id: `vi-${v.id}`, kind: 'VISITOR', icon: 'badge', label: 'Visitor entered', detail: v.name, date: v.checked_in_at });
    }
    return items.filter((i) => i.date).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')).slice(0, 15);
  });

  /** Module 7 — smart alerts derived from real cached data. */
  readonly alerts = computed<OpsAlert[]>(() => {
    const out: OpsAlert[] = [];
    // Payment overdue (property-scoped overdue invoices — real filtered query).
    const overdue = this.overdueInvoices();
    if (overdue.length) out.push({ id: 'a-overdue', kind: 'PAYMENT', icon: 'error', label: 'Payment overdue', detail: `${overdue.length} overdue invoice${overdue.length > 1 ? 's' : ''}`, cls: 'text-danger bg-danger-subtle', link: '/finance/collections' });
    // Reservation expiring within 24h.
    const expiring = this.reservationsList().filter((r) => {
      if (r.propertyId && r.propertyId !== this.propertyId) return false;
      const d = this.daysUntil(r.reservedUntil ?? null);
      return (r.status ?? 'ACTIVE').toUpperCase() === 'ACTIVE' && d !== null && d >= 0 && d <= 1;
    });
    if (expiring.length) out.push({ id: 'a-resv', kind: 'RESERVATION', icon: 'schedule', label: 'Reservation expiring', detail: `${expiring.length} within 24h`, cls: 'text-warning bg-warning-subtle', link: '/bookings/reservations' });
    // Move-out tomorrow.
    const moveout = this.bookings().filter((b) => b.status === 'CHECKED_IN' && this.daysUntil((b['checkOutDate'] as string) ?? null) === 1);
    if (moveout.length) out.push({ id: 'a-moveout', kind: 'MOVEOUT', icon: 'logout', label: 'Move-out tomorrow', detail: `${moveout.length} resident${moveout.length > 1 ? 's' : ''}`, cls: 'text-warning bg-warning-subtle', link: '/bookings/check-out' });
    // Visitor waiting (pending approval).
    const waiting = this.propVisitors().filter((v) => v.status === 'PENDING');
    if (waiting.length) out.push({ id: 'a-visitor', kind: 'VISITOR', icon: 'badge', label: 'Visitor waiting', detail: `${waiting.length} pending approval`, cls: 'text-accent bg-accent-subtle', link: '/operations/visitors' });
    return out;
  });

  askCheckOut(): void { if (this.occupant()?.bookingId) this.checkOutOpen.set(true); }
  doCheckOut(): void {
    const bookingId = this.occupant()?.bookingId;
    if (!bookingId) return;
    this.acting.set(true); this.actionErr.set(false);
    this.bookingsSvc.checkOut(bookingId).subscribe({
      next: () => {
        this.acting.set(false); this.checkOutOpen.set(false);
        this.actionMsg.set('Resident checked out.');
        this.closeResident(); this.selected.set(null);
        this.reloadBoard(); this.reloadBookings(); this.reloadOverdue();
      },
      error: (e) => { this.acting.set(false); this.actionErr.set(true); this.actionMsg.set(apiErrorMessage(e, 'Could not check out.')); },
    });
  }
  jumpToTransfer(): void { this.closeResident(); }
  sendReminder(): void {
    const invoiceId = this.firstDueInvoiceId();
    if (!invoiceId) return;
    this.acting.set(true); this.actionErr.set(false);
    this.collections.remind(invoiceId).subscribe({
      next: () => {
        this.acting.set(false); this.actionMsg.set('Reminder sent.');
        const tenantId = this.resident()?.id;
        if (tenantId) this.loadResidentTimeline(tenantId, this.residentReq); // targeted: timeline only
      },
      error: (e) => { this.acting.set(false); this.actionErr.set(true); this.actionMsg.set(apiErrorMessage(e, 'Could not send reminder.')); },
    });
  }

  changeStatus(bed: ApiBed, s: Status): void {
    this.err.set(false);
    this.inv.setStatus(bed.id, s).subscribe({
      next: () => { bed.status = s; this.board.set({ ...this.board() }); this.err.set(false); this.msg.set('Status updated to ' + this.label(s)); this.resolveContext(); },
      error: () => { this.err.set(true); this.msg.set('Could not update this bed.'); },
    });
  }

  // ── Bed transfer ───────────────────────────────────────────────────────────
  readonly acting = signal(false);
  transferTarget = '';
  readonly transferTargets = computed(() => {
    const cur = this.selected()?.id;
    return this.board().rooms.flatMap((r) =>
      r.beds
        .filter((b) => b.id !== cur && this.status(b) === 'AVAILABLE')
        .map((b) => ({ id: b.id, label: b.label ?? b.bedNumber ?? '', unit: r.name, pricePaisa: b.pricePaisa ?? 0 })),
    );
  });
  transfer(bed: ApiBed): void {
    if (!this.transferTarget) return;
    this.acting.set(true); this.err.set(false);
    this.inv.transferBed(bed.id, this.transferTarget).subscribe({
      next: () => {
        this.acting.set(false); this.msg.set('Tenant transferred.'); this.transferTarget = '';
        this.selected.set(null);
        this.reloadBoard(); this.reloadBookings();
      },
      error: (e) => { this.acting.set(false); this.err.set(true); this.msg.set(apiErrorMessage(e, 'Could not transfer.')); },
    });
  }

  // ── Bulk selection & actions ───────────────────────────────────────────────
  readonly selectMode = signal(false);
  readonly selectedBeds = signal<Set<string>>(new Set());
  readonly bulkBusy = signal(false);
  readonly bulkMsg = signal<string | null>(null);
  readonly bulkErr = signal(false);
  toggleSelectMode(): void {
    this.selectMode.update((v) => !v);
    if (!this.selectMode()) { this.selectedBeds.set(new Set()); this.bulkMsg.set(null); }
  }
  toggleBedSelection(bedId: string): void {
    const next = new Set(this.selectedBeds());
    if (next.has(bedId)) next.delete(bedId); else next.add(bedId);
    this.selectedBeds.set(next);
  }
  private selectedBedObjects(): { bed: ApiBed; room: BoardRoom }[] {
    const ids = this.selectedBeds();
    return this.board().rooms.flatMap((r) => r.beds.filter((b) => ids.has(b.id)).map((bed) => ({ bed, room: r })));
  }
  bulkStatus(s: Status): void {
    const targets = this.selectedBedObjects().filter(({ bed }) => !['OCCUPIED', 'RESERVED', 'VACATING_SOON'].includes(this.status(bed)) || s === 'AVAILABLE');
    const skipped = this.selectedBeds().size - targets.length;
    if (!targets.length) { this.bulkErr.set(true); this.bulkMsg.set('No selected beds can be set to ' + this.label(s) + '.'); return; }
    this.bulkBusy.set(true); this.bulkErr.set(false); this.bulkMsg.set(null);
    let done = 0, failed = 0;
    for (const { bed } of targets) {
      this.inv.setStatus(bed.id, s).subscribe({
        next: () => {
          bed.status = s; done++;
          if (done + failed === targets.length) this.finishBulk(done, failed, skipped, s);
        },
        error: () => {
          failed++;
          if (done + failed === targets.length) this.finishBulk(done, failed, skipped, s);
        },
      });
    }
  }
  private finishBulk(done: number, failed: number, skipped: number, s: Status): void {
    this.board.set({ ...this.board() });
    this.bulkBusy.set(false);
    this.bulkErr.set(failed > 0);
    const parts = [`${done} set to ${this.label(s)}`];
    if (failed) parts.push(`${failed} failed`);
    if (skipped) parts.push(`${skipped} skipped (occupied/reserved)`);
    this.bulkMsg.set(parts.join(' · '));
  }
  exportCsv(): void {
    const rows = this.selectedBedObjects().map(({ bed, room }) => {
      const bName = this.board().buildings.find((b) => b.id === room.buildingId)?.name ?? '';
      return [bName, `Floor ${room.floor}`, room.name, bed.label ?? bed.bedNumber ?? '', this.status(bed),
        ((bed.pricePaisa ?? 0) / 100).toFixed(0), this.bedResident(bed.id) ?? ''];
    });
    const csv = ['Building,Floor,Unit,Bed,Status,Monthly Rent (INR),Resident',
      ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'inventory-beds.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  printBoard(): void { window.print(); }

  // ── Structure management (edit/delete building · floor · room) ────────────
  readonly editBuilding = signal<BoardBuilding | null>(null);
  readonly editFloor = signal<BoardFloor | null>(null);
  readonly editRoom = signal<BoardRoom | null>(null);
  readonly saving = signal(false);
  readonly confirmDelete = signal(false);
  readonly manageMsg = signal<string | null>(null);
  readonly manageErr = signal(false);

  protected readonly roomTypes = ['SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD', 'DORMITORY', 'STUDIO'];
  protected readonly furnishings = ['FULLY_FURNISHED', 'SEMI_FURNISHED', 'UNFURNISHED'];
  roomTypeName(t: string): string { return ROOM_TYPE_LABEL[t] ?? this.label(t); }

  bForm = { name: '', description: '', sortOrder: 0 };
  fForm: { floorNumber: number | null; label: string } = { floorNumber: null, label: '' };
  rForm = { roomNumber: '', roomType: 'DOUBLE', furnishing: 'SEMI_FURNISHED', acAvailable: false, attachedBathroom: false, balcony: false, areaSqft: null as number | null, description: '' };

  /** Existing media rendered inside the edit drawers (loaded when a drawer opens). */
  readonly buildingMedia = signal<MediaItem[]>([]);
  readonly roomMedia = signal<MediaItem[]>([]);
  private bSnap = '';
  private fSnap = '';
  private rSnap = '';

  /** Deleting is restricted to owner / super-admin on the backend; mirror it in the UI. */
  /** Inventory writes are PROPERTY_OPERATIONS; the backend narrows DELETE
   *  further to owner/SUPER_ADMIN, which A3 leaves untouched. */
  canDelete(): boolean { return this.session.hasCapability('PROPERTY_OPERATIONS'); }

  floorEntity(floorNo: number): BoardFloor | null {
    return this.board().floors.find((f) => f.buildingId === this.building() && f.floorNumber === floorNo) ?? null;
  }
  floorLabel(floorNo: number): string {
    const l = this.floorEntity(floorNo)?.label;
    return l ? ` · ${l}` : '';
  }

  /** Human-readable blockers preventing room deletion (mirrors backend ROOM_HAS_OCCUPANTS). */
  roomBlockers(r: BoardRoom): string[] {
    const reasons: string[] = [];
    const count = (s: Status) => r.beds.filter((b) => this.status(b) === s).length;
    const occ = count('OCCUPIED'), rsv = count('RESERVED'), vac = count('VACATING_SOON');
    if (occ) reasons.push(`${occ} occupied bed${occ > 1 ? 's' : ''}`);
    if (rsv) reasons.push(`${rsv} reserved bed${rsv > 1 ? 's' : ''}`);
    if (vac) reasons.push(`${vac} bed${vac > 1 ? 's' : ''} vacating soon`);
    return reasons;
  }
  buildingBlockers(b: BoardBuilding): string[] {
    const rooms = this.board().rooms.filter((r) => r.buildingId === b.id);
    const reasons: string[] = [];
    for (const room of rooms) {
      for (const reason of this.roomBlockers(room)) reasons.push(`Unit ${room.name}: ${reason}`);
    }
    return reasons.slice(0, 6);
  }
  openRoomFirstBed(r: BoardRoom): void {
    const bed = r.beds.find((b) => this.status(b) === 'OCCUPIED' || this.status(b) === 'RESERVED') ?? r.beds[0];
    this.closeManage();
    if (bed) this.open(bed, r);
  }

  private resetManage(): void { this.confirmDelete.set(false); this.manageMsg.set(null); this.manageErr.set(false); }
  closeManage(): void {
    this.editBuilding.set(null); this.editFloor.set(null); this.editRoom.set(null);
    this.resetManage();
  }

  openEditBuilding(b: BoardBuilding): void {
    this.resetManage();
    this.bForm = { name: b.name, description: b.description ?? '', sortOrder: b.sortOrder ?? 0 };
    this.bSnap = JSON.stringify(this.bForm);
    this.buildingMedia.set([]);
    this.uploads.list('building', b.id).subscribe({ next: (m) => this.buildingMedia.set(m), error: () => {} });
    this.editBuilding.set(b);
  }
  openEditFloor(f: BoardFloor): void {
    this.resetManage();
    this.fForm = { floorNumber: f.floorNumber, label: f.label ?? '' };
    this.fSnap = JSON.stringify(this.fForm);
    this.editFloor.set(f);
  }
  openEditRoom(r: BoardRoom): void {
    this.resetManage();
    this.rForm = {
      roomNumber: r.name, roomType: r.roomType ?? 'DOUBLE', furnishing: r.furnishing ?? 'SEMI_FURNISHED',
      acAvailable: !!r.acAvailable, attachedBathroom: !!r.attachedBathroom, balcony: !!r.balcony,
      areaSqft: r.areaSqft ?? null, description: r.description ?? '',
    };
    this.rSnap = JSON.stringify(this.rForm);
    this.roomMedia.set([]);
    this.uploads.list('room', r.id).subscribe({ next: (m) => this.roomMedia.set(m), error: () => {} });
    this.editRoom.set(r);
  }

  // ── Unsaved changes guard ──────────────────────────────────────────────────
  readonly discardOpen = signal(false);
  private pendingDiscard: (() => void) | null = null;
  private leaveResolver: ((leave: boolean) => void) | null = null;

  /** True while an edit drawer is open with modifications vs its opening snapshot. */
  isDirty(): boolean {
    if (this.editBuilding() && JSON.stringify(this.bForm) !== this.bSnap) return true;
    if (this.editFloor() && JSON.stringify(this.fForm) !== this.fSnap) return true;
    if (this.editRoom() && JSON.stringify(this.rForm) !== this.rSnap) return true;
    return false;
  }
  /** Run `fn` immediately, or after the user confirms discarding unsaved edits. */
  private guard(fn: () => void): void {
    if (!this.isDirty()) { this.closeManage(); fn(); return; }
    this.pendingDiscard = () => { this.closeManage(); fn(); };
    this.discardOpen.set(true);
  }
  requestCloseManage(): void {
    if (!this.isDirty()) { this.closeManage(); return; }
    this.pendingDiscard = () => this.closeManage();
    this.discardOpen.set(true);
  }
  keepEditing(): void {
    this.discardOpen.set(false);
    this.pendingDiscard = null;
    if (this.leaveResolver) { this.leaveResolver(false); this.leaveResolver = null; }
  }
  discardChanges(): void {
    this.discardOpen.set(false);
    const fn = this.pendingDiscard;
    this.pendingDiscard = null;
    if (fn) fn();
    if (this.leaveResolver) { this.leaveResolver(true); this.leaveResolver = null; }
  }
  /** Route-level CanDeactivate hook: resolves via the Unsaved Changes dialog. */
  canLeave(): boolean | Promise<boolean> {
    if (!this.isDirty()) return true;
    this.discardOpen.set(true);
    return new Promise<boolean>((resolve) => { this.leaveResolver = resolve; });
  }
  @HostListener('document:keydown.escape')
  onEscape(): void {
    // Close the top-most overlay first (Module 14 — keyboard navigation).
    if (this.discardOpen()) { this.keepEditing(); return; }
    if (this.checkOutOpen()) { this.checkOutOpen.set(false); return; }
    if (this.editBuilding() || this.editFloor() || this.editRoom()) { this.requestCloseManage(); return; }
    if (this.residentOpen()) { this.closeResident(); return; }
    if (this.selected()) { this.selected.set(null); return; }
  }

  // ── Structure save / delete ────────────────────────────────────────────────
  private manageDone(msg: string, close = false): void {
    this.saving.set(false); this.manageErr.set(false); this.manageMsg.set(msg);
    this.bSnap = JSON.stringify(this.bForm);
    this.fSnap = JSON.stringify(this.fForm);
    this.rSnap = JSON.stringify(this.rForm);
    if (close) this.closeManage();
    this.reloadBoard();
  }
  private manageFail(e: unknown, fallback: string): void {
    this.saving.set(false); this.manageErr.set(true); this.manageMsg.set(apiErrorMessage(e, fallback));
  }

  saveBuilding(b: BoardBuilding): void {
    const name = this.bForm.name.trim();
    if (!name) return;
    this.saving.set(true); this.manageMsg.set(null);
    this.inv.updateBuilding(b.id, { name, description: this.bForm.description.trim() || undefined, sortOrder: Number(this.bForm.sortOrder) || 0 }).subscribe({
      next: () => this.manageDone('Building updated.'),
      error: (e) => this.manageFail(e, 'Could not update building.'),
    });
  }
  removeBuilding(b: BoardBuilding): void {
    this.saving.set(true); this.manageMsg.set(null);
    this.inv.deleteBuilding(b.id).subscribe({
      next: () => this.manageDone('Building deleted.', true),
      error: (e) => this.manageFail(e, 'Could not delete building.'),
    });
  }
  saveFloor(f: BoardFloor): void {
    if (this.fForm.floorNumber === null || this.fForm.floorNumber < 0) return;
    this.saving.set(true); this.manageMsg.set(null);
    this.inv.updateFloor(f.id, { floorNumber: Number(this.fForm.floorNumber), label: this.fForm.label.trim() || undefined }).subscribe({
      next: () => this.manageDone('Floor updated.'),
      error: (e) => this.manageFail(e, 'Could not update floor.'),
    });
  }
  saveRoom(r: BoardRoom): void {
    const roomNumber = this.rForm.roomNumber.trim();
    if (!roomNumber) return;
    this.saving.set(true); this.manageMsg.set(null);
    const dto: Record<string, unknown> = {
      roomNumber, roomType: this.rForm.roomType, furnishing: this.rForm.furnishing,
      acAvailable: this.rForm.acAvailable, attachedBathroom: this.rForm.attachedBathroom, balcony: this.rForm.balcony,
      description: this.rForm.description.trim() || undefined,
    };
    if (this.rForm.areaSqft !== null && `${this.rForm.areaSqft}` !== '') dto['areaSqft'] = Number(this.rForm.areaSqft);
    this.inv.updateRoom(r.floorId, r.id, dto).subscribe({
      next: () => this.manageDone('Room updated.'),
      error: (e) => this.manageFail(e, 'Could not update room.'),
    });
  }
  removeRoom(r: BoardRoom): void {
    this.saving.set(true); this.manageMsg.set(null);
    this.inv.deleteRoom(r.floorId, r.id).subscribe({
      next: () => this.manageDone('Room deleted.', true),
      error: (e) => this.manageFail(e, 'Could not delete room.'),
    });
  }

  // ── Presentation helpers ───────────────────────────────────────────────────
  status(b: ApiBed): Status { return (b.status?.toUpperCase() as Status) || 'AVAILABLE'; }
  letter(i: number): string { return String.fromCharCode(65 + i); }
  pad(n: number): string { return String(n).padStart(2, '0'); }
  label(s: string): string { return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' '); }
  roomTypeLabel(r: BoardRoom): string { return r.roomType ? (ROOM_TYPE_LABEL[r.roomType] ?? r.roomType) : 'Room'; }
  timelineIcon(kind: string): string {
    switch (kind) {
      case 'PAYMENT': return 'payments';
      case 'REMINDER': return 'notifications';
      case 'KYC': return 'verified_user';
      case 'VISITOR': return 'badge';
      case 'MOVE_IN': case 'CHECK_IN': return 'login';
      case 'CHECK_OUT': return 'logout';
      case 'BOOKING': return 'event';
      case 'RESERVATION': return 'bookmark';
      default: return 'receipt_long';
    }
  }

  tileClass(b: ApiBed): string {
    switch (this.status(b)) {
      case 'OCCUPIED': return 'bg-[var(--primary-container)] border-transparent text-white';
      case 'RESERVED': return 'bg-warning-subtle border-warning/30 text-warning';
      case 'MAINTENANCE': return 'bg-danger-subtle border-danger/30 text-danger';
      case 'VACATING_SOON': return 'bg-accent-subtle border-accent/30 text-accent';
      case 'BLOCKED': return 'bg-canvas border-border text-faint';
      default: return 'bg-panel border-border text-faint hover:border-border-strong';
    }
  }
  dotClass(b: ApiBed): string {
    switch (this.status(b)) {
      case 'MAINTENANCE': return 'bg-danger';
      case 'VACATING_SOON': return 'bg-accent';
      default: return 'bg-warning';
    }
  }
}
