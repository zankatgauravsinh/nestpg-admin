import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import { PropertiesService } from '../../core/data/properties.service';
import { UsersService, ApiUser, userDisplayName } from '../../core/data/users.service';
import { UploadService } from '../../core/data/upload.service';
import { SessionStore } from '../../core/auth/session.store';
import { apiErrorMessage } from '../../core/http/api-error';
import { IconComponent } from '../../shared/components/icon.component';

interface WizardData {
  // Step 1
  name: string; type: string; gender: string; description: string; status: 'DRAFT' | 'ACTIVE'; coverImageUrl: string;
  // Step 2
  country: string; state: string; city: string; area: string; pincode: string; addressLine1: string;
  latitude: string; longitude: string;
  // Step 3
  buildingsCount: number; floorsCount: number; roomsCount: number; totalBeds: number;
  roomTypes: string[]; amenities: string[];
  // Step 4
  managerId: string; ownerId: string; emergencyContact: string; supportContact: string;
  checkInTime: string; checkOutTime: string; noticePeriodDays: number; lockInMonths: number;
  // Step 5
  rentMin: number | null; rentMax: number | null; depositMonths: number; lateFee: string;
  maintenanceCharges: number | null; utilityCharges: number | null; gstApplicable: boolean;
}

const STORAGE = 'nestpg.property-wizard';

function blank(): WizardData {
  return {
    name: '', type: 'PG', gender: 'UNISEX', description: '', status: 'DRAFT', coverImageUrl: '',
    country: 'India', state: '', city: '', area: '', pincode: '', addressLine1: '', latitude: '', longitude: '',
    buildingsCount: 1, floorsCount: 1, roomsCount: 0, totalBeds: 0, roomTypes: [], amenities: [],
    managerId: '', ownerId: '', emergencyContact: '', supportContact: '', checkInTime: '12:00', checkOutTime: '11:00',
    noticePeriodDays: 30, lockInMonths: 0,
    rentMin: null, rentMax: null, depositMonths: 1, lateFee: '', maintenanceCharges: null, utilityCharges: null, gstApplicable: false,
  };
}

