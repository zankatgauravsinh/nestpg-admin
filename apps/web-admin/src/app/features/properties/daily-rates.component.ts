import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PropertiesService, BedWithoutDailyRate } from '../../core/data/properties.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { IconComponent } from '../../shared/components/icon.component';

/** Property statuses, most urgent first: a live listing is taking bookings now. */
const STATUS_ORDER = ['ACTIVE', 'PENDING_REVIEW', 'DRAFT', 'REJECTED', 'PAUSED', 'ARCHIVED'];
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Live', PENDING_REVIEW: 'In review', DRAFT: 'Draft', REJECTED: 'Rejected', PAUSED: 'Paused', ARCHIVED: 'Archived',
};
/** Bed states with a stay on them now or about to start — the final part-month of these can't be billed. */
const WITH_STAY = new Set(['OCCUPIED', 'RESERVED', 'VACATING_SOON']);

export interface DailyRateGroup {
  propertyId: string;
  propertyName: string;
  propertyStatus: string;
  city: string;
  ownerPhone: string | null;
  beds: BedWithoutDailyRate[];
  withStay: number;
}

/**
 * Beds missing a daily rate (Super / Ops).
 *
 * A monthly stay rarely ends on a billing date — notice ends it mid-month — and
 * those last days are billed at the bed's daily rate. A bed without one can't be
 * billed for them, and its property can't go to review. This page turns the
 * server's report (`GET /admin/beds/without-daily-price`) into a chase list,
 * grouped by property with the owner's phone, live listings first.
 *
 * Read-only on purpose: the daily rate is the owner's commercial decision and is
 * set once, from the Owner app. Loading, empty and error are three distinct
 * states — "could not load" never reads as "nothing missing".
 */
