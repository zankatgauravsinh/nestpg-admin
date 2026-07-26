import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SlicePipe } from '@angular/common';
import { combineLatest, map, of, switchMap } from 'rxjs';
import { UsersService, KycRecord, KycDocument, userDisplayName } from '../../core/data/users.service';
import { BookingsService, ApiBooking, paymentFromBooking } from '../../core/data/bookings.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { IconComponent } from '../../shared/components/icon.component';
import { AvatarUploadComponent } from '../../shared/components/avatar-upload.component';
import { PrivateDocComponent } from '../../shared/components/private-doc.component';
import { StatusPillComponent } from '../../shared/components/status-pill.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { InrPipe } from '../../shared/pipes/inr.pipe';

type Tab = 'kyc' | 'payments' | 'documents' | 'stay' | 'activity' | 'tickets' | 'comms';

@Component({
  selector: 'os-resident-crm',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink, SlicePipe, IconComponent, AvatarUploadComponent, PrivateDocComponent,
    StatusPillComponent, EmptyStateComponent, InrPipe,
  ],
  template: `
    <a routerLink="/residents" class="inline-flex items-center gap-1 text-[13px] text-muted hover:text-content mb-4">
      <os-icon name="arrow_back" [size]="16" /> Residents
    </a>

    @if (!currentId()) {
      <os-empty-state icon="badge" title="Select a resident"
        message="Open a resident from the directory to see their profile, KYC, payments and stay history.">
        <a routerLink="/residents" class="h-9 px-3.5 rounded-lg bg-accent text-white text-sm font-semibold inline-flex items-center gap-1.5">
          <os-icon name="groups" [size]="18" /> Browse residents
        </a>
      </os-empty-state>
    } @else {
    <!-- Profile header -->
    <div class="bg-panel border border-border rounded-[16px] p-6 mb-5">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <os-avatar-upload entityType="resident" scope="resident-avatar"
            [entityId]="currentId()" [name]="name()" [size]="60"
            [initialUrl]="avatarUrl()" (uploaded)="onAvatar()" />
          <div>
            <h1 class="text-xl font-semibold text-content">{{ name() }}</h1>
            <p class="text-sm text-muted flex items-center gap-3 mt-1">
              <span class="flex items-center gap-1"><os-icon name="call" [size]="15" /> {{ user()?.phone ?? '—' }}</span>
              <span class="flex items-center gap-1"><os-icon name="mail" [size]="15" /> {{ user()?.email ?? '—' }}</span>
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          @if (user()?.kycStatus) { <os-status-pill [status]="user()!.kycStatus!" /> }
          @if (user()?.status) { <os-status-pill [status]="user()!.status!" /> }
        </div>
      </div>
      <!-- quick stats -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-border-subtle">
        <div><p class="text-lg font-semibold text-content">{{ bookings().length }}</p><p class="text-[11px] text-faint">Bookings</p></div>
        <div><p class="text-lg font-semibold text-content">{{ totalPaid() | inr }}</p><p class="text-[11px] text-faint">Total paid</p></div>
        <div><p class="text-lg font-semibold" [class.text-danger]="balance() > 0" [class.text-content]="balance() === 0">{{ balance() | inr }}</p><p class="text-[11px] text-faint">Balance</p></div>
        <div><p class="text-lg font-semibold text-content">{{ user()?.profile?.city ?? '—' }}</p><p class="text-[11px] text-faint">City</p></div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="border-b border-border mb-5 flex gap-1 overflow-x-auto os-scroll">
      @for (t of tabs; track t.id) {
        <button (click)="tab.set(t.id)"
          class="px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition"
          [class]="tab() === t.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-content'">
          {{ t.label }}
        </button>
      }
    </div>

    @switch (tab()) {
      <!-- KYC -->
      @case ('kyc') {
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div class="lg:col-span-2 bg-panel border border-border rounded-[16px] p-5">
            <h3 class="text-base font-semibold text-content mb-4">Identity verification</h3>
            @if (kyc(); as k) {
              <div class="space-y-3">
                <div class="flex items-center justify-between"><span class="text-sm text-muted">Status</span><os-status-pill [status]="k.status ?? 'NOT_STARTED'" /></div>
                <div class="flex items-center justify-between"><span class="text-sm text-muted">Aadhaar name</span><span class="text-sm font-medium text-content">{{ k.aadhaarName ?? '—' }}</span></div>
                <div class="flex items-center justify-between"><span class="text-sm text-muted">PAN name</span><span class="text-sm font-medium text-content">{{ k.panName ?? '—' }}</span></div>
                <div class="flex items-center justify-between"><span class="text-sm text-muted">Liveness score</span><span class="text-sm font-medium text-content">{{ k.livenessScore ?? '—' }}</span></div>
                <div class="flex items-center justify-between"><span class="text-sm text-muted">Submitted</span><span class="text-sm font-medium text-content">{{ k.submittedAt ? (k.submittedAt | slice:0:10) : '—' }}</span></div>
                @if (k.rejectionReason) { <div class="rounded-lg bg-danger-subtle text-danger text-[13px] px-3 py-2">{{ k.rejectionReason }}</div> }
              </div>
            } @else { <p class="text-sm text-muted py-6 text-center">No KYC submission on record.</p> }
          </div>
          <div class="bg-panel border border-border rounded-[16px] p-5">
            <h3 class="text-base font-semibold text-content mb-4">Review</h3>
            @if (reviewable()) {
              <div class="space-y-2">
                <button (click)="review('APPROVED')" [disabled]="reviewing()" class="w-full h-10 rounded-lg bg-success text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-60">Approve identity</button>
                <button (click)="review('REJECTED')" [disabled]="reviewing()" class="w-full h-10 rounded-lg bg-danger text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-60">Reject</button>
              </div>
            } @else {
              <div class="rounded-xl bg-canvas p-3 text-center">
                <os-status-pill [status]="kyc()?.status ?? 'NOT_STARTED'" />
                <p class="text-xs text-muted mt-2">{{ (kyc()?.status === 'APPROVED' || kyc()?.status === 'REJECTED') ? 'Already reviewed — no action needed.' : 'Resident must submit documents before review.' }}</p>
              </div>
            }
            @if (msg()) { <p class="text-xs mt-3 flex items-center gap-1" [class.text-success]="!reviewErr()" [class.text-danger]="reviewErr()"><os-icon [name]="reviewErr() ? 'error' : 'check'" [size]="14" /> {{ msg() }}</p> }
          </div>
        </div>
      }

      <!-- Payments -->
      @case ('payments') {
        <div class="bg-panel border border-border rounded-[16px] overflow-hidden">
          @if (payments().length) {
            <table class="w-full text-sm">
              <thead><tr class="text-left text-[11px] uppercase tracking-wider text-faint bg-canvas">
                <th class="px-5 py-2.5 font-medium">Unit</th><th class="px-5 py-2.5 font-medium">Due</th>
                <th class="px-5 py-2.5 font-medium">Paid</th><th class="px-5 py-2.5 font-medium">Balance</th>
                <th class="px-5 py-2.5 font-medium">Method</th><th class="px-5 py-2.5 font-medium">Status</th>
              </tr></thead>
              <tbody>
                @for (p of payments(); track p.id) {
                  <tr class="border-t border-border-subtle">
                    <td class="px-5 py-3 text-muted">{{ p.unit }}</td>
                    <td class="px-5 py-3 text-content">{{ p.duePaisa | inr }}</td>
                    <td class="px-5 py-3 text-success">{{ p.paidPaisa | inr }}</td>
                    <td class="px-5 py-3 font-medium" [class.text-danger]="p.balancePaisa>0">{{ p.balancePaisa | inr }}</td>
                    <td class="px-5 py-3 text-muted">{{ p.method }}</td>
                    <td class="px-5 py-3"><os-status-pill [status]="p.status" /></td>
                  </tr>
                }
              </tbody>
            </table>
          } @else { <os-empty-state icon="payments" title="No payments" message="Payment records appear here as the resident accrues rent." /> }
        </div>
      }

      <!-- Stay history -->
      @case ('stay') {
        <div class="bg-panel border border-border rounded-[16px] p-5">
          @if (bookings().length) {
            <ol class="relative border-l border-border ml-2 space-y-6">
              @for (b of bookings(); track b.id) {
                <li class="ml-5">
                  <span class="absolute -left-[7px] w-3.5 h-3.5 rounded-full bg-accent border-2 border-panel"></span>
                  <div class="flex items-center justify-between gap-2">
                    <p class="text-sm font-semibold text-content flex items-center gap-1.5"><os-icon name="apartment" [size]="15" /> {{ b.propertyName ?? 'Property' }}</p>
                    <os-status-pill [status]="b.status ?? 'CONFIRMED'" />
                  </div>
                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2.5">
                    <div><p class="text-[11px] text-faint">Floor</p><p class="text-sm font-medium text-content">{{ b.floorNumber != null ? 'Floor ' + b.floorNumber : '—' }}</p></div>
                    <div><p class="text-[11px] text-faint">Room / Bed</p><p class="text-sm font-medium text-content">{{ b.roomNumber ?? '—' }}{{ b.bedLabel ? ' · ' + b.bedLabel : '' }}</p></div>
                    <div><p class="text-[11px] text-faint">From → To</p><p class="text-sm font-medium text-content">{{ (b.checkInDate ?? '—') }} → {{ b.checkOutDate ?? 'Ongoing' }}</p></div>
                    <div><p class="text-[11px] text-faint">Rent</p><p class="text-sm font-medium text-content">{{ b.rentPaisa | inr }}/mo</p></div>
                  </div>
                  <p class="text-[11px] text-faint mt-1.5">{{ b.bookingNumber }} · {{ roomTypeLabel(b.roomType) }}</p>
                </li>
              }
            </ol>
          } @else { <os-empty-state icon="history" title="No stay history" message="This resident has no bookings yet." /> }
        </div>
      }

      <!-- Documents -->
      @case ('documents') {
        @if (kycDocs().length) {
          <div class="mb-5">
            <p class="text-[12px] font-semibold uppercase tracking-wider text-muted mb-3 flex items-center gap-1.5"><os-icon name="lock" [size]="14" /> Verified KYC documents (private)</p>
            <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              @for (doc of kycDocs(); track doc.id) {
                <os-private-doc [docKey]="doc.s3Key" [label]="docLabel(doc.docType)" />
              }
            </div>
          </div>
          <p class="text-[12px] font-semibold uppercase tracking-wider text-muted mb-3">Profile documents</p>
        }
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          @for (d of documents(); track d.label) {
            <div class="bg-panel border border-border rounded-[16px] overflow-hidden flex flex-col">
              @if (d.url) {
                <button (click)="preview.set(d)" class="aspect-[4/3] bg-canvas overflow-hidden group relative">
                  <img [src]="d.url" [alt]="d.label" class="w-full h-full object-cover group-hover:scale-105 transition" loading="lazy" />
                  <span class="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition">
                    <span class="opacity-0 group-hover:opacity-100 text-white text-xs font-semibold flex items-center gap-1"><os-icon name="visibility" [size]="16" /> Preview</span>
                  </span>
                </button>
              } @else {
                <div class="aspect-[4/3] bg-canvas flex items-center justify-center text-faint"><os-icon name="description" [size]="28" /></div>
              }
              <div class="p-3 flex items-center justify-between gap-2">
                <p class="text-[13px] font-medium text-content truncate">{{ d.label }}</p>
                @if (d.url) {
                  <div class="flex items-center gap-1 shrink-0">
                    <button (click)="preview.set(d)" class="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:bg-canvas" title="View"><os-icon name="visibility" [size]="16" /></button>
                    <a [href]="d.url" [download]="d.label" target="_blank" rel="noopener" class="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:bg-canvas" title="Download"><os-icon name="download" [size]="16" /></a>
                  </div>
                } @else { <span class="text-[11px] text-faint shrink-0">Not uploaded</span> }
              </div>
            </div>
          }
        </div>
        <!-- Lightbox -->
        @if (preview(); as d) {
          <div class="fixed inset-0 z-[70] flex items-center justify-center p-6" (click)="preview.set(null)">
            <div class="absolute inset-0 bg-black/70"></div>
            <div class="relative max-w-2xl w-full bg-panel rounded-[16px] overflow-hidden" (click)="$event.stopPropagation()">
              <div class="flex items-center justify-between px-4 h-12 border-b border-border">
                <p class="text-sm font-semibold text-content">{{ d.label }}</p>
                <div class="flex items-center gap-1">
                  <a [href]="d.url!" [download]="d.label" target="_blank" rel="noopener" class="h-8 px-2.5 rounded-lg text-[13px] font-medium text-content hover:bg-canvas flex items-center gap-1"><os-icon name="download" [size]="16" /> Download</a>
                  <button (click)="preview.set(null)" class="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:bg-canvas"><os-icon name="close" [size]="18" /></button>
                </div>
              </div>
              <img [src]="d.url!" [alt]="d.label" class="w-full max-h-[70vh] object-contain bg-canvas" />
            </div>
          </div>
        }
      }

      <!-- Activity -->
      @case ('activity') {
        <div class="bg-panel border border-border rounded-[16px] p-5">
          @if (activity().length) {
            <ul class="space-y-4">
              @for (a of activity(); track a.text) {
                <li class="flex items-start gap-3">
                  <span class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" [class]="a.cls"><os-icon [name]="a.icon" [size]="16" /></span>
                  <div><p class="text-sm text-content">{{ a.text }}</p><p class="text-[11px] text-faint">{{ a.date }}</p></div>
                </li>
              }
            </ul>
          } @else { <os-empty-state icon="timeline" title="No activity" message="Lifecycle events will appear here." /> }
        </div>
      }

      <!-- Tickets / Comms — no backend yet -->
      @default {
        <os-empty-state [icon]="tab() === 'tickets' ? 'confirmation_number' : 'forum'"
          [title]="(tab() === 'tickets' ? 'Tickets' : 'Communications') + ' — coming soon'"
          message="This tab is built and ready; it activates once the backend exposes a tickets / messaging endpoint." />
      }
    }
    }
  `,
})
export class ResidentCrmComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly svc = inject(UsersService);
  private readonly bookingsSvc = inject(BookingsService);

  // React to ?id changes so navigating between residents always reloads.
  private readonly id$ = this.route.queryParamMap.pipe(map((p) => p.get('id') ?? ''));
  readonly currentId = toSignal(this.id$, { initialValue: '' });
  private readonly refresh = signal(0);
  private readonly key$ = combineLatest([this.id$, toObservable(this.refresh)]).pipe(map(([id]) => id));

  readonly user = toSignal(this.key$.pipe(switchMap((id) => (id ? this.svc.get(id) : of(null)))), { initialValue: null });
  readonly kyc = toSignal(this.key$.pipe(switchMap((id) => (id ? this.svc.kyc(id) : of(null)))), { initialValue: null as KycRecord | null });
  readonly kycDocs = toSignal(this.key$.pipe(switchMap((id) => (id ? this.svc.kycDocuments(id) : of([] as KycDocument[])))), { initialValue: [] as KycDocument[] });
  readonly bookings = toSignal(this.id$.pipe(switchMap((id) => (id ? this.bookingsSvc.bookings({ tenantId: id }) : of([] as ApiBooking[])))), { initialValue: [] as ApiBooking[] });
  readonly msg = signal<string | null>(null);
  readonly preview = signal<{ label: string; url: string | null } | null>(null);

  private readonly roomTypes: Record<string, string> = {
    SINGLE: 'Single', DOUBLE: 'Double sharing', TRIPLE: 'Triple sharing',
    QUAD: 'Quad sharing', DORMITORY: 'Dormitory', STUDIO: 'Studio',
  };
  roomTypeLabel(t?: string | null): string { return t ? (this.roomTypes[t] ?? t) : 'Room'; }

  protected readonly tabs: { id: Tab; label: string }[] = [
    { id: 'kyc', label: 'KYC' },
    { id: 'payments', label: 'Payments' },
    { id: 'documents', label: 'Documents' },
    { id: 'stay', label: 'Stay History' },
    { id: 'activity', label: 'Activity' },
    { id: 'tickets', label: 'Tickets' },
    { id: 'comms', label: 'Communications' },
  ];
  readonly tab = signal<Tab>('kyc');

  readonly name = computed(() => { const u = this.user(); return u ? userDisplayName(u) : 'Resident'; });
  readonly avatarUrl = computed(() => (this.user() as { avatarUrl?: string | null } | null)?.avatarUrl ?? null);
  onAvatar(): void { this.refresh.update((v) => v + 1); }
  private readonly docTypeLabels: Record<string, string> = {
    AADHAAR: 'Aadhaar', AADHAAR_FRONT: 'Aadhaar (front)', AADHAAR_BACK: 'Aadhaar (back)',
    PAN: 'PAN card', SELFIE: 'Selfie', PASSPORT: 'Passport', DRIVING_LICENSE: 'Driving licence',
  };
  docLabel(t: string): string { return this.docTypeLabels[t] ?? t; }
  readonly payments = computed(() => this.bookings().map((b) => paymentFromBooking(b)));
  readonly totalPaid = computed(() => this.payments().reduce((s, p) => s + p.paidPaisa, 0));
  readonly balance = computed(() => this.payments().reduce((s, p) => s + p.balancePaisa, 0));

  readonly documents = computed(() => {
    const k = this.kyc();
    return [
      { label: 'Aadhaar (front)', url: k?.aadhaarFrontUrl ?? null },
      { label: 'Aadhaar (back)', url: k?.aadhaarBackUrl ?? null },
      { label: 'PAN card', url: k?.panUrl ?? null },
      { label: 'Selfie', url: k?.selfieUrl ?? null },
    ];
  });

  readonly activity = computed(() => {
    const items: { text: string; date: string; icon: string; cls: string }[] = [];
    const k = this.kyc();
    if (k?.submittedAt) items.push({ text: 'Submitted KYC documents', date: String(k.submittedAt).slice(0, 10), icon: 'upload_file', cls: 'bg-info-subtle text-info' });
    if (k?.reviewedAt) items.push({ text: 'KYC ' + (k.status ?? 'reviewed'), date: String(k.reviewedAt).slice(0, 10), icon: 'verified', cls: 'bg-success-subtle text-success' });
    for (const b of this.bookings()) {
      items.push({ text: `Booking ${b.bookingNumber ?? ''} · Unit ${b.roomNumber ?? '—'}`, date: b.checkInDate ?? (b.createdAt ?? '').slice(0, 10), icon: 'event_available', cls: 'bg-accent-subtle text-accent' });
    }
    return items.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  });

  readonly reviewing = signal(false);
  readonly reviewErr = signal(false);
  readonly reviewable = computed(() => ['SUBMITTED', 'UNDER_REVIEW'].includes(this.kyc()?.status ?? ''));

  review(decision: 'APPROVED' | 'REJECTED'): void {
    const id = this.currentId();
    if (!id) return;
    this.reviewing.set(true);
    this.reviewErr.set(false);
    const reason = decision === 'REJECTED' ? 'Documents did not pass verification' : undefined;
    this.svc.reviewKyc(id, decision, reason).subscribe({
      next: () => { this.reviewing.set(false); this.reviewErr.set(false); this.msg.set('Identity ' + decision.toLowerCase() + '.'); this.refresh.update((v) => v + 1); },
      error: (e) => { this.reviewing.set(false); this.reviewErr.set(true); this.msg.set(apiErrorMessage(e, 'Could not submit review.')); },
    });
  }
}
