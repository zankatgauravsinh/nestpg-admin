import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import { PropertiesService } from '../../core/data/properties.service';
import { InventoryService } from '../../core/data/inventory.service';
import { UploadService } from '../../core/data/upload.service';
import { Property } from '../../core/data/models';
import { IconComponent } from '../../shared/components/icon.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { InrPipe } from '../../shared/pipes/inr.pipe';

type Kind = 'building' | 'floor' | 'room' | 'bed';
interface Node {
  id: string; kind: Kind; name: string; collapsed: boolean; children: Node[];
  cfg: Record<string, unknown>;
}

let SEQ = 1;
const uid = () => 'n' + (SEQ++);
const STORAGE = (pid: string) => `nestpg.inv-draft.${pid}`;

const ROOM_TYPES = ['SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD', 'DORMITORY', 'STUDIO'];
const CAPACITY: Record<string, number> = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3, QUAD: 4, DORMITORY: 6, STUDIO: 1 };
const ROOM_AMENITIES = ['AC', 'Attached Washroom', 'Balcony', 'Study Table', 'Cupboard'];
const BED_STATUS = ['AVAILABLE', 'RESERVED', 'OCCUPIED', 'MAINTENANCE'];

@Component({
  selector: 'os-add-inventory-workspace',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, IconComponent, ModalComponent, InrPipe],
  template: `
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div>
        <a [routerLink]="['/properties']" class="inline-flex items-center gap-1 text-[13px] text-muted hover:text-content mb-1"><os-icon name="arrow_back" [size]="16" /> Portfolio</a>
        <h1 class="text-[24px] font-semibold tracking-tight text-content">Add Inventory</h1>
        <p class="text-sm text-muted">Add buildings, floors, rooms, and beds to {{ property()?.name ?? 'this property' }}.</p>
      </div>
      <div class="flex items-center gap-2">
        <a routerLink="/properties" class="h-9 px-3.5 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas">Cancel</a>
        <button (click)="saveDraft()" class="h-9 px-3.5 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas">Save Draft</button>
        <button (click)="publish()" [disabled]="publishing()" class="h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover disabled:opacity-60 flex items-center gap-2">
          @if (publishing()) { <span class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span> } Publish Inventory
        </button>
      </div>
    </div>

    <!-- Bulk toolbar -->
    <div class="flex flex-wrap items-center gap-2 mb-4">
      <button (click)="openRoomGen()" class="tb"><os-icon name="grid_view" [size]="16" /> Generate Rooms</button>
      <button (click)="genBeds()" [disabled]="selected()?.kind !== 'room'" class="tb"><os-icon name="bed" [size]="16" /> Generate Beds</button>
      <button (click)="cloneFloor()" [disabled]="selected()?.kind !== 'floor'" class="tb"><os-icon name="content_copy" [size]="16" /> Clone Floor</button>
      <button (click)="cloneBuilding()" [disabled]="selected()?.kind !== 'building'" class="tb"><os-icon name="domain_add" [size]="16" /> Clone Building</button>
      <button (click)="toast.set('CSV import — endpoint pending.'); clear()" class="tb"><os-icon name="upload_file" [size]="16" /> Import CSV</button>
    </div>

    @if (msg()) { <div class="mb-4 rounded-lg px-3 py-2 text-[13px] flex items-center gap-2" [class]="err() ? 'bg-danger-subtle text-danger' : 'bg-success-subtle text-success'"><os-icon [name]="err()?'error':'check_circle'" [size]="16" /> {{ msg() }}</div> }

    <div class="grid grid-cols-1 xl:grid-cols-[280px_1fr_320px] gap-4 items-start">
      <!-- LEFT: tree -->
      <section class="bg-panel border border-border rounded-[16px] p-3 xl:h-[calc(100vh-260px)] xl:overflow-y-auto os-scroll">
        <div class="flex items-center justify-between px-2 py-1.5 mb-1">
          <p class="text-[11px] font-semibold uppercase tracking-wider text-faint">{{ property()?.name ?? 'Property' }}</p>
          <button (click)="addBuilding()" class="text-accent text-[12px] font-semibold hover:underline flex items-center gap-0.5"><os-icon name="add" [size]="14" /> Building</button>
        </div>
        @if (rows().length) {
          @for (r of rows(); track r.node.id) {
            <div class="flex items-center gap-1 rounded-lg px-1.5 py-1.5 cursor-pointer group" [class]="selected()?.id === r.node.id ? 'bg-accent-subtle' : 'hover:bg-canvas'"
                 [style.paddingLeft.px]="8 + r.depth*16" (click)="select(r.node)">
              @if (r.node.children.length || r.node.kind !== 'bed') {
                <button (click)="$event.stopPropagation(); r.node.collapsed = !r.node.collapsed; bump()" class="w-4 h-4 flex items-center justify-center text-faint shrink-0">
                  @if (r.node.kind !== 'bed') { <os-icon [name]="r.node.collapsed ? 'chevron_right' : 'expand_more'" [size]="16" /> }
                </button>
              } @else { <span class="w-4 shrink-0"></span> }
              <os-icon [name]="icon(r.node.kind)" [size]="15" [class]="selected()?.id === r.node.id ? 'text-accent' : 'text-muted'" />
              <span class="text-[13px] truncate flex-1" [class]="selected()?.id === r.node.id ? 'text-accent font-medium' : 'text-content'">{{ r.node.name }}</span>
              @if (childKind(r.node.kind); as ck) {
                <button (click)="$event.stopPropagation(); addChild(r.node)" [title]="'Add ' + ck" class="h-5 px-1.5 rounded flex items-center gap-0.5 text-[10px] font-semibold text-faint hover:text-accent hover:bg-accent-subtle shrink-0"><os-icon name="add" [size]="13" /> {{ ckLabel(ck) }}</button>
              }
              <button (click)="$event.stopPropagation(); remove(r.node.id)" title="Delete" class="w-5 h-5 rounded flex items-center justify-center text-faint hover:text-danger shrink-0 opacity-60 hover:opacity-100"><os-icon name="delete" [size]="14" /></button>
            </div>
          }
        } @else {
          <div class="text-center py-10 px-3"><os-icon name="account_tree" [size]="26" class="text-faint" /><p class="text-xs text-muted mt-2">Start by adding a building.</p>
            <button (click)="addBuilding()" class="mt-3 h-8 px-3 rounded-lg bg-accent text-white text-[12px] font-semibold">+ Add Building</button></div>
        }
      </section>

      <!-- CENTER: config -->
      <section class="bg-panel border border-border rounded-[16px] p-5 min-h-[420px]">
        @if (selected(); as n) {
          <div class="flex items-center justify-between mb-4 gap-3">
            <div class="flex items-center gap-2"><os-icon [name]="icon(n.kind)" [size]="18" class="text-accent" /><h2 class="text-base font-semibold text-content capitalize">{{ n.kind }} configuration</h2></div>
            @if (childKind(n.kind); as ck) {
              <div class="flex items-center gap-2">
                @if (n.kind === 'floor') { <button (click)="openRoomGen()" class="h-8 px-3 rounded-lg border border-border text-[12px] font-medium text-content hover:bg-canvas flex items-center gap-1"><os-icon name="grid_view" [size]="14" /> Generate rooms</button> }
                <button (click)="addChild(n)" class="h-8 px-3 rounded-lg bg-accent text-white text-[12px] font-semibold hover:bg-accent-hover flex items-center gap-1"><os-icon name="add" [size]="14" /> Add {{ ckLabel(ck) }}</button>
              </div>
            }
          </div>
          @switch (n.kind) {
            @case ('building') {
              <div class="space-y-4">
                <div><label class="lbl">Building name *</label><input [(ngModel)]="n.name" (ngModelChange)="bump()" class="fld" /></div>
                <div class="grid sm:grid-cols-2 gap-4">
                  <div><label class="lbl">Building code</label><input [ngModel]="n.cfg['code']" (ngModelChange)="set(n,'code',$event)" placeholder="BLK-A" class="fld" /></div>
                  <div><label class="lbl">Status</label><div class="flex gap-2">@for (s of ['ACTIVE','INACTIVE']; track s) { <button type="button" (click)="set(n,'status',s)" class="chip" [class.chip-on]="n.cfg['status']===s">{{ s }}</button> }</div></div>
                </div>
                <div><label class="lbl">Description</label><input [ngModel]="n.cfg['description']" (ngModelChange)="set(n,'description',$event)" class="fld" /></div>
                <div><label class="lbl">Images</label>
                  <div class="flex flex-wrap gap-2.5">
                    @for (p of previewsOf(n); track $index) {
                      <div class="relative w-16 h-16 rounded-lg overflow-hidden border border-border group">
                        <img [src]="p" class="w-full h-full object-cover" alt="" />
                        <button type="button" (click)="removeNodeImg(n,$index)" class="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100"><os-icon name="close" [size]="11" /></button>
                      </div>
                    }
                    <label class="w-16 h-16 rounded-lg border border-dashed border-border-strong flex items-center justify-center text-faint hover:border-accent hover:text-accent cursor-pointer"><os-icon name="add_photo_alternate" [size]="18" /><input type="file" accept="image/*" multiple class="hidden" (change)="onPickNode(n,$event)" /></label>
                  </div>
                  <p class="text-[11px] text-faint mt-1">Uploaded after publishing.</p>
                </div>
              </div>
            }
            @case ('floor') {
              <div class="space-y-4">
                <div class="grid sm:grid-cols-2 gap-4">
                  <div><label class="lbl">Floor name *</label><input [(ngModel)]="n.name" (ngModelChange)="bump()" class="fld" /></div>
                  <div><label class="lbl">Floor number *</label><input type="number" [ngModel]="n.cfg['floorNumber']" (ngModelChange)="set(n,'floorNumber',$event)" class="fld" /></div>
                </div>
                <div><label class="lbl">Description</label><input [ngModel]="n.cfg['description']" (ngModelChange)="set(n,'description',$event)" class="fld" /></div>
              </div>
            }
            @case ('room') {
              <div class="space-y-4">
                <div class="grid sm:grid-cols-2 gap-4">
                  <div><label class="lbl">Room number *</label><input [ngModel]="n.cfg['roomNumber']" (ngModelChange)="set(n,'roomNumber',$event); n.name='Room '+$event; bump()" class="fld" /></div>
                  <div><label class="lbl">Room type</label><select [ngModel]="n.cfg['roomType']" (ngModelChange)="set(n,'roomType',$event)" class="fld">@for (t of roomTypes; track t) { <option [value]="t">{{ t }}</option> }</select></div>
                </div>
                <div class="grid sm:grid-cols-3 gap-4">
                  <div><label class="lbl">Category</label><select [ngModel]="n.cfg['category']" (ngModelChange)="set(n,'category',$event)" class="fld">@for (c of ['Standard','Premium','Deluxe']; track c) { <option [value]="c">{{ c }}</option> }</select></div>
                  <div><label class="lbl">Monthly rent (₹)</label><input type="number" [ngModel]="n.cfg['rent']" (ngModelChange)="set(n,'rent',$event)" class="fld" /></div>
                  <div><label class="lbl">Deposit (₹)</label><input type="number" [ngModel]="n.cfg['deposit']" (ngModelChange)="set(n,'deposit',$event)" class="fld" /></div>
                </div>
                <div><label class="lbl">Description</label><input [ngModel]="n.cfg['description']" (ngModelChange)="set(n,'description',$event)" class="fld" /></div>
                <div><label class="lbl">Amenities</label><div class="flex flex-wrap gap-2">@for (a of roomAmenities; track a) { <button type="button" (click)="toggleAmenity(n,a)" class="chip" [class.chip-on]="amen(n).includes(a)">{{ a }}</button> }</div></div>
                <div><label class="lbl">Room images</label>
                  <div class="flex flex-wrap gap-2.5">
                    @for (p of previewsOf(n); track $index) {
                      <div class="relative w-16 h-16 rounded-lg overflow-hidden border border-border group">
                        <img [src]="p" class="w-full h-full object-cover" alt="" />
                        <button type="button" (click)="removeNodeImg(n,$index)" class="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100"><os-icon name="close" [size]="11" /></button>
                      </div>
                    }
                    <label class="w-16 h-16 rounded-lg border border-dashed border-border-strong flex items-center justify-center text-faint hover:border-accent hover:text-accent cursor-pointer"><os-icon name="add_photo_alternate" [size]="18" /><input type="file" accept="image/*" multiple class="hidden" (change)="onPickNode(n,$event)" /></label>
                  </div>
                  <p class="text-[11px] text-faint mt-1">Uploaded after publishing.</p>
                </div>
                <div class="flex items-center justify-between pt-1">
                  <p class="text-xs text-muted">Beds {{ n.children.length }} / capacity {{ capacity(n) }}</p>
                  <button (click)="genBeds()" class="h-8 px-3 rounded-lg border border-border text-[12px] font-medium text-content hover:bg-canvas">Generate beds</button>
                </div>
              </div>
            }
            @case ('bed') {
              <div class="space-y-4">
                <div class="grid sm:grid-cols-2 gap-4">
                  <div><label class="lbl">Bed label *</label><input [ngModel]="n.cfg['label']" (ngModelChange)="set(n,'label',$event); n.name='Bed '+$event; bump()" class="fld" /></div>
                  <div><label class="lbl">Status</label><select [ngModel]="n.cfg['status']" (ngModelChange)="set(n,'status',$event)" class="fld">@for (s of bedStatus; track s) { <option [value]="s">{{ s }}</option> }</select></div>
                </div>
                <div class="grid sm:grid-cols-2 gap-4">
                  <div><label class="lbl">Monthly rent (₹)</label><input type="number" [ngModel]="n.cfg['rent']" (ngModelChange)="set(n,'rent',$event)" class="fld" /></div>
                  <div><label class="lbl">Deposit (₹)</label><input type="number" [ngModel]="n.cfg['deposit']" (ngModelChange)="set(n,'deposit',$event)" class="fld" /></div>
                </div>
              </div>
            }
          }
        } @else {
          <div class="flex flex-col items-center justify-center text-center h-full py-16"><os-icon name="touch_app" [size]="28" class="text-faint" /><p class="text-sm font-medium text-content mt-3">Select a node to configure</p><p class="text-xs text-muted mt-1">Or add a building to begin.</p></div>
        }
      </section>

      <!-- RIGHT: live preview -->
      <aside class="bg-panel border border-border rounded-[16px] p-5 xl:sticky xl:top-4">
        <p class="text-[11px] font-semibold uppercase tracking-wider text-faint mb-3">Inventory summary</p>
        <div class="grid grid-cols-2 gap-2 mb-4">
          <div class="rounded-xl bg-canvas p-3"><p class="text-lg font-semibold text-content">{{ count('building') }}</p><p class="text-[10px] text-faint uppercase">Buildings</p></div>
          <div class="rounded-xl bg-canvas p-3"><p class="text-lg font-semibold text-content">{{ count('floor') }}</p><p class="text-[10px] text-faint uppercase">Floors</p></div>
          <div class="rounded-xl bg-canvas p-3"><p class="text-lg font-semibold text-content">{{ count('room') }}</p><p class="text-[10px] text-faint uppercase">Rooms</p></div>
          <div class="rounded-xl bg-canvas p-3"><p class="text-lg font-semibold text-content">{{ count('bed') }}</p><p class="text-[10px] text-faint uppercase">Beds</p></div>
        </div>
        <div class="rounded-xl border border-border divide-y divide-border-subtle mb-4">
          <div class="flex justify-between px-3 py-2"><span class="text-[13px] text-muted">Capacity</span><span class="text-[13px] font-medium text-content">{{ count('bed') }} beds</span></div>
          <div class="flex justify-between px-3 py-2"><span class="text-[13px] text-muted">Projected revenue</span><span class="text-[13px] font-semibold text-content">{{ projectedRevenue() | inr }}/mo</span></div>
        </div>

        <p class="text-[11px] font-semibold uppercase tracking-wider text-faint mb-2">Room preview</p>
        <div class="space-y-2.5 max-h-72 overflow-y-auto os-scroll pr-1">
          @for (room of previewRooms(); track room.id) {
            <div class="rounded-xl border border-border p-3">
              <p class="text-[13px] font-semibold text-content mb-2">Room {{ room.cfg['roomNumber'] || room.name }}</p>
              <div class="flex flex-wrap gap-1.5">
                @for (bed of room.children; track bed.id) {
                  <span class="flex items-center gap-1 text-[11px] text-muted"><span class="w-2.5 h-2.5 rounded-full" [class]="dot(bed)"></span>{{ bed.cfg['label'] || bed.name }}</span>
                }
                @if (!room.children.length) { <span class="text-[11px] text-faint">No beds</span> }
              </div>
            </div>
          } @empty { <p class="text-xs text-faint">Rooms appear here as you build.</p> }
        </div>
        <div class="flex flex-wrap gap-3 mt-3 pt-3 border-t border-border-subtle text-[11px] text-muted">
          <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-[var(--primary-container)]"></span>Occupied</span>
          <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-warning"></span>Reserved</span>
          <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-success"></span>Available</span>
          <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-danger"></span>Maintenance</span>
        </div>
      </aside>
    </div>

    <!-- Room generator modal -->
    <os-modal [open]="showGen()" title="Generate rooms" subtitle="Bulk-create a numbered range of rooms with beds" (closed)="showGen.set(false)">
      <form id="gen" class="space-y-4" (ngSubmit)="generateRooms()">
        @if (floorOptions().length) {
          <div><label class="lbl2">Target floor *</label><select [(ngModel)]="gen.floorId" name="fl" class="fld">@for (f of floorOptions(); track f.id) { <option [value]="f.id">{{ f.label }}</option> }</select></div>
        } @else { <p class="text-[13px] text-danger">Add a building &amp; floor first.</p> }
        <div class="grid grid-cols-2 gap-3">
          <div><label class="lbl2">Start room #</label><input type="number" [(ngModel)]="gen.start" name="s" class="fld" /></div>
          <div><label class="lbl2">End room #</label><input type="number" [(ngModel)]="gen.end" name="e" class="fld" /></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="lbl2">Room type</label><select [(ngModel)]="gen.type" name="t" class="fld">@for (t of roomTypes; track t) { <option [value]="t">{{ t }}</option> }</select></div>
          <div><label class="lbl2">Rent / room (₹)</label><input type="number" [(ngModel)]="gen.rent" name="r" class="fld" /></div>
        </div>
        <p class="text-[12px] text-muted">Creates rooms {{ gen.start }}–{{ gen.end }} with {{ capFor(gen.type) }} beds each.</p>
      </form>
      <div footer>
        <button (click)="showGen.set(false)" class="h-9 px-4 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas">Cancel</button>
        <button type="submit" form="gen" [disabled]="!floorOptions().length" class="h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover disabled:opacity-60">Generate</button>
      </div>
    </os-modal>
    @if (toast()) { <div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] bg-[var(--primary-container)] text-white text-sm px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2"><os-icon name="check_circle" [size]="18" /> {{ toast() }}</div> }
  `,
  styles: [`
    .lbl { display:block; font-size:12px; font-weight:500; color:var(--text-secondary); margin-bottom:6px; }
    .lbl2 { display:block; font-size:12px; font-weight:500; color:var(--text-secondary); margin-bottom:6px; }
    .fld { width:100%; height:40px; padding:0 12px; border-radius:8px; border:1px solid var(--border); background:var(--panel); font-size:14px; color:var(--text-primary); outline:none; }
    .fld:focus { border-color:var(--accent); box-shadow:0 0 0 2px color-mix(in srgb, var(--accent) 15%, transparent); }
    .chip { height:32px; padding:0 12px; border-radius:8px; border:1px solid var(--border); background:var(--panel); font-size:13px; font-weight:500; color:var(--text-secondary); cursor:pointer; }
    .chip-on { background:var(--accent); border-color:var(--accent); color:#fff; }
    .tb { height:34px; padding:0 12px; border-radius:8px; border:1px solid var(--border); background:var(--panel); font-size:13px; font-weight:500; color:var(--text-primary); display:inline-flex; align-items:center; gap:6px; cursor:pointer; }
    .tb:hover:not(:disabled) { border-color:var(--accent); color:var(--accent); }
    .tb:disabled { opacity:.45; cursor:not-allowed; }
  `],
})
export class AddInventoryWorkspaceComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly propsSvc = inject(PropertiesService);
  private readonly inv = inject(InventoryService);
  private readonly uploads = inject(UploadService);

  readonly propertyId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly property = toSignal(this.propsSvc.get(this.propertyId), { initialValue: null as Property | null });

  private buildings: Node[] = [];
  private readonly rev = signal(0);
  readonly selected = signal<Node | null>(null);
  readonly publishing = signal(false);
  readonly msg = signal<string | null>(null);
  readonly err = signal(false);
  readonly toast = signal<string | null>(null);

  protected readonly roomTypes = ROOM_TYPES;
  protected readonly roomAmenities = ROOM_AMENITIES;
  protected readonly bedStatus = BED_STATUS;

  readonly showGen = signal(false);
  protected gen = { floorId: '', start: 101, end: 110, type: 'DOUBLE', rent: 10000 };

  constructor() {
    this.restore();
    effect(() => { this.rev(); this.persist(); });
  }
  bump(): void { this.rev.update((v) => v + 1); }

  // ── tree display ───────────────────────────────────────────────────────────
  readonly rows = computed(() => { this.rev(); const out: { node: Node; depth: number }[] = []; const walk = (ns: Node[], d: number) => { for (const n of ns) { out.push({ node: n, depth: d }); if (!n.collapsed) walk(n.children, d + 1); } }; walk(this.buildings, 0); return out; });

  icon(k: Kind): string { return { building: 'domain', floor: 'layers', room: 'meeting_room', bed: 'bed' }[k]; }
  childKind(k: Kind): Kind | null { return k === 'building' ? 'floor' : k === 'floor' ? 'room' : k === 'room' ? 'bed' : null; }
  ckLabel(k: Kind): string { return { building: 'Building', floor: 'Floor', room: 'Room', bed: 'Bed' }[k]; }

  // ── node ops ───────────────────────────────────────────────────────────────
  addBuilding(): void {
    const n: Node = { id: uid(), kind: 'building', name: `Building ${this.buildings.length + 1}`, collapsed: false, children: [], cfg: { code: '', status: 'ACTIVE', description: '', images: [] } };
    this.buildings = [...this.buildings, n]; this.select(n); this.bump();
  }
  addChild(parent: Node): void {
    const ck = this.childKind(parent.kind); if (!ck) return;
    let n: Node;
    if (ck === 'floor') n = { id: uid(), kind: 'floor', name: `Floor ${parent.children.length + 1}`, collapsed: false, children: [], cfg: { floorNumber: parent.children.length + 1, description: '' } };
    else if (ck === 'room') n = { id: uid(), kind: 'room', name: 'Room 101', collapsed: false, children: [], cfg: { roomNumber: '101', roomType: 'DOUBLE', category: 'Standard', rent: 10000, deposit: 10000, amenities: [], images: [] } };
    else { const lbl = String.fromCharCode(65 + parent.children.length); n = { id: uid(), kind: 'bed', name: 'Bed ' + lbl, collapsed: false, children: [], cfg: { label: lbl, status: 'AVAILABLE', rent: Number(parent.cfg['rent']) || 0, deposit: Number(parent.cfg['deposit']) || 0 } }; }
    parent.children = [...parent.children, n]; parent.collapsed = false; this.select(n); this.bump();
  }
  remove(id: string): void {
    const strip = (ns: Node[]): Node[] => ns.filter((n) => n.id !== id).map((n) => ({ ...n, children: strip(n.children) }));
    this.buildings = strip(this.buildings);
    if (this.selected()?.id === id) this.selected.set(null);
    this.bump();
  }
  select(n: Node): void { this.selected.set(n); }
  set(n: Node, key: string, val: unknown): void { n.cfg[key] = val; this.bump(); }
  // Per-node photos are collected as Files and uploaded after publish creates
  // the server-side building/room ids (presigned upload needs an entityId).
  previewsOf(n: Node): string[] { return (n.cfg['previews'] as string[]) ?? []; }
  private filesOf(n: Node): File[] { return (n.cfg['files'] as File[]) ?? []; }
  onPickNode(n: Node, e: Event): void {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []).filter((f) => f.type.startsWith('image/'));
    n.cfg['files'] = [...this.filesOf(n), ...files];
    n.cfg['previews'] = [...this.previewsOf(n), ...files.map((f) => URL.createObjectURL(f))];
    input.value = ''; this.bump();
  }
  removeNodeImg(n: Node, i: number): void {
    const p = this.previewsOf(n)[i];
    if (p?.startsWith('blob:')) URL.revokeObjectURL(p);
    n.cfg['files'] = this.filesOf(n).filter((_, idx) => idx !== i);
    n.cfg['previews'] = this.previewsOf(n).filter((_, idx) => idx !== i);
    this.bump();
  }
  /** Presign → PUT → confirm each collected image for a created entity. */
  private async uploadNodeImages(scope: string, entityType: string, entityId: string, n: Node): Promise<void> {
    const files = this.filesOf(n);
    for (let i = 0; i < files.length; i++) {
      const role = i === 0 ? 'cover' : 'gallery';
      const pre = await firstValueFrom(this.uploads.presign(scope, entityId, files[i]));
      await lastValueFrom(this.uploads.putToStorage(pre.uploadUrl, files[i]));
      await firstValueFrom(this.uploads.confirm(entityType, entityId, pre.key, role, i));
    }
  }
  amen(n: Node): string[] { return (n.cfg['amenities'] as string[]) ?? []; }
  toggleAmenity(n: Node, a: string): void { const cur = this.amen(n); n.cfg['amenities'] = cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]; this.bump(); }
  capacity(n: Node): number { return CAPACITY[String(n.cfg['roomType'])] ?? 2; }
  capFor(t: string): number { return CAPACITY[t] ?? 2; }
  dot(bed: Node): string {
    return { OCCUPIED: 'bg-[var(--primary-container)]', RESERVED: 'bg-warning', AVAILABLE: 'bg-success', MAINTENANCE: 'bg-danger' }[String(bed.cfg['status'])] ?? 'bg-success';
  }

  // ── generators / clone ───────────────────────────────────────────────────
  private allNodes(kind: Kind): Node[] { const out: Node[] = []; const walk = (ns: Node[]) => ns.forEach((n) => { if (n.kind === kind) out.push(n); walk(n.children); }); walk(this.buildings); return out; }
  readonly floorOptions = computed(() => { this.rev(); return this.allFloorsWithLabel(); });
  private allFloorsWithLabel(): { id: string; label: string }[] {
    const out: { id: string; label: string }[] = [];
    for (const b of this.buildings) for (const f of b.children) out.push({ id: f.id, label: `${b.name} · ${f.name}` });
    return out;
  }
  openRoomGen(): void { const f = this.allFloorsWithLabel(); this.gen.floorId = (this.selected()?.kind === 'floor' ? this.selected()!.id : f[0]?.id) ?? ''; this.showGen.set(true); }
  generateRooms(): void {
    const floor = this.allNodes('floor').find((f) => f.id === this.gen.floorId); if (!floor) return;
    const existing = new Set(floor.children.map((r) => String(r.cfg['roomNumber'])));
    const cap = this.capFor(this.gen.type);
    for (let num = this.gen.start; num <= this.gen.end; num++) {
      if (existing.has(String(num))) continue;
      const room: Node = { id: uid(), kind: 'room', name: 'Room ' + num, collapsed: true, children: [], cfg: { roomNumber: String(num), roomType: this.gen.type, category: 'Standard', rent: this.gen.rent, deposit: this.gen.rent, amenities: [], images: [] } };
      for (let i = 0; i < cap; i++) { const lbl = String.fromCharCode(65 + i); room.children.push({ id: uid(), kind: 'bed', name: 'Bed ' + lbl, collapsed: false, children: [], cfg: { label: lbl, status: 'AVAILABLE', rent: Math.round(this.gen.rent / cap), deposit: 0 } }); }
      floor.children.push(room);
    }
    this.showGen.set(false); this.flash(`Rooms ${this.gen.start}–${this.gen.end} added to draft — Publish to save.`, false); this.bump();
  }
  genBeds(): void {
    const room = this.selected(); if (!room || room.kind !== 'room') return;
    const cap = this.capacity(room); room.children = [];
    for (let i = 0; i < cap; i++) { const lbl = String.fromCharCode(65 + i); room.children.push({ id: uid(), kind: 'bed', name: 'Bed ' + lbl, collapsed: false, children: [], cfg: { label: lbl, status: 'AVAILABLE', rent: Math.round((Number(room.cfg['rent']) || 0) / cap), deposit: 0 } }); }
    this.flash(`${cap} beds added to ${room.name} (draft) — Publish to save.`, false); this.bump();
  }
  private clone(n: Node): Node { return { ...n, id: uid(), name: n.name + ' (copy)', cfg: { ...n.cfg }, children: n.children.map((c) => this.cloneChild(c)) }; }
  private cloneChild(n: Node): Node { return { ...n, id: uid(), cfg: { ...n.cfg }, children: n.children.map((c) => this.cloneChild(c)) }; }
  cloneFloor(): void { const f = this.selected(); if (!f || f.kind !== 'floor') return; const b = this.buildings.find((bb) => bb.children.some((x) => x.id === f.id)); if (b) { b.children = [...b.children, this.clone(f)]; this.flash('Floor cloned.', false); this.bump(); } }
  cloneBuilding(): void { const b = this.selected(); if (!b || b.kind !== 'building') return; this.buildings = [...this.buildings, this.clone(b)]; this.flash('Building cloned.', false); this.bump(); }

  // ── summary ────────────────────────────────────────────────────────────────
  count(k: Kind): number { this.rev(); return this.allNodes(k).length; }
  readonly previewRooms = computed(() => { this.rev(); return this.allNodes('room').slice(0, 30); });
  readonly projectedRevenue = computed(() => {
    this.rev();
    let total = 0;
    for (const room of this.allNodes('room')) {
      const beds = room.children;
      if (beds.length) for (const b of beds) total += Number(b.cfg['rent']) || 0;
      else total += Number(room.cfg['rent']) || 0;
    }
    return total * 100; // paise
  });

  // ── validation + publish ─────────────────────────────────────────────────
  private validate(): string | null {
    if (!this.allNodes('room').length) return 'Add at least one room before publishing.';
    const codes = this.allNodes('building').map((b) => String(b.cfg['code'] || '').trim()).filter(Boolean);
    if (new Set(codes).size !== codes.length) return 'Duplicate building codes found.';
    for (const f of this.allNodes('floor')) {
      const nums = f.children.map((r) => String(r.cfg['roomNumber']));
      if (new Set(nums).size !== nums.length) return `Duplicate room numbers on ${f.name}.`;
    }
    for (const r of this.allNodes('room')) {
      if (r.children.length && r.children.length !== this.capacity(r)) return `Room ${r.cfg['roomNumber']}: ${r.children.length} beds ≠ capacity ${this.capacity(r)}.`;
    }
    return null;
  }

  async publish(): Promise<void> {
    const v = this.validate(); if (v) { this.flash(v, true); return; }
    this.publishing.set(true); this.err.set(false);
    try {
      for (const b of this.buildings) {
        const bid = (await firstValueFrom(this.inv.createBuilding(this.propertyId, { name: b.name, description: String(b.cfg['description'] || '') }))).id;
        await this.uploadNodeImages('building', 'building', bid, b);
        for (const f of b.children) {
          const fid = (await firstValueFrom(this.inv.createFloor(bid, { floorNumber: Number(f.cfg['floorNumber']) || 1, label: f.name }))).id;
          for (const r of f.children) {
            const am = this.amen(r);
            const rid = (await firstValueFrom(this.inv.createRoom(fid, { roomNumber: String(r.cfg['roomNumber']), roomType: String(r.cfg['roomType']), furnishing: 'SEMI_FURNISHED', acAvailable: am.includes('AC'), attachedBathroom: am.includes('Attached Washroom'), balcony: am.includes('Balcony'), description: String(r.cfg['description'] || '') || undefined } as never))).id;
            await this.uploadNodeImages('room', 'room', rid, r);
            for (const bed of r.children) {
              await firstValueFrom(this.inv.createBed(rid, { bedNumber: `${r.cfg['roomNumber']}-${bed.cfg['label']}`, label: String(bed.cfg['label']), pricePaisa: (Number(bed.cfg['rent']) || Number(r.cfg['rent']) || 0) * 100 }));
            }
          }
        }
      }
      try { localStorage.removeItem(STORAGE(this.propertyId)); } catch { /* ignore */ }
      this.publishing.set(false);
      this.toast.set('Inventory published.');
      this.router.navigate(['/inventory']);
    } catch (e) {
      this.publishing.set(false);
      this.flash('Publish failed at some node — partial inventory may have been created. ' + ((e as { error?: { errors?: { message?: string }[] } })?.error?.errors?.[0]?.message ?? ''), true);
    }
  }

  // ── persistence ──
  private persist(): void { try { localStorage.setItem(STORAGE(this.propertyId), JSON.stringify(this.buildings)); } catch { /* ignore */ } }
  private restore(): void { try { const raw = localStorage.getItem(STORAGE(this.propertyId)); if (raw) this.buildings = JSON.parse(raw); } catch { /* ignore */ } }
  saveDraft(): void { this.persist(); this.flash('Draft saved locally.', false); }

  private flash(m: string, isErr: boolean): void { this.err.set(isErr); this.msg.set(m); setTimeout(() => this.msg.set(null), 4000); }
  clear(): void { setTimeout(() => this.toast.set(null), 3000); }
}