@Component({
  selector: 'os-daily-rates',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IconComponent],
  template: `
    <div class="p-4 sm:p-6 max-w-[1400px] mx-auto">
      <header class="mb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p class="text-[11px] font-semibold tracking-wider text-accent uppercase">Properties</p>
          <h1 class="text-2xl font-bold text-content">Missing daily rates</h1>
          <p class="text-sm text-muted mt-1 max-w-3xl">
            When a stay ends part-way through a month, for example after notice, the last days are charged at the bed’s
            daily rate. These beds have none, so those days can’t be billed and their property can’t go to review.
            Owners set the rate once, in the Owner app under Inventory.
          </p>
        </div>
        @if (!loading() && !error() && beds().length) {
          <button (click)="exportCsv()" data-testid="export-csv"
                  class="self-start sm:self-auto h-9 px-4 rounded-lg border border-border bg-panel text-[13px] font-semibold text-content inline-flex items-center gap-2 shrink-0">
            <os-icon name="download" [size]="16" /> Export CSV
          </button>
        }
      </header>

      @if (loading()) {
        <div data-testid="rates-loading" class="rounded-xl border border-border bg-panel p-10 text-center">
          <p class="text-sm text-muted">Loading beds without a daily rate…</p>
        </div>
      } @else if (error(); as err) {
        <div data-testid="rates-error" class="rounded-xl border border-danger/40 bg-danger-subtle p-8 text-center">
          <os-icon name="error" [size]="28" />
          <p class="mt-2 text-sm font-semibold text-content">The report could not be loaded.</p>
          <p class="text-sm text-muted">{{ err }}</p>
          <button (click)="reload()" class="mt-4 h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold">Try again</button>
        </div>
      } @else if (beds().length === 0) {
        <div data-testid="rates-empty" class="rounded-xl border border-border bg-panel p-10 text-center">
          <os-icon name="task_alt" [size]="28" />
          <p class="mt-2 text-sm font-semibold text-content">Every bed has a daily rate.</p>
          <p class="text-sm text-muted">Final part-months can be billed on every stay.</p>
        </div>
      } @else {
        <!-- Summary -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <div class="rounded-xl border border-border bg-panel p-4" data-testid="tile-beds">
            <p class="text-[11px] uppercase text-faint">Beds missing a rate</p>
            <p class="text-2xl font-bold text-content">{{ beds().length }}</p>
          </div>
          <div class="rounded-xl border border-border bg-panel p-4" data-testid="tile-properties">
            <p class="text-[11px] uppercase text-faint">Properties</p>
            <p class="text-2xl font-bold text-content">{{ allGroups().length }}</p>
          </div>
          <div class="rounded-xl border border-border bg-panel p-4" data-testid="tile-live">
            <p class="text-[11px] uppercase text-faint">In live listings</p>
            <p class="text-2xl font-bold text-content">{{ liveBeds() }}</p>
          </div>
          <div class="rounded-xl border border-warning/40 bg-warning-subtle p-4" data-testid="tile-stays">
            <p class="text-[11px] uppercase text-faint">With a current stay</p>
            <p class="text-2xl font-bold text-content">{{ withStay() }}</p>
            <p class="text-[11px] text-muted">Occupied, reserved or vacating soon</p>
          </div>
        </div>

        <!-- Filters -->
        <div class="flex flex-col md:flex-row md:items-center gap-3 mb-4">
          <div class="flex flex-wrap gap-2" role="group" aria-label="Filter by listing status">
            @for (f of filters(); track f.key) {
              <button (click)="status.set(f.key)" [attr.aria-pressed]="status() === f.key" [attr.data-testid]="'filter-' + f.key"
                      [class]="'h-8 px-3 rounded-full text-[13px] font-medium border ' +
                        (status() === f.key ? 'bg-accent text-white border-accent' : 'border-border text-content bg-panel')">
                {{ f.label }} · {{ f.count }}
              </button>
            }
          </div>
          <input [ngModel]="query()" (ngModelChange)="query.set($event)" data-testid="rates-search" type="search"
                 placeholder="Search property, city or owner phone" aria-label="Search property, city or owner phone"
                 class="md:ml-auto w-full md:w-72 h-9 px-3 rounded-lg border border-border bg-panel text-sm text-content" />
        </div>

        @if (groups().length === 0) {
          <div data-testid="rates-no-match" class="rounded-xl border border-border bg-panel p-8 text-center">
            <p class="text-sm text-muted">No properties match this filter.</p>
          </div>
        } @else {
          <div class="space-y-3" data-testid="rates-list">
            @for (g of groups(); track g.propertyId) {
              <article class="rounded-xl border border-border bg-panel p-4" [attr.data-testid]="'rates-' + g.propertyId">
                <div class="flex flex-col sm:flex-row sm:items-start gap-3">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 flex-wrap">
                      <h2 class="text-base font-semibold text-content truncate">{{ g.propertyName }}</h2>
                      <span [class]="'text-[11px] font-semibold px-2 py-0.5 rounded-full ' +
                        (g.propertyStatus === 'ACTIVE' ? 'bg-success-subtle text-success' : 'border border-border text-muted')">
                        {{ statusLabel(g.propertyStatus) }}
                      </span>
                    </div>
                    <p class="text-[13px] text-muted">
                      {{ g.city || '—' }} · Owner
                      @if (g.ownerPhone) { <a [href]="'tel:' + g.ownerPhone" class="text-accent font-medium">{{ g.ownerPhone }}</a> } @else { — }
                    </p>
                  </div>
                  <div class="flex items-center gap-4 shrink-0">
                    <div class="text-center">
                      <p class="text-sm font-semibold text-content">{{ g.beds.length }}</p>
                      <p class="text-[10px] uppercase text-faint">{{ g.beds.length === 1 ? 'Bed' : 'Beds' }}</p>
                    </div>
                    <div class="text-center">
                      <p [class]="'text-sm font-semibold ' + (g.withStay ? 'text-warning' : 'text-content')">{{ g.withStay }}</p>
                      <p class="text-[10px] uppercase text-faint">With a stay</p>
                    </div>
                  </div>
                </div>
                <ul class="mt-3 flex flex-wrap gap-1.5" [attr.aria-label]="'Beds without a daily rate at ' + g.propertyName">
                  @for (b of g.beds; track b.bedId) {
                    <li class="text-[12px] px-2 py-1 rounded-md bg-canvas border border-border text-content">
                      Room {{ b.roomNumber }} · Bed {{ b.bedNumber }}
                      @if (hasStay(b)) { <span class="text-warning font-medium"> · {{ bedStatusLabel(b.bedStatus) }}</span> }
                    </li>
                  }
                </ul>
              </article>
            }
          </div>
          <p class="text-[13px] text-muted mt-4" data-testid="rates-count">
            Showing {{ shownBeds() }} of {{ beds().length }} beds in {{ groups().length }} of {{ allGroups().length }} properties
          </p>
        }
      }
    </div>
  `,
})
export class DailyRatesComponent {
  private readonly svc = inject(PropertiesService);

