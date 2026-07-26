import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { PropertiesService } from '../../core/data/properties.service';
import { InventoryService } from '../../core/data/inventory.service';
import { ApiService } from '../../core/api/api.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { Property } from '../../core/data/models';
import { MetricCardComponent } from '../../shared/components/metric-card.component';
import { IconComponent } from '../../shared/components/icon.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { ImageUploadComponent } from '../../shared/components/image-upload.component';
import { UploadService, MediaItem } from '../../core/data/upload.service';
import { InrPipe } from '../../shared/pipes/inr.pipe';

interface RawBuilding { id: string; name?: string; floors?: number }

@Component({
  selector: 'os-property-workspace',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule, RouterLink, MetricCardComponent, IconComponent, EmptyStateComponent, ModalComponent, ImageUploadComponent, InrPipe,
  ],
  template: `
    @if (property(); as p) {
      <!-- Hero header -->
      <div class="bg-panel border border-border rounded-[16px] p-6 mb-6">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div class="flex items-start gap-4">
            <div class="w-14 h-14 rounded-2xl bg-accent-subtle text-accent flex items-center justify-center shrink-0">
              <os-icon name="apartment" [size]="28" />
            </div>
            <div>
              <p class="text-[12px] font-semibold uppercase tracking-wider text-accent mb-1">Property Workspace</p>
              <h1 class="text-2xl font-semibold tracking-tight text-content">{{ p.name }}</h1>
              <p class="text-sm text-muted flex items-center gap-1.5 mt-1">
                <os-icon name="location_on" [size]="15" /> {{ p.address }}, {{ p.city }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <a [routerLink]="['/properties', p.id, 'inventory', 'new']" class="h-9 px-3.5 rounded-lg border border-border text-content text-sm font-semibold hover:bg-canvas transition flex items-center gap-1.5">
              <os-icon name="add" [size]="18" /> Add inventory
            </a>
            <a routerLink="/inventory" class="h-9 px-3.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition flex items-center gap-1.5">
              <os-icon name="bed" [size]="18" /> Open inventory
            </a>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <os-metric label="Occupancy" [value]="pct(p) + '%'" icon="pie_chart" [trend]="2.1" />
        <os-metric label="Occupied Beds" [value]="p.occupiedBeds + '/' + p.totalBeds" icon="bed" />
        <os-metric label="Monthly Revenue" [value]="p.monthlyRevenuePaise | inr" icon="payments" [trend]="4.5" />
        <os-metric label="Manager" [value]="p.manager" icon="badge" />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 bg-panel border border-border rounded-[16px] p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-base font-semibold text-content">Buildings &amp; structure</h3>
            <span class="text-xs text-muted">{{ buildings().length }} buildings</span>
          </div>
          @if (buildings().length) {
            <div class="grid sm:grid-cols-2 gap-3">
              @for (b of buildings(); track b.id) {
                <!-- Opens this building's room board (?building= scopes the room
                     list, so rooms from other buildings are never mixed in). -->
                <a routerLink="/inventory" [queryParams]="{ property: id(), building: b.id }"
                  class="rounded-xl border border-border p-4 flex items-center gap-3 hover:bg-canvas transition"
                  [attr.aria-label]="'Open rooms in ' + (b.name ?? 'building')">
                  <span class="w-10 h-10 rounded-lg bg-canvas flex items-center justify-center text-muted"><os-icon name="domain" [size]="20" /></span>
                  <div class="flex-1"><p class="text-sm font-medium text-content">{{ b.name ?? 'Building' }}</p>
                  <p class="text-xs text-faint">{{ b.floors ?? '—' }} floors</p></div>
                  <os-icon name="chevron_right" [size]="18" />
                </a>
              }
            </div>
          } @else {
            <p class="text-sm text-muted py-6 text-center">No buildings configured yet for this property.</p>
          }
        </div>

        <div class="bg-panel border border-border rounded-[16px] p-5">
          <h3 class="text-base font-semibold text-content mb-4">Operational alerts</h3>
          <div class="space-y-3">
            @for (a of alerts; track a.text) {
              <div class="flex items-start gap-3">
                <span class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" [class]="a.cls"><os-icon [name]="a.icon" [size]="16" /></span>
                <p class="text-sm text-content">{{ a.text }}</p>
              </div>
            }
          </div>
        </div>
      </div>

      <!-- Property gallery (presigned upload → key stored as Media) -->
      <div class="bg-panel border border-border rounded-[16px] p-5 mt-4">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-base font-semibold text-content">Property photos</h3>
          <span class="text-xs text-muted">Cover + gallery</span>
        </div>
        <os-image-upload scope="property-gallery" entityType="property" [entityId]="p.id" role="gallery"
          [existing]="galleryMedia()" (mediaChange)="onGallery($event)" />
      </div>
    } @else {
      <os-empty-state icon="apartment" title="Select a property"
        message="Open a property from the portfolio to view its workspace." >
        <a routerLink="/properties" class="h-9 px-3.5 rounded-lg bg-accent text-white text-sm font-semibold inline-flex items-center gap-1.5">
          <os-icon name="arrow_back" [size]="18" /> Back to portfolio
        </a>
      </os-empty-state>
    }

    <!-- Add inventory (quick) -->
    <os-modal [open]="showAdd()" title="Add inventory" subtitle="Creates building → floor → room → beds in one step" (closed)="showAdd.set(false)">
      <form id="invForm" class="space-y-4" (ngSubmit)="submitAdd()">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-[12px] font-medium text-muted mb-1.5">Building *</label><input name="bn" [(ngModel)]="inv.buildingName" placeholder="Block A" class="fld" /></div>
          <div><label class="block text-[12px] font-medium text-muted mb-1.5">Floor # *</label><input name="fl" type="number" [(ngModel)]="inv.floorNumber" placeholder="1" class="fld" /></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-[12px] font-medium text-muted mb-1.5">Room # *</label><input name="rn" [(ngModel)]="inv.roomNumber" placeholder="101" class="fld" /></div>
          <div><label class="block text-[12px] font-medium text-muted mb-1.5">Room type *</label>
            <select name="rt" [(ngModel)]="inv.roomType" class="fld">@for (t of roomTypes; track t) { <option [value]="t">{{ t }}</option> }</select></div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div><label class="block text-[12px] font-medium text-muted mb-1.5">Furnishing</label>
            <select name="fr" [(ngModel)]="inv.furnishing" class="fld">@for (f of furnishings; track f) { <option [value]="f">{{ f }}</option> }</select></div>
          <div><label class="block text-[12px] font-medium text-muted mb-1.5">Beds *</label><input name="bc" type="number" [(ngModel)]="inv.bedCount" placeholder="2" class="fld" /></div>
          <div><label class="block text-[12px] font-medium text-muted mb-1.5">Rent ₹/bed *</label><input name="pr" type="number" [(ngModel)]="rent" placeholder="12000" class="fld" /></div>
        </div>
        @if (addErr()) { <p class="text-[13px] text-danger flex items-center gap-1.5"><os-icon name="error" [size]="15" /> {{ addErr() }}</p> }
      </form>
      <div footer>
        <button (click)="showAdd.set(false)" class="h-9 px-4 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas">Cancel</button>
        <button type="submit" form="invForm" [disabled]="adding()" class="h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover disabled:opacity-60 flex items-center gap-2">
          @if (adding()) { <span class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span> }
          Create
        </button>
      </div>
    </os-modal>
    @if (toast()) { <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] bg-[var(--primary-container)] text-white text-sm px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2"><os-icon name="check_circle" [size]="18" /> {{ toast() }}</div> }
  `,
  styles: [`
    .fld { width:100%; height:40px; padding:0 12px; border-radius:8px; border:1px solid var(--border);
      background:var(--panel); font-size:14px; color:var(--text-primary); outline:none; }
    .fld:focus { border-color:var(--accent); box-shadow:0 0 0 2px color-mix(in srgb, var(--accent) 15%, transparent); }
  `],
})
export class PropertyWorkspaceComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly svc = inject(PropertiesService);
  private readonly api = inject(ApiService);
  private readonly invSvc = inject(InventoryService);
  private readonly uploads = inject(UploadService);

  readonly galleryMedia = signal<MediaItem[]>([]);
  onGallery(media: MediaItem[]): void { this.galleryMedia.set(media); }

  // Add-inventory modal state
  readonly showAdd = signal(false);
  readonly adding = signal(false);
  readonly addErr = signal<string | null>(null);
  readonly toast = signal<string | null>(null);
  private addPropertyId = '';
  protected inv = { buildingName: '', floorNumber: 1, roomNumber: '', roomType: 'DOUBLE', furnishing: 'SEMI_FURNISHED', bedCount: 2 };
  protected rent: number | null = null;
  protected readonly roomTypes = ['SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD', 'DORMITORY', 'STUDIO'];
  protected readonly furnishings = ['FULLY_FURNISHED', 'SEMI_FURNISHED', 'UNFURNISHED'];

  openAdd(propertyId: string): void {
    this.addPropertyId = propertyId;
    this.inv = { buildingName: '', floorNumber: 1, roomNumber: '', roomType: 'DOUBLE', furnishing: 'SEMI_FURNISHED', bedCount: 2 };
    this.rent = null; this.addErr.set(null); this.showAdd.set(true);
  }

  submitAdd(): void {
    const v = this.inv;
    if (!v.buildingName || !v.roomNumber || !this.rent || !v.bedCount) { this.addErr.set('Fill building, room, beds and rent.'); return; }
    this.adding.set(true); this.addErr.set(null);
    this.invSvc.quickAddUnit(this.addPropertyId, { ...v, pricePaisa: this.rent * 100 }).subscribe({
      next: () => { this.adding.set(false); this.showAdd.set(false); this.toast.set(`Added ${v.bedCount} beds to room ${v.roomNumber}.`); setTimeout(() => this.toast.set(null), 3500); },
      error: (e) => { this.adding.set(false); this.addErr.set(apiErrorMessage(e, 'Could not add inventory.')); },
    });
  }

  protected readonly id = signal(this.route.snapshot.queryParamMap.get('id') ?? '');
  private readonly list = toSignal(this.svc.list(), { initialValue: [] as Property[] });
  readonly buildings = signal<RawBuilding[]>([]);

  /** Selected property resolved from the list endpoint (falls back to first). */
  readonly property = computed<Property | null>(() => {
    const list = this.list();
    if (!list.length) return null;
    return list.find((p) => p.id === this.id()) ?? list[0];
  });

  constructor() {
    const pid = this.id();
    if (pid) {
      this.api
        .get<RawBuilding[]>(`/properties/${pid}/buildings`)
        .pipe(catchError(() => of([] as RawBuilding[])))
        .subscribe((b) => this.buildings.set(b));
      this.uploads
        .list('property', pid)
        .pipe(catchError(() => of([] as MediaItem[])))
        .subscribe((m) => this.galleryMedia.set(m));
    }
  }

  protected readonly alerts = [
    { text: '3 rooms pending maintenance sign-off', icon: 'build', cls: 'bg-warning-subtle text-warning' },
    { text: '2 leases expiring within 30 days', icon: 'event', cls: 'bg-info-subtle text-info' },
    { text: 'Collection rate healthy at 94%', icon: 'trending_up', cls: 'bg-success-subtle text-success' },
  ];

  pct(p: Property): number { return p.totalBeds ? Math.round((p.occupiedBeds / p.totalBeds) * 100) : 0; }
}