@Component({
  selector: 'os-create-property-wizard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, IconComponent],
  template: `
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <a routerLink="/properties" class="inline-flex items-center gap-1 text-[13px] text-muted hover:text-content mb-1.5"><os-icon name="arrow_back" [size]="16" /> Portfolio</a>
        <h1 class="text-[26px] font-semibold tracking-tight text-content">Create property</h1>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[12px] text-faint flex items-center gap-1"><os-icon name="cloud_done" [size]="15" /> {{ savedAt() }}</span>
        <button (click)="saveDraft()" [disabled]="saving()" class="h-9 px-3.5 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas transition">Save draft</button>
      </div>
    </div>

    <!-- Stepper (sticky) -->
    <div class="sticky top-0 z-20 bg-canvas/90 backdrop-blur -mx-1 px-1 py-3 mb-6 border-b border-border">
      <div class="flex items-center">
        @for (s of steps; track s.n; let i = $index) {
          <button (click)="goto(s.n)" class="flex items-center gap-2 shrink-0" [disabled]="s.n > maxReached()">
            <span class="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-semibold transition"
              [class]="step() === s.n ? 'bg-accent text-white' : s.n < step() ? 'bg-success text-white' : 'bg-canvas border border-border text-muted'">
              @if (s.n < step()) { <os-icon name="check" [size]="16" /> } @else { {{ s.n }} }
            </span>
            <span class="text-[13px] font-medium hidden lg:block" [class]="step() === s.n ? 'text-content' : 'text-muted'">{{ s.label }}</span>
          </button>
          @if (!$last) { <div class="flex-1 h-px mx-2" [class]="s.n < step() ? 'bg-success' : 'bg-border'"></div> }
        }
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">
      <!-- Step panel -->
      <div class="bg-panel border border-border rounded-[16px] p-6 min-h-[420px]">
        @switch (step()) {
          @case (1) {
            <h2 class="text-lg font-semibold text-content mb-1">Basic information</h2>
            <p class="text-sm text-muted mb-5">Name your property and describe what it is.</p>
            <div class="space-y-4">
              <div><label class="lbl">Property name *</label><input [(ngModel)]="d.name" placeholder="Sunrise Residency" class="fld" /></div>
              <div class="grid sm:grid-cols-2 gap-4">
                <div><label class="lbl">Property type *</label>
                  <div class="flex flex-wrap gap-2">@for (t of types; track t.v) { <button type="button" (click)="d.type=t.v" class="chip" [class.chip-on]="d.type===t.v">{{ t.l }}</button> }</div></div>
                <div><label class="lbl">Gender</label>
                  <div class="flex flex-wrap gap-2">@for (g of genders; track g.v) { <button type="button" (click)="d.gender=g.v" class="chip" [class.chip-on]="d.gender===g.v">{{ g.l }}</button> }</div></div>
              </div>
              <div><label class="lbl">Description</label><textarea [(ngModel)]="d.description" rows="3" placeholder="A premium co-living space in the heart of the city…" class="fld" style="height:auto;padding:10px 12px"></textarea></div>
              <div class="grid sm:grid-cols-2 gap-4">
                <div><label class="lbl">Status</label>
                  <div class="flex gap-2">@for (s of statuses; track s) { <button type="button" (click)="d.status=s" class="chip" [class.chip-on]="d.status===s">{{ s }}</button> }</div></div>
                <div></div>
              </div>
              <div><label class="lbl">Photos</label>
                <div class="flex flex-wrap gap-2.5">
                  @for (p of previews(); track $index) {
                    <div class="relative w-20 h-20 rounded-xl overflow-hidden border border-border group">
                      <img [src]="p" class="w-full h-full object-cover" alt="" />
                      <button type="button" (click)="removePhoto($index)" class="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"><os-icon name="close" [size]="13" /></button>
                    </div>
                  }
                  <label class="w-20 h-20 rounded-xl border border-dashed border-border-strong flex flex-col items-center justify-center text-faint hover:border-accent hover:text-accent cursor-pointer transition">
                    <os-icon name="add_photo_alternate" [size]="22" />
                    <span class="text-[10px] mt-0.5">Add</span>
                    <input type="file" accept="image/*" multiple class="hidden" (change)="onPickPhotos($event)" />
                  </label>
                </div>
                <p class="text-[11px] text-faint mt-1.5">First photo becomes the cover. Uploaded after the property is created.</p>
              </div>
            </div>
          }
          @case (2) {
            <h2 class="text-lg font-semibold text-content mb-1">Location</h2>
            <p class="text-sm text-muted mb-5">Where is the property?</p>
            <div class="space-y-4">
              <div class="grid sm:grid-cols-3 gap-4">
                <div><label class="lbl">Country</label><input [(ngModel)]="d.country" class="fld" /></div>
                <div><label class="lbl">State *</label><input [(ngModel)]="d.state" placeholder="KA" class="fld" /></div>
                <div><label class="lbl">City *</label><input [(ngModel)]="d.city" placeholder="Bengaluru" class="fld" /></div>
              </div>
              <div class="grid sm:grid-cols-2 gap-4">
                <div><label class="lbl">Area / Locality *</label><input [(ngModel)]="d.area" placeholder="Indiranagar" class="fld" /></div>
                <div><label class="lbl">Pincode *</label><input [(ngModel)]="d.pincode" placeholder="560038" class="fld" /></div>
              </div>
              <div><label class="lbl">Full address *</label><input [(ngModel)]="d.addressLine1" placeholder="14, 100 Feet Road" class="fld" /></div>
              <div class="grid sm:grid-cols-2 gap-4">
                <div><label class="lbl">Latitude</label><input [(ngModel)]="d.latitude" (ngModelChange)="touch()" placeholder="12.9716" class="fld" /></div>
                <div><label class="lbl">Longitude</label><input [(ngModel)]="d.longitude" (ngModelChange)="touch()" placeholder="77.5946" class="fld" /></div>
              </div>
              @if (mapUrl()) {
                <div class="rounded-xl overflow-hidden border border-border"><iframe [src]="mapUrl()" class="w-full h-56" style="border:0" loading="lazy"></iframe></div>
              } @else { <p class="text-xs text-faint flex items-center gap-1"><os-icon name="map" [size]="14" /> Enter latitude &amp; longitude to preview the map.</p> }
            </div>
          }
          @case (3) {
            <h2 class="text-lg font-semibold text-content mb-1">Configuration</h2>
            <p class="text-sm text-muted mb-5">Capacity, room types and amenities.</p>
            <div class="space-y-4">
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div><label class="lbl">Buildings</label><input type="number" [(ngModel)]="d.buildingsCount" class="fld" /></div>
                <div><label class="lbl">Floors</label><input type="number" [(ngModel)]="d.floorsCount" class="fld" /></div>
                <div><label class="lbl">Rooms</label><input type="number" [(ngModel)]="d.roomsCount" class="fld" /></div>
                <div><label class="lbl">Total beds</label><input type="number" [(ngModel)]="d.totalBeds" class="fld" /></div>
              </div>
              <div><label class="lbl">Room types</label>
                <div class="flex flex-wrap gap-2">@for (r of roomTypes; track r) { <button type="button" (click)="toggle('roomTypes', r)" class="chip" [class.chip-on]="d.roomTypes.includes(r)">{{ r }}</button> }</div></div>
              <div><label class="lbl">Amenities</label>
                <div class="flex flex-wrap gap-2">@for (a of amenities; track a) { <button type="button" (click)="toggle('amenities', a)" class="chip" [class.chip-on]="d.amenities.includes(a)"><os-icon [name]="amenityIcon(a)" [size]="15" /> {{ a }}</button> }</div></div>
            </div>
          }
          @case (4) {
            <h2 class="text-lg font-semibold text-content mb-1">Operations</h2>
            <p class="text-sm text-muted mb-5">Team, contacts and stay policy.</p>
            <div class="space-y-4">
              <div class="grid sm:grid-cols-2 gap-4">
                <div><label class="lbl">Property manager</label><select [(ngModel)]="d.managerId" class="fld"><option value="">Unassigned</option>@for (u of managers(); track u.id) { <option [value]="u.id">{{ name(u) }}</option> }</select></div>
                <div><label class="lbl">Owner</label><select [(ngModel)]="d.ownerId" class="fld"><option value="">Me (default)</option>@for (u of owners(); track u.id) { <option [value]="u.id">{{ name(u) }}</option> }</select></div>
              </div>
              <div class="grid sm:grid-cols-2 gap-4">
                <div><label class="lbl">Emergency contact</label><input [(ngModel)]="d.emergencyContact" placeholder="+91 …" class="fld" /></div>
                <div><label class="lbl">Support contact</label><input [(ngModel)]="d.supportContact" placeholder="+91 …" class="fld" /></div>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div><label class="lbl">Check-in</label><input type="time" [(ngModel)]="d.checkInTime" class="fld" /></div>
                <div><label class="lbl">Check-out</label><input type="time" [(ngModel)]="d.checkOutTime" class="fld" /></div>
                <div><label class="lbl">Notice (days)</label><input type="number" [(ngModel)]="d.noticePeriodDays" class="fld" /></div>
                <div><label class="lbl">Lock-in (mo)</label><input type="number" [(ngModel)]="d.lockInMonths" class="fld" /></div>
              </div>
            </div>
          }
          @case (5) {
            <h2 class="text-lg font-semibold text-content mb-1">Financials</h2>
            <p class="text-sm text-muted mb-5">Pricing and charges.</p>
            <div class="space-y-4">
              <div class="grid sm:grid-cols-2 gap-4">
                <div><label class="lbl">Rent — min (₹/mo)</label><input type="number" [(ngModel)]="d.rentMin" placeholder="9000" class="fld" /></div>
                <div><label class="lbl">Rent — max (₹/mo)</label><input type="number" [(ngModel)]="d.rentMax" placeholder="18000" class="fld" /></div>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div><label class="lbl">Deposit (months)</label><input type="number" [(ngModel)]="d.depositMonths" class="fld" /></div>
                <div><label class="lbl">Maintenance (₹)</label><input type="number" [(ngModel)]="d.maintenanceCharges" class="fld" /></div>
                <div><label class="lbl">Utilities (₹)</label><input type="number" [(ngModel)]="d.utilityCharges" class="fld" /></div>
              </div>
              <div><label class="lbl">Late fee rule</label><input [(ngModel)]="d.lateFee" placeholder="₹100/day after 5th" class="fld" /></div>
              <label class="flex items-center gap-2.5 cursor-pointer"><input type="checkbox" [(ngModel)]="d.gstApplicable" class="w-4 h-4 accent-[var(--accent)]" /> <span class="text-sm text-content">GST applicable</span></label>
            </div>
          }
          @case (6) {
            <h2 class="text-lg font-semibold text-content mb-1">Review &amp; create</h2>
            <p class="text-sm text-muted mb-5">Confirm the details before creating.</p>
            <div class="space-y-3">
              @for (sec of review(); track sec.title) {
                <div class="rounded-xl border border-border">
                  <div class="flex items-center justify-between px-4 py-2.5 border-b border-border-subtle">
                    <p class="text-sm font-semibold text-content">{{ sec.title }}</p>
                    <button (click)="goto(sec.step)" class="text-[12px] text-accent font-medium hover:underline">Edit</button>
                  </div>
                  <div class="px-4 py-2 divide-y divide-border-subtle">
                    @for (row of sec.rows; track row[0]) { <div class="flex justify-between py-1.5 gap-4"><span class="text-[13px] text-muted">{{ row[0] }}</span><span class="text-[13px] font-medium text-content text-right">{{ row[1] }}</span></div> }
                  </div>
                </div>
              }
              @if (error()) { <p class="text-[13px] text-danger flex items-center gap-1.5"><os-icon name="error" [size]="15" /> {{ error() }}</p> }
            </div>
          }
        }

        <!-- Nav -->
        <div class="flex items-center justify-between mt-7 pt-5 border-t border-border-subtle">
          <button (click)="back()" [disabled]="step()===1" class="h-10 px-4 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas disabled:opacity-40 flex items-center gap-1.5"><os-icon name="arrow_back" [size]="18" /> Back</button>
          @if (step() < 6) {
            <button (click)="next()" class="h-10 px-5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover flex items-center gap-1.5">Continue <os-icon name="arrow_forward" [size]="18" /></button>
          } @else {
            <button (click)="create()" [disabled]="saving()" class="h-10 px-5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover disabled:opacity-60 flex items-center gap-2">
              @if (saving()) { <span class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span> } Create property
            </button>
          }
        </div>
      </div>

      <!-- Summary sidebar -->
      <aside class="bg-panel border border-border rounded-[16px] p-5 xl:sticky xl:top-24">
        <div class="w-full h-24 rounded-xl mb-4 flex items-center justify-center text-white text-2xl font-bold overflow-hidden"
             [style.background]="d.coverImageUrl ? 'transparent' : 'linear-gradient(135deg,#1e293b,#0b1220)'">
          @if (d.coverImageUrl) { <img [src]="d.coverImageUrl" class="w-full h-full object-cover" alt="" /> } @else { {{ (d.name || 'P').charAt(0) }} }
        </div>
        <p class="text-base font-semibold text-content">{{ d.name || 'Untitled property' }}</p>
        <p class="text-xs text-muted">{{ d.city || 'City' }} · {{ typeLabel() }}</p>
        <div class="mt-4 space-y-2.5 text-[13px]">
          <div class="flex justify-between"><span class="text-muted">Status</span><span class="font-medium text-content">{{ d.status }}</span></div>
          <div class="flex justify-between"><span class="text-muted">Beds</span><span class="font-medium text-content">{{ d.totalBeds || 0 }}</span></div>
          <div class="flex justify-between"><span class="text-muted">Rent</span><span class="font-medium text-content">{{ rentLabel() }}</span></div>
          <div class="flex justify-between"><span class="text-muted">Amenities</span><span class="font-medium text-content">{{ d.amenities.length }}</span></div>
        </div>
        <div class="mt-4 pt-4 border-t border-border-subtle">
          <div class="flex justify-between text-[12px] text-faint mb-1"><span>Completion</span><span>{{ completion() }}%</span></div>
          <div class="h-1.5 rounded-full bg-canvas overflow-hidden"><div class="h-full rounded-full bg-accent transition-all" [style.width.%]="completion()"></div></div>
        </div>
      </aside>
    </div>

    @if (toast()) { <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] bg-[var(--primary-container)] text-white text-sm px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2"><os-icon name="check_circle" [size]="18" /> {{ toast() }}</div> }
  `,
  styles: [`
    .lbl { display:block; font-size:12px; font-weight:500; color:var(--text-secondary); margin-bottom:6px; }
    .fld { width:100%; height:42px; padding:0 12px; border-radius:8px; border:1px solid var(--border); background:var(--panel); font-size:14px; color:var(--text-primary); outline:none; transition:all .15s; }
    .fld:focus { border-color:var(--accent); box-shadow:0 0 0 2px color-mix(in srgb, var(--accent) 15%, transparent); }
    .chip { height:34px; padding:0 12px; border-radius:8px; border:1px solid var(--border); background:var(--panel); font-size:13px; font-weight:500; color:var(--text-secondary); display:inline-flex; align-items:center; gap:6px; cursor:pointer; transition:all .12s; }
    .chip:hover { border-color:var(--border-strong); }
    .chip-on { background:var(--accent); border-color:var(--accent); color:#fff; }
  `],
})
export class CreatePropertyWizardComponent {
  private readonly svc = inject(PropertiesService);
  private readonly usersSvc = inject(UsersService);
  private readonly router = inject(Router);
  private readonly session = inject(SessionStore);
  private readonly san = inject(DomSanitizer);