  readonly beds = signal<BedWithoutDailyRate[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly status = signal<string>('ALL');
  readonly query = signal('');

  /** Every property with a bed missing a rate: live first, then most beds with a stay, then most beds. */
  readonly allGroups = computed<DailyRateGroup[]>(() => {
    const by = new Map<string, DailyRateGroup>();
    for (const b of this.beds()) {
      let g = by.get(b.propertyId);
      if (!g) {
        g = { propertyId: b.propertyId, propertyName: b.propertyName, propertyStatus: b.propertyStatus,
              city: b.city, ownerPhone: b.ownerPhone, beds: [], withStay: 0 };
        by.set(b.propertyId, g);
      }
      g.beds.push(b);
      if (WITH_STAY.has(b.bedStatus)) g.withStay += 1;
    }
    const rank = (s: string) => { const i = STATUS_ORDER.indexOf(s); return i < 0 ? STATUS_ORDER.length : i; };
    return [...by.values()]
      .map((g) => ({ ...g, beds: [...g.beds].sort((a, b) =>
        a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }) || a.bedNumber.localeCompare(b.bedNumber, undefined, { numeric: true })) }))
      .sort((a, b) => rank(a.propertyStatus) - rank(b.propertyStatus) || b.withStay - a.withStay
        || b.beds.length - a.beds.length || a.propertyName.localeCompare(b.propertyName));
  });

  readonly filters = computed(() => {
    const counts = new Map<string, number>();
    for (const g of this.allGroups()) counts.set(g.propertyStatus, (counts.get(g.propertyStatus) ?? 0) + 1);
    const present = STATUS_ORDER.filter((s) => counts.has(s)).concat([...counts.keys()].filter((s) => !STATUS_ORDER.includes(s)));
    return [{ key: 'ALL', label: 'All', count: this.allGroups().length },
      ...present.map((s) => ({ key: s, label: this.statusLabel(s), count: counts.get(s) ?? 0 }))];
  });

  readonly groups = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.allGroups().filter((g) =>
      (this.status() === 'ALL' || g.propertyStatus === this.status())
      && (!q || g.propertyName.toLowerCase().includes(q) || g.city.toLowerCase().includes(q) || (g.ownerPhone ?? '').includes(q)));
  });

  readonly shownBeds = computed(() => this.groups().reduce((n, g) => n + g.beds.length, 0));
  readonly liveBeds = computed(() => this.beds().filter((b) => b.propertyStatus === 'ACTIVE').length);
  readonly withStay = computed(() => this.beds().filter((b) => WITH_STAY.has(b.bedStatus)).length);

  constructor() { this.reload(); }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.bedsWithoutDailyRate().subscribe({
      next: (r) => { this.beds.set(r?.beds ?? []); this.loading.set(false); },
      error: (e) => { this.error.set(apiErrorMessage(e, 'Could not load the report.')); this.loading.set(false); },
    });
  }

  statusLabel(s: string): string { return STATUS_LABEL[s] ?? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' '); }
  bedStatusLabel(s: string): string { return s === 'VACATING_SOON' ? 'vacating soon' : s.toLowerCase(); }
  hasStay(b: BedWithoutDailyRate): boolean { return WITH_STAY.has(b.bedStatus); }

  /** The rows currently shown, one per bed, for Ops to work through or share. */
  exportCsv(): void {
    const cell = (v: unknown) => {
      const s = String(v ?? '');
      // Quote everything; neutralise spreadsheet formulas.
      return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
    };
    const header = ['Property', 'Listing status', 'City', 'Owner phone', 'Room', 'Bed', 'Bed status'];
    const lines = this.groups().flatMap((g) => g.beds.map((b) =>
      [g.propertyName, this.statusLabel(g.propertyStatus), g.city, g.ownerPhone ?? '', b.roomNumber, b.bedNumber, b.bedStatus].map(cell).join(',')));
    const blob = new Blob([[header.map(cell).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `beds-without-daily-rate-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
