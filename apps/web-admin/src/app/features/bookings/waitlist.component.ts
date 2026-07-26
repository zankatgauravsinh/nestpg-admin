import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { BookingsService, ApiWaitlistEntry, JoinWaitlistPayload } from '../../core/data/bookings.service';
import { PropertiesService } from '../../core/data/properties.service';
import { Property } from '../../core/data/models';
import { apiErrorMessage } from '../../core/http/api-error';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EntityAvatarComponent } from '../../shared/components/entity-avatar.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { ModalComponent } from '../../shared/components/modal.component';
import { IconComponent } from '../../shared/components/icon.component';

@Component({
  selector: 'os-waitlist',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, PageHeaderComponent, EntityAvatarComponent, EmptyStateComponent, ModalComponent, IconComponent],
  template: `
    <os-page-header eyebrow="Bookings" title="Waitlist"
      subtitle="Prospects waiting on availability, in priority order.">
      <div actions>
        <button (click)="open()" class="h-9 px-3.5 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition flex items-center gap-1.5">
          <os-icon name="person_add" [size]="18" /> Add to waitlist
        </button>
      </div>
    </os-page-header>

    <div class="bg-panel border border-border rounded-[16px] overflow-hidden">
      @if (entries().length) {
        <ul>
          @for (e of entries(); track e.id; let i = $index) {
            <li class="flex items-center gap-3 px-5 py-3.5 border-t border-border-subtle first:border-t-0 hover:bg-canvas/60 transition">
              <span class="w-7 h-7 rounded-lg bg-canvas text-muted text-xs font-semibold flex items-center justify-center shrink-0">{{ i + 1 }}</span>
              <os-avatar [name]="e.name ?? 'Prospect'" [size]="34" />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-content truncate">{{ e.name ?? 'Prospect ' + (i + 1) }}</p>
                <p class="text-xs text-muted truncate">prefers {{ e.roomType ?? 'any' }} · {{ e.genderPreference ?? 'any' }} · move-in {{ e.preferredMoveIn ?? '—' }}</p>
              </div>
              <button (click)="remove(e)" class="h-8 px-3 rounded-lg border border-border text-[13px] font-medium text-danger hover:bg-danger-subtle transition">Remove</button>
            </li>
          }
        </ul>
      } @else {
        <os-empty-state icon="hourglass_top" title="Waitlist is empty" message="Add a prospect to start the waitlist." />
      }
      @if (msg()) { <p class="px-5 py-3 text-xs text-success border-t border-border-subtle flex items-center gap-1"><os-icon name="check" [size]="14" /> {{ msg() }}</p> }
    </div>

    <os-modal [open]="show()" title="Add to waitlist" subtitle="Register a prospect's preferences" (closed)="show.set(false)">
      <form id="wlForm" class="space-y-4" (ngSubmit)="submit()">
        <div>
          <label class="block text-[12px] font-medium text-muted mb-1.5">Property *</label>
          <select name="prop" [(ngModel)]="form.propertyId" class="fld">
            <option value="" disabled>Select property</option>
            @for (p of properties(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[12px] font-medium text-muted mb-1.5">Room type</label>
            <select name="rt" [(ngModel)]="form.roomType" class="fld">
              @for (t of roomTypes; track t) { <option [value]="t">{{ t }}</option> }
            </select>
          </div>
          <div>
            <label class="block text-[12px] font-medium text-muted mb-1.5">Gender preference</label>
            <select name="gp" [(ngModel)]="form.genderPreference" class="fld">
              @for (g of genders; track g) { <option [value]="g">{{ g }}</option> }
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-[12px] font-medium text-muted mb-1.5">Max rent (₹/mo)</label><input name="mp" type="number" [(ngModel)]="maxRent" placeholder="12000" class="fld" /></div>
          <div><label class="block text-[12px] font-medium text-muted mb-1.5">Preferred move-in</label><input name="mi" type="date" [(ngModel)]="form.preferredMoveIn" class="fld" /></div>
        </div>
        @if (error()) { <p class="text-[13px] text-danger flex items-center gap-1.5"><os-icon name="error" [size]="15" /> {{ error() }}</p> }
      </form>
      <div footer>
        <button (click)="show.set(false)" class="h-9 px-4 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas">Cancel</button>
        <button type="submit" form="wlForm" [disabled]="saving()" class="h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover disabled:opacity-60 flex items-center gap-2">
          @if (saving()) { <span class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span> }
          Add to waitlist
        </button>
      </div>
    </os-modal>
  `,
  styles: [`
    .fld { width:100%; height:40px; padding:0 12px; border-radius:8px; border:1px solid var(--border);
      background:var(--panel); font-size:14px; color:var(--text-primary); outline:none; transition:all .15s; }
    .fld:focus { border-color:var(--accent); box-shadow:0 0 0 2px color-mix(in srgb, var(--accent) 15%, transparent); }
  `],
})
export class WaitlistComponent {
  private readonly svc = inject(BookingsService);
  private readonly propsSvc = inject(PropertiesService);
  readonly entries = signal<ApiWaitlistEntry[]>([]);
  readonly properties = toSignal(this.propsSvc.list(), { initialValue: [] as Property[] });
  readonly msg = signal<string | null>(null);

  readonly show = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  protected form: JoinWaitlistPayload = this.blank();
  protected maxRent: number | null = null;
  protected readonly roomTypes = ['SINGLE', 'DOUBLE', 'TRIPLE', 'QUAD', 'DORMITORY', 'STUDIO'];
  protected readonly genders = ['ANY', 'MALE', 'FEMALE'];

  constructor() { this.reload(); }

  private reload(): void { this.svc.waitlist().subscribe((w) => this.entries.set(w)); }
  private blank(): JoinWaitlistPayload { return { propertyId: '', roomType: 'SINGLE', genderPreference: 'ANY' }; }
  open(): void { this.form = this.blank(); this.maxRent = null; this.error.set(null); this.show.set(true); }

  submit(): void {
    if (!this.form.propertyId) { this.error.set('Please select a property.'); return; }
    this.saving.set(true);
    this.error.set(null);
    const dto: JoinWaitlistPayload = { ...this.form };
    if (this.maxRent) dto.maxPricePaisa = this.maxRent * 100;
    this.svc.joinWaitlist(dto).subscribe({
      next: () => { this.saving.set(false); this.show.set(false); this.msg.set('Prospect added to waitlist.'); this.reload(); },
      error: (e) => { this.saving.set(false); this.error.set(apiErrorMessage(e, 'Could not add to waitlist.')); },
    });
  }

  remove(e: ApiWaitlistEntry): void {
    this.svc.removeWaitlist(e.id).subscribe({
      next: () => { this.entries.set(this.entries().filter((x) => x.id !== e.id)); this.msg.set('Removed from waitlist.'); },
      error: () => this.msg.set('Could not remove (API unavailable).'),
    });
  }
}