  private readonly uploads = inject(UploadService);

  protected d: WizardData = this.load();
  // Photos are collected as Files and uploaded AFTER the property record exists
  // (presigned upload needs a server-side entityId). First file becomes cover.
  protected pendingFiles: File[] = [];
  readonly previews = signal<string[]>([]);
  onPickPhotos(e: Event): void {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []).filter((f) => f.type.startsWith('image/'));
    for (const f of files) {
      this.pendingFiles.push(f);
      this.previews.update((l) => [...l, URL.createObjectURL(f)]);
    }
    input.value = '';
  }
  removePhoto(i: number): void {
    const p = this.previews()[i];
    if (p?.startsWith('blob:')) URL.revokeObjectURL(p);
    this.pendingFiles.splice(i, 1);
    this.previews.update((l) => l.filter((_, idx) => idx !== i));
  }
  readonly step = signal(1);
  readonly maxReached = signal(1);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly toast = signal<string | null>(null);
  readonly savedAt = signal('Auto-save on');
  private readonly tick = signal(0); // forces recompute of map/summary on field edits

  private readonly users = toSignal(this.usersSvc.list({ limit: 100 }), { initialValue: [] as ApiUser[] });
  readonly managers = computed(() => this.users().filter((u) => u.role === 'PROP_MANAGER' || u.role === 'CARETAKER'));
  readonly owners = computed(() => this.users().filter((u) => u.role === 'PG_OWNER'));

  /** Phone/name of the owner a property was attributed to, for the confirmation. */
  ownerLabel(id: string): string {
    const u = this.users().find((x) => x.id === id);
    return u ? this.name(u) : 'the selected owner';
  }

  protected readonly steps = [
    { n: 1, label: 'Basics' }, { n: 2, label: 'Location' }, { n: 3, label: 'Configuration' },
    { n: 4, label: 'Operations' }, { n: 5, label: 'Financials' }, { n: 6, label: 'Review' },
  ];
  protected readonly types = [{ v: 'PG', l: 'PG' }, { v: 'HOSTEL', l: 'Hostel' }, { v: 'CO_LIVING', l: 'Co-Living' }, { v: 'APARTMENT', l: 'Apartment' }, { v: 'VILLA', l: 'Villa' }];
  protected readonly genders = [{ v: 'MALE', l: 'Male' }, { v: 'FEMALE', l: 'Female' }, { v: 'UNISEX', l: 'Unisex' }];
  protected readonly statuses: ('DRAFT' | 'ACTIVE')[] = ['DRAFT', 'ACTIVE'];
  protected readonly roomTypes = ['Single Sharing', 'Double Sharing', 'Triple Sharing', 'Quad Sharing'];
  protected readonly amenities = ['WiFi', 'Parking', 'Laundry', 'Food', 'Housekeeping', 'Gym', 'Security'];

  constructor() {
    // Arriving from an owner's portfolio ("create property for this owner")
    // preselects that owner, so the attribution is visible before submission.
    const preset = inject(ActivatedRoute).snapshot.queryParamMap.get('ownerId');
    if (preset) this.d.ownerId = preset;
    // Auto-save (debounced via effect on a tick + step).
    effect(() => { this.tick(); this.step(); this.persist(); });
  }

  // ── persistence ──
  private load(): WizardData {
    try { const raw = localStorage.getItem(STORAGE); if (raw) return { ...blank(), ...JSON.parse(raw) }; } catch { /* ignore */ }
    return blank();
  }
  private persist(): void {
    try { localStorage.setItem(STORAGE, JSON.stringify(this.d)); this.savedAt.set('Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })); } catch { /* ignore */ }
  }
  touch(): void { this.tick.update((v) => v + 1); }

  // ── navigation ──
  next(): void { if (!this.validate(this.step())) return; this.step.update((s) => Math.min(6, s + 1)); this.maxReached.update((m) => Math.max(m, this.step())); this.persist(); }
  back(): void { this.step.update((s) => Math.max(1, s - 1)); }
  goto(n: number): void { if (n <= this.maxReached()) this.step.set(n); }

  private validate(s: number): boolean {
    this.error.set(null);
    if (s === 1 && !this.d.name.trim()) { this.flash('Enter a property name.'); return false; }
    if (s === 2 && (!this.d.state || !this.d.city || !this.d.area || !this.d.pincode || !this.d.addressLine1)) { this.flash('Complete the location fields.'); return false; }
    return true;
  }

  // ── helpers ──
  toggle(key: 'roomTypes' | 'amenities', v: string): void {
    const arr = this.d[key];
    this.d[key] = arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
    this.touch();
  }
  name(u: ApiUser): string { return userDisplayName(u); }
  amenityIcon(a: string): string {
    return { WiFi: 'wifi', Parking: 'local_parking', Laundry: 'local_laundry_service', Food: 'restaurant', Housekeeping: 'cleaning_services', Gym: 'fitness_center', Security: 'shield' }[a] ?? 'check';
  }
  typeLabel(): string { return this.types.find((t) => t.v === this.d.type)?.l ?? this.d.type; }
  rentLabel(): string {
    const f = (n: number | null) => (n ? '₹' + n.toLocaleString('en-IN') : '');
    return this.d.rentMin || this.d.rentMax ? `${f(this.d.rentMin)}${this.d.rentMin && this.d.rentMax ? ' – ' : ''}${f(this.d.rentMax)}` : '—';
  }

  readonly mapUrl = computed<SafeResourceUrl | null>(() => {
    this.tick();
    const { latitude: la, longitude: lo } = this.d;
    if (!la || !lo) return null;
    return this.san.bypassSecurityTrustResourceUrl(`https://maps.google.com/maps?q=${encodeURIComponent(la)},${encodeURIComponent(lo)}&z=15&output=embed`);
  });

  readonly completion = computed(() => {
    this.tick(); this.step();
    const checks = [this.d.name, this.d.city, this.d.area, this.d.pincode, this.d.addressLine1, this.d.totalBeds, this.d.roomTypes.length, this.d.amenities.length, this.d.rentMin, this.d.noticePeriodDays];
    const done = checks.filter(Boolean).length;
    return Math.round((done / checks.length) * 100);
  });

  readonly review = computed(() => { this.tick(); const d = this.d; return [
    { title: 'Property', step: 1, rows: [['Name', d.name || '—'], ['Type', this.typeLabel()], ['Gender', d.gender], ['Status', d.status]] as [string, string][] },
    { title: 'Location', step: 2, rows: [['Address', d.addressLine1 || '—'], ['Area', d.area || '—'], ['City', `${d.city || '—'}, ${d.state || ''}`], ['Pincode', d.pincode || '—'], ['Geo', d.latitude && d.longitude ? `${d.latitude}, ${d.longitude}` : '—']] as [string, string][] },
    { title: 'Capacity', step: 3, rows: [['Buildings', String(d.buildingsCount)], ['Floors', String(d.floorsCount)], ['Rooms', String(d.roomsCount)], ['Beds', String(d.totalBeds)], ['Room types', d.roomTypes.join(', ') || '—'], ['Amenities', d.amenities.join(', ') || '—']] as [string, string][] },
    { title: 'Operations', step: 4, rows: [['Check-in', d.checkInTime], ['Check-out', d.checkOutTime], ['Notice', d.noticePeriodDays + ' days'], ['Lock-in', d.lockInMonths + ' mo']] as [string, string][] },
    { title: 'Financials', step: 5, rows: [['Rent', this.rentLabel()], ['Deposit', d.depositMonths + ' months'], ['Maintenance', d.maintenanceCharges ? '₹' + d.maintenanceCharges : '—'], ['GST', d.gstApplicable ? 'Yes' : 'No']] as [string, string][] },
  ]; });

  // ── property type mapping (backend enum) ──
  private deriveType(): string {
    if (this.d.type === 'CO_LIVING') return 'COLIVING';
    if (this.d.type === 'APARTMENT' || this.d.type === 'VILLA') return 'FAMILY';
    if (this.d.gender === 'MALE') return 'MALE_ONLY';
    if (this.d.gender === 'FEMALE') return 'FEMALE_ONLY';
    return 'COLIVING';
  }

  private payload(): Record<string, unknown> {
    const d = this.d;
    const p: Record<string, unknown> = {
      name: d.name.trim(), propertyType: this.deriveType(), addressLine1: d.addressLine1,
      areaLocality: d.area, city: d.city, state: d.state, pincode: d.pincode,
    };
    if (d.description) p['description'] = d.description;
    if (d.latitude) p['latitude'] = Number(d.latitude);
    if (d.longitude) p['longitude'] = Number(d.longitude);
    if (d.depositMonths && d.rentMax) p['securityDepositPaisa'] = d.depositMonths * d.rentMax * 100;
    if (d.noticePeriodDays) p['noticePeriodDays'] = d.noticePeriodDays;
    p['foodIncluded'] = d.amenities.includes('Food');
    if (d.amenities.length) p['rules'] = d.amenities.map((a) => `Amenity: ${a}`);
    return p;
  }

  // ── actions ──
  saveDraft(): void {
    this.persist();
    this.flashToast('Draft saved locally.');
  }

  /**
   * A4/D3 — the Owner selector used to be decorative: `payload()` never sent
   * it, so a property "created for an owner" was silently created under the
   * admin's own account. Choosing an owner now posts to the admin route, which
   * validates the id server-side (must be a live PG_OWNER) and sets
   * `ownerId` there; leaving it on "Me" keeps the original owner-self-scoped
   * call. The client still proves nothing — the backend re-checks.
   */
  create(): void {
    if (!this.validate(1) || !this.validate(2)) { this.step.set(this.d.name ? 2 : 1); return; }
    this.saving.set(true); this.error.set(null);
    const ownerId = this.d.ownerId?.trim();
    const request = ownerId
      ? this.svc.createForOwner(ownerId, this.payload() as never)
      : this.svc.create(this.payload() as never);
    request.subscribe({
      next: async (created) => {
        // Upload collected photos now that the property id exists (first = cover).
        try { await this.uploadPhotos(created.id); }
        catch { /* non-fatal: property is created; photos can be re-added later */ }
        this.saving.set(false);
        try { localStorage.removeItem(STORAGE); } catch { /* ignore */ }
        this.flashToast(created.ownerId && created.ownerId !== this.session.user()?.id
          ? `Property created for ${this.ownerLabel(created.ownerId)}.`
          : 'Property created.');
        this.router.navigate(['/properties']);
      },
      error: (e) => { this.saving.set(false); this.error.set(apiErrorMessage(e, 'Could not create property.')); },
    });
  }

  /** Presign → PUT → confirm each pending photo against the new property. */
  private async uploadPhotos(propertyId: string): Promise<void> {
    for (let i = 0; i < this.pendingFiles.length; i++) {
      const file = this.pendingFiles[i];
      const scope = i === 0 ? 'property-cover' : 'property-gallery';
      const role = i === 0 ? 'cover' : 'gallery';
      const pre = await firstValueFrom(this.uploads.presign(scope, propertyId, file));
      await lastValueFrom(this.uploads.putToStorage(pre.uploadUrl, file));
      await firstValueFrom(this.uploads.confirm('property', propertyId, pre.key, role, i));
    }
  }

  private flash(m: string): void { this.error.set(m); }
  private flashToast(m: string): void { this.toast.set(m); setTimeout(() => this.toast.set(null), 3000); }
}
