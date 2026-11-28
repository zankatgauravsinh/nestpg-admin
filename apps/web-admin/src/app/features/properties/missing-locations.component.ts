import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PropertiesService, PropertyWithoutLocation } from '../../core/data/properties.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { IconComponent } from '../../shared/components/icon.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { LocationPickerComponent } from '../../shared/components/location-picker.component';
import { LatLng } from '../../core/maps/google-maps.service';

const STATUS_LABEL: Record<string, string> = { ACTIVE: 'Live', PENDING_REVIEW: 'In review', PAUSED: 'Paused' };

/**
 * Listings with no map pin (Super / Ops — PROPERTY_OPERATIONS).
 *
 * A listing without its exact location is missing from the residents' map view
 * and from "Near me", and can't be submitted or approved. Live listings come
 * first, then those with the most current bookings. Read-only on purpose: the pin
 * is the owner's to place, from the Owner app (Edit property → Address).
 * Loading, empty and error are distinct — "could not load" never reads as "none missing".
 */
@Component({
  selector: 'os-missing-locations',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IconComponent, ModalComponent, LocationPickerComponent],
  template: `
    <div class="p-4 sm:p-6 max-w-[1400px] mx-auto">
      <header class="mb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p class="text-[11px] font-semibold tracking-wider text-accent uppercase">Properties</p>
          <h1 class="text-2xl font-bold text-content">Missing locations</h1>
          <p class="text-sm text-muted mt-1 max-w-3xl">
            These listings have no pin on the map, so residents can’t see them on the map or with “Near me”, and they
            can’t be submitted or approved. Pin one here, or the owner pins it in the Owner app (Edit property, then Address).
          </p>
        </div>
        @if (!loading() && !error() && rows().length) {
          <button (click)="exportCsv()" data-testid="export-csv"
                  class="self-start sm:self-auto h-9 px-4 rounded-lg border border-border bg-panel text-[13px] font-semibold text-content inline-flex items-center gap-2 shrink-0">
            <os-icon name="download" [size]="16" /> Export CSV
          </button>
        }
      </header>

      @if (loading()) {
        <div data-testid="loc-loading" class="rounded-xl border border-border bg-panel p-10 text-center"><p class="text-sm text-muted">Loading listings without a location…</p></div>
      } @else if (error(); as err) {
        <div data-testid="loc-error" class="rounded-xl border border-danger/40 bg-danger-subtle p-8 text-center">
          <os-icon name="error" [size]="28" />
          <p class="mt-2 text-sm font-semibold text-content">The report could not be loaded.</p>
          <p class="text-sm text-muted">{{ err }}</p>
          <button (click)="reload()" class="mt-4 h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold">Try again</button>
        </div>
      } @else if (rows().length === 0) {
        <div data-testid="loc-empty" class="rounded-xl border border-border bg-panel p-10 text-center">
          <os-icon name="task_alt" [size]="28" />
          <p class="mt-2 text-sm font-semibold text-content">Every listing is pinned on the map.</p>
        </div>
      } @else {
        <div class="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <div class="rounded-xl border border-border bg-panel p-4" data-testid="tile-total"><p class="text-[11px] uppercase text-faint">Not pinned</p><p class="text-2xl font-bold text-content">{{ rows().length }}</p></div>
          <div class="rounded-xl border border-border bg-panel p-4" data-testid="tile-live"><p class="text-[11px] uppercase text-faint">Live listings</p><p class="text-2xl font-bold text-content">{{ live() }}</p></div>
          <div class="rounded-xl border border-warning/40 bg-warning-subtle p-4" data-testid="tile-bookings"><p class="text-[11px] uppercase text-faint">With current bookings</p><p class="text-2xl font-bold text-content">{{ withBookings() }}</p></div>
        </div>
        @if (done(); as d) { <p class="mb-3 rounded-lg border border-success/40 bg-success-subtle px-3 py-2 text-[13px] text-content" data-testid="pin-done">{{ d }}</p> }
        <input [ngModel]="query()" (ngModelChange)="query.set($event)" data-testid="loc-search" type="search"
               placeholder="Search property, area, city or owner phone" aria-label="Search property, area, city or owner phone"
               class="mb-4 w-full md:w-80 h-9 px-3 rounded-lg border border-border bg-panel text-sm text-content" />
        @if (shown().length === 0) {
          <div data-testid="loc-no-match" class="rounded-xl border border-border bg-panel p-8 text-center"><p class="text-sm text-muted">No listings match.</p></div>
        } @else {
          <div class="overflow-x-auto rounded-xl border border-border bg-panel">
            <table class="w-full text-[13px]" data-testid="loc-table">
              <thead><tr class="text-left text-[11px] uppercase text-faint">
                <th class="px-4 py-2 font-medium">Property</th><th class="px-4 py-2 font-medium">Status</th>
                <th class="px-4 py-2 font-medium">Area</th><th class="px-4 py-2 font-medium">Owner</th>
                <th class="px-4 py-2 font-medium text-right">Current bookings</th>
                <th class="px-4 py-2"></th>
              </tr></thead>
              <tbody>
                @for (r of shown(); track r.propertyId) {
                  <tr class="border-t border-border" [attr.data-testid]="'loc-' + r.propertyId">
                    <td class="px-4 py-2 text-content font-medium">{{ r.propertyName }}</td>
                    <td class="px-4 py-2"><span [class]="'text-[11px] font-semibold px-2 py-0.5 rounded-full ' + (r.propertyStatus === 'ACTIVE' ? 'bg-success-subtle text-success' : 'border border-border text-muted')">{{ label(r.propertyStatus) }}</span></td>
                    <td class="px-4 py-2 text-muted">{{ where(r) }}</td>
                    <td class="px-4 py-2">@if (r.ownerPhone) { <a [href]="'tel:' + r.ownerPhone" class="text-accent font-medium">{{ r.ownerPhone }}</a> } @else { — }</td>
                    <td [class]="'px-4 py-2 text-right font-semibold ' + (r.currentBookings ? 'text-warning' : 'text-content')">{{ r.currentBookings }}</td>
                    <td class="px-4 py-2 text-right"><button type="button" (click)="startPin(r)" [attr.data-testid]="'pin-' + r.propertyId" class="h-8 px-3 rounded-lg border border-border text-[13px] font-medium text-content">Pin</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <p class="text-[13px] text-muted mt-3" data-testid="loc-count">Showing {{ shown().length }} of {{ rows().length }}</p>
        }
      }
    </div>

    <os-modal [open]="!!pinning()" [title]="'Pin ' + (pinning()?.propertyName ?? '')" subtitle="Find the address, or tap and drag the pin to the entrance" (closed)="cancelPin()">
      @if (pinning(); as r) {
        <p class="text-[13px] text-muted mb-3" data-testid="pin-address">{{ fullAddress(r) }}</p>
        <os-location-picker [value]="draftPin()" [address]="fullAddress(r)" (pinChange)="draftPin.set($event)" />
        @if (pinError(); as e) { <p class="text-[13px] text-danger mt-2" data-testid="pin-error">{{ e }}</p> }
      }
      <div footer>
        <button (click)="cancelPin()" class="h-9 px-4 rounded-lg border border-border text-sm font-medium text-content">Cancel</button>
        <button (click)="savePin()" [disabled]="!draftPin() || savingPin()" data-testid="pin-save"
          class="h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-60">{{ savingPin() ? 'Saving…' : 'Save pin' }}</button>
      </div>
    </os-modal>
  `,
})
export class MissingLocationsComponent {
  private readonly svc = inject(PropertiesService);
  readonly rows = signal<PropertyWithoutLocation[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly query = signal('');
  readonly live = computed(() => this.rows().filter((r) => r.propertyStatus === 'ACTIVE').length);
  readonly withBookings = computed(() => this.rows().filter((r) => r.currentBookings > 0).length);
  readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.rows();
    return this.rows().filter((r) => [r.propertyName, r.areaLocality, r.city, r.ownerPhone ?? ''].some((f) => f.toLowerCase().includes(q)));
  });

  readonly pinning = signal<PropertyWithoutLocation | null>(null);
  readonly draftPin = signal<LatLng | null>(null);
  readonly savingPin = signal(false);
  readonly pinError = signal<string | null>(null);
  readonly done = signal<string | null>(null);

  constructor() { this.reload(); }

  fullAddress(r: PropertyWithoutLocation): string { return [r.addressLine1, r.areaLocality, r.city, r.state, r.pincode].filter(Boolean).join(', '); }
  startPin(r: PropertyWithoutLocation): void { this.pinError.set(null); this.draftPin.set(null); this.done.set(null); this.pinning.set(r); }
  cancelPin(): void { if (!this.savingPin()) this.pinning.set(null); }

  /** Only the pin is sent: nothing else about the owner's listing changes. */
  savePin(): void {
    const r = this.pinning(); const p = this.draftPin();
    if (!r || !p || this.savingPin()) return;
    this.savingPin.set(true); this.pinError.set(null);
    this.svc.update(r.propertyId, { latitude: p.lat, longitude: p.lng }).subscribe({
      next: () => {
        this.savingPin.set(false); this.pinning.set(null);
        this.rows.update((rows) => rows.filter((x) => x.propertyId !== r.propertyId));
        this.done.set(`${r.propertyName} is pinned. It now shows on the residents’ map.`);
      },
      error: (e) => { this.savingPin.set(false); this.pinError.set(apiErrorMessage(e, 'The pin could not be saved.')); },
    });
  }

  reload(): void {
    this.loading.set(true); this.error.set(null);
    this.svc.propertiesWithoutLocation().subscribe({
      next: (r) => { this.rows.set(r.properties ?? []); this.loading.set(false); },
      error: (e) => { this.error.set(apiErrorMessage(e, 'Please try again.')); this.loading.set(false); },
    });
  }

  label(s: string): string { return STATUS_LABEL[s] ?? s; }
  where(r: PropertyWithoutLocation): string { return [r.areaLocality, r.city].filter(Boolean).join(', ') || '—'; }

  exportCsv(): void {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Property', 'Status', 'Area', 'City', 'Owner phone', 'Current bookings'].map(esc).join(',')]
      .concat(this.shown().map((r) => [r.propertyName, this.label(r.propertyStatus), r.areaLocality, r.city, r.ownerPhone ?? '', r.currentBookings].map(esc).join(',')));
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'missing-locations.csv'; a.click();
    URL.revokeObjectURL(url);
  }
}
