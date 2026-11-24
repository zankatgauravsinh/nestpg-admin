import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PropertiesService, ReviewQueueRow, RawProperty } from '../../core/data/properties.service';
import { InventoryService } from '../../core/data/inventory.service';
import { SessionStore } from '../../core/auth/session.store';
import { apiErrorMessage } from '../../core/http/api-error';
import { IconComponent } from '../../shared/components/icon.component';
import { InrPipe } from '../../shared/pipes/inr.pipe';

const PAGE_SIZE = 20;

/**
 * Admin property review queue (A2).
 *
 * The one screen where a submission is judged. Three rules shape it:
 *
 *  • It reads `GET /admin/properties`, which defaults to PENDING_REVIEW. The
 *    portfolio hub cannot serve this: it merges the public ACTIVE catalogue
 *    with the caller's OWN properties, so another owner's submission never
 *    appears there.
 *  • Readiness shown here is the server's own rule — ≥1 bed and ≥1 photo in the
 *    `media` table — reported by the backend, not recomputed in the browser. The
 *    server re-checks it at approval anyway, so the badge is a preview of the
 *    decision, never its authority.
 *  • A failed request is NOT an empty queue. Loading, empty and error are three
 *    distinct states.
 */
@Component({
  selector: 'os-property-review',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, IconComponent, InrPipe],
  template: `
    <div class="p-4 sm:p-6 max-w-[1400px] mx-auto">
      <header class="mb-5">
        <p class="text-[11px] font-semibold tracking-wider text-accent uppercase">Properties</p>
        <h1 class="text-2xl font-bold text-content">Property Review</h1>
        <p class="text-sm text-muted mt-1">
          Submissions awaiting approval. Oldest created first — the schema has no submission timestamp.
        </p>
      </header>

      @if (toast(); as t) {
        <div class="mb-4 rounded-lg border border-border bg-panel px-4 py-3 text-sm text-content">{{ t }}</div>
      }

      <!-- LOADING -->
      @if (loading()) {
        <div data-testid="review-loading" class="rounded-xl border border-border bg-panel p-10 text-center">
          <p class="text-sm text-muted">Loading the review queue…</p>
        </div>
      } @else if (error(); as err) {
        <!-- ERROR — never rendered as "nothing to review" -->
        <div data-testid="review-error" class="rounded-xl border border-danger/40 bg-danger-subtle p-8 text-center">
          <os-icon name="error" [size]="28" />
          <p class="mt-2 text-sm font-semibold text-content">The review queue could not be loaded.</p>
          <p class="text-sm text-muted">{{ err }}</p>
          <button (click)="reload()" class="mt-4 h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold">Try again</button>
        </div>
      } @else if (rows().length === 0) {
        <!-- EMPTY -->
        <div data-testid="review-empty" class="rounded-xl border border-border bg-panel p-10 text-center">
          <os-icon name="task_alt" [size]="28" />
          <p class="mt-2 text-sm font-semibold text-content">No properties awaiting review.</p>
          <p class="text-sm text-muted">New owner submissions will appear here.</p>
        </div>
      } @else {
        <div class="space-y-3" data-testid="review-list">
          @for (p of rows(); track p.id) {
            <article class="rounded-xl border border-border bg-panel overflow-hidden">
              <div class="flex flex-col sm:flex-row sm:items-center gap-4 p-4">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <h2 class="text-base font-semibold text-content truncate">{{ p.name }}</h2>
                    <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-border text-muted">{{ p.status }}</span>
                  </div>
                  <p class="text-[13px] text-muted truncate">{{ p.addressLine1 }}, {{ p.areaLocality }}, {{ p.city }} {{ p.pincode }}</p>
                  <p class="text-[12px] text-faint mt-0.5">
                    Owner {{ p.owner.phone ?? p.owner.id }} · {{ p.owner.status ?? '—' }} · created {{ p.createdAt | date: 'd MMM y' }}
                  </p>
                </div>

                <div class="flex items-center gap-4 shrink-0">
                  <div class="text-center">
                    <p class="text-sm font-semibold text-content">{{ p.stats.totalBeds }}</p>
                    <p class="text-[10px] uppercase text-faint">Beds</p>
                  </div>
                  <div class="text-center">
                    <p class="text-sm font-semibold text-content">{{ p.photoCount }}</p>
                    <p class="text-[10px] uppercase text-faint">Photos</p>
                  </div>
                  <div class="text-center">
                    <p class="text-sm font-semibold text-content">{{ p.minPricePaisa | inr }}</p>
                    <p class="text-[10px] uppercase text-faint">From</p>
                  </div>
                  <span
                    [attr.data-testid]="'readiness-' + p.id"
                    class="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                    [class]="p.readiness.ready ? 'bg-success-subtle text-success' : 'bg-warning-subtle text-warning'">
                    {{ p.readiness.ready ? 'Ready' : notReady(p) }}
                  </span>
                  <button (click)="toggle(p)" class="h-9 px-3 rounded-lg border border-border text-sm font-semibold text-content">
                    {{ open() === p.id ? 'Hide' : 'Review' }}
                  </button>
                </div>
              </div>

              @if (open() === p.id) {
                <div class="border-t border-border p-4 space-y-4" [attr.data-testid]="'detail-' + p.id">
                  @if (detailLoading()) {
                    <p class="text-sm text-muted" data-testid="detail-loading">Loading property detail…</p>
                  } @else if (detailError(); as de) {
                    <p class="text-sm text-danger" data-testid="detail-error">{{ de }}</p>
                  } @else if (detail(); as d) {
                    <div class="grid sm:grid-cols-2 gap-4">
                      <dl class="text-[13px] space-y-1">
                        <div class="flex gap-2"><dt class="text-muted w-32">Type</dt><dd class="text-content">{{ d.propertyType }}</dd></div>
                        <div class="flex gap-2"><dt class="text-muted w-32">Address</dt><dd class="text-content">{{ d.addressLine1 }} {{ d.addressLine2 }}, {{ d.areaLocality }}, {{ d.city }}, {{ d.state }} {{ d.pincode }}</dd></div>
                        <div class="flex gap-2"><dt class="text-muted w-32">Description</dt><dd class="text-content">{{ d.description || '—' }}</dd></div>
                        <div class="flex gap-2"><dt class="text-muted w-32">Deposit</dt><dd class="text-content">{{ d.securityDepositPaisa ?? 0 | inr }}</dd></div>
                        <div class="flex gap-2"><dt class="text-muted w-32">Notice period</dt><dd class="text-content">{{ d.noticePeriodDays ?? '—' }} days</dd></div>
                        <div class="flex gap-2"><dt class="text-muted w-32">Food</dt><dd class="text-content">{{ d.foodIncluded ? (d.foodDescription || 'Included') : 'Not included' }}</dd></div>
                        <div class="flex gap-2"><dt class="text-muted w-32">House rules</dt><dd class="text-content">{{ (d.houseRules?.length ? d.houseRules!.join(', ') : '—') }}</dd></div>
                        <div class="flex gap-2"><dt class="text-muted w-32">Amenities</dt><dd class="text-content">{{ amenityLabels(d) }}</dd></div>
                        <div class="flex gap-2"><dt class="text-muted w-32">Price band</dt><dd class="text-content">{{ d.minPricePaisa ?? 0 | inr }} – {{ d.maxPricePaisa ?? 0 | inr }}</dd></div>
                      </dl>

                      <div class="space-y-3">
                        <!-- Readiness against the CURRENT server rules -->
                        <div class="rounded-lg border border-border p-3">
                          <p class="text-[11px] uppercase text-faint mb-2">Submission requirements</p>
                          <p class="text-[13px] flex items-center gap-2" [attr.data-testid]="'req-beds-' + p.id">
                            <os-icon [name]="p.readiness.hasBeds ? 'check_circle' : 'cancel'" [size]="16" />
                            At least 1 bed — {{ p.stats.totalBeds }} present
                          </p>
                          <p class="text-[13px] flex items-center gap-2" [attr.data-testid]="'req-photos-' + p.id">
                            <os-icon [name]="p.readiness.hasPhotos ? 'check_circle' : 'cancel'" [size]="16" />
                            At least 1 property photo — {{ p.photoCount }} uploaded
                          </p>
                          <p class="text-[13px] flex items-center gap-2" [attr.data-testid]="'req-daily-' + p.id">
                            <os-icon [name]="p.readiness.hasDailyPrices ? 'check_circle' : 'cancel'" [size]="16" />
                            A daily rate on every bed — {{ p.stats.bedsWithoutDailyPrice ? p.stats.bedsWithoutDailyPrice + ' missing' : 'all set' }}
                          </p>
                          <p class="text-[11px] text-faint mt-2">
                            Owner KYC is not required. The server re-checks these at approval.
                          </p>
                        </div>

                        <!-- Photos: the media-table gallery, the same source the rule counts -->
                        <div class="rounded-lg border border-border p-3">
                          <p class="text-[11px] uppercase text-faint mb-2">Photos ({{ p.photoCount }})</p>
                          @if (p.photoCount === 0) {
                            <p class="text-[13px] text-muted">No property photos uploaded.</p>
                          } @else {
                            <div class="flex gap-2 flex-wrap">
                              @if (d.media?.coverImageUrl) {
                                <img [src]="d.media!.coverImageUrl!" alt="Cover" class="w-24 h-16 object-cover rounded-md border border-border" />
                              }
                              @for (g of d.media?.gallery ?? []; track g.id) {
                                @if (g.url) { <img [src]="g.url" alt="Photo" class="w-24 h-16 object-cover rounded-md border border-border" /> }
                              }
                            </div>
                          }
                        </div>

                        <!-- Inventory, from the existing nested contracts -->
                        <div class="rounded-lg border border-border p-3">
                          <p class="text-[11px] uppercase text-faint mb-2">Inventory</p>
                          <p class="text-[13px] text-content">
                            {{ p.stats.totalBeds }} beds · {{ p.stats.availableBeds }} available ·
                            {{ p.stats.occupiedBeds }} occupied · {{ p.stats.maintenanceBeds }} maintenance
                          </p>
                          <p class="text-[13px] text-muted" [attr.data-testid]="'buildings-' + p.id">{{ buildingsLine() }}</p>
                        </div>
                      </div>
                    </div>
                  }

                  <!-- DECISIONS — only for admins whose backend role may decide -->
                  @if (canReview()) {
                    <div class="flex flex-wrap gap-2 pt-1" [attr.data-testid]="'decisions-' + p.id">
                      @if (confirmApprove() === p.id) {
                        <div class="w-full rounded-lg border border-success/40 bg-success-subtle p-3 flex items-center justify-between gap-3">
                          <span class="text-[13px] text-content">Approve "{{ p.name }}" and publish it to residents?</span>
                          <div class="flex gap-2">
                            <button (click)="approve(p)" [disabled]="acting()" data-testid="approve-confirm"
                                    class="h-9 px-4 rounded-lg bg-success text-white text-[13px] font-semibold disabled:opacity-60">Confirm approve</button>
                            <button (click)="confirmApprove.set(null)" class="h-9 px-3 rounded-lg border border-border text-[13px] text-content">Cancel</button>
                          </div>
                        </div>
                      } @else {
                        <button (click)="confirmApprove.set(p.id); rejectFor.set(null)" [disabled]="acting()" data-testid="approve"
                                class="h-10 px-4 rounded-lg bg-success text-white text-sm font-semibold disabled:opacity-60">Approve</button>
                      }

                      @if (rejectFor() === p.id) {
                        <div class="w-full rounded-lg border border-border p-3 space-y-2">
                          <input [(ngModel)]="rejectReason" maxlength="500" data-testid="reject-reason"
                                 placeholder="Reason for rejection (required, max 500 characters)"
                                 class="w-full h-10 px-3 rounded-lg border border-border bg-panel text-sm text-content" />
                          <div class="flex items-center gap-2">
                            <button (click)="reject(p)" [disabled]="acting() || !rejectReason.trim()" data-testid="reject-confirm"
                                    class="h-9 px-4 rounded-lg bg-danger text-white text-[13px] font-semibold disabled:opacity-60">Confirm reject</button>
                            <button (click)="rejectFor.set(null)" class="h-9 px-3 rounded-lg border border-border text-[13px] text-content">Cancel</button>
                            <span class="text-[11px] text-faint">{{ rejectReason.length }}/500</span>
                          </div>
                        </div>
                      } @else {
                        <button (click)="rejectFor.set(p.id); confirmApprove.set(null)" [disabled]="acting()" data-testid="reject"
                                class="h-10 px-4 rounded-lg border border-danger text-danger text-sm font-semibold disabled:opacity-60">Reject</button>
                      }
                    </div>
                  }

                  @if (actionError(); as ae) {
                    <p class="text-sm text-danger" data-testid="action-error">{{ ae }}</p>
                  }
                </div>
              }
            </article>
          }
        </div>

        <!-- PAGINATION — the existing page/limit convention -->
        <div class="flex items-center justify-between mt-4">
          <p class="text-[13px] text-muted" data-testid="review-count">
            {{ total() }} awaiting review · page {{ page() }} of {{ pages() }}
          </p>
          <div class="flex gap-2">
            <button (click)="go(page() - 1)" [disabled]="page() <= 1" data-testid="prev-page"
                    class="h-9 px-3 rounded-lg border border-border text-[13px] text-content disabled:opacity-40">Previous</button>
            <button (click)="go(page() + 1)" [disabled]="page() >= pages()" data-testid="next-page"
                    class="h-9 px-3 rounded-lg border border-border text-[13px] text-content disabled:opacity-40">Next</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class PropertyReviewComponent {
  private readonly svc = inject(PropertiesService);
  private readonly inventory = inject(InventoryService);
  private readonly session = inject(SessionStore);

  readonly rows = signal<ReviewQueueRow[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly toast = signal<string | null>(null);

  readonly open = signal<string | null>(null);
  readonly detail = signal<RawProperty | null>(null);
  readonly detailLoading = signal(false);
  readonly detailError = signal<string | null>(null);
  readonly buildingsLine = signal('');

  readonly acting = signal(false);
  readonly actionError = signal<string | null>(null);
  readonly confirmApprove = signal<string | null>(null);
  readonly rejectFor = signal<string | null>(null);
  rejectReason = '';

  /** Deciding is its own capability: FINANCE_ADMIN views this queue read-only. */
  readonly canReview = computed(() => this.session.hasCapability('PROPERTY_REVIEW_DECISION'));
  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));

  constructor() { this.reload(); }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.reviewQueue({ page: this.page(), limit: PAGE_SIZE }).subscribe({
      next: (res) => {
        this.rows.set(res.data ?? []);
        this.total.set(res.meta?.total ?? (res.data?.length ?? 0));
        this.loading.set(false);
      },
      // An unreachable queue must never read as "nothing to review".
      error: (e) => { this.error.set(apiErrorMessage(e, 'Could not load the review queue.')); this.loading.set(false); },
    });
  }

  go(page: number): void {
    if (page < 1 || page > this.pages()) return;
    this.page.set(page);
    this.open.set(null);
    this.reload();
  }

  toggle(p: ReviewQueueRow): void {
    if (this.open() === p.id) { this.open.set(null); return; }
    this.open.set(p.id);
    this.confirmApprove.set(null);
    this.rejectFor.set(null);
    this.actionError.set(null);
    this.loadDetail(p.id);
  }

  /** Detail reuses the existing `GET /properties/:id` — admins see any status. */
  private loadDetail(id: string): void {
    this.detail.set(null);
    this.buildingsLine.set('');
    this.detailError.set(null);
    this.detailLoading.set(true);
    this.svc.raw(id).subscribe({
      next: (d) => {
        this.detailLoading.set(false);
        if (!d) { this.detailError.set('Could not load this property.'); return; }
        this.detail.set(d);
      },
      error: (e) => { this.detailLoading.set(false); this.detailError.set(apiErrorMessage(e, 'Could not load this property.')); },
    });
    // Buildings → floors → rooms through the existing nested contracts; no new
    // endpoint was added for the review screen.
    this.inventory.board(id).subscribe({
      next: (b) => this.buildingsLine.set(
        b.buildings.length
          ? `${b.buildings.length} building(s), ${b.floors.length} floor(s), ${b.rooms.length} room(s): ` +
            b.buildings.map((x) => x.name).join(', ')
          : 'No buildings recorded.'),
      error: () => this.buildingsLine.set('Inventory breakdown unavailable.'),
    });
  }

  notReady(p: ReviewQueueRow): string {
    if (!p.readiness.hasBeds) return 'No beds';
    if (!p.readiness.hasPhotos) return 'No photos';
    if (!p.readiness.hasDailyPrices) return 'No daily rates';
    return 'Not ready';
  }

  amenityLabels(d: RawProperty): string {
    const list = (d.amenities ?? []).map((a) => a.label ?? a.key).filter(Boolean);
    return list.length ? list.join(', ') : '—';
  }

  approve(p: ReviewQueueRow): void {
    this.decide(this.svc.verify(p.id), `"${p.name}" approved and published.`, 'Could not approve this property.');
  }

  reject(p: ReviewQueueRow): void {
    const reason = this.rejectReason.trim();
    if (!reason) return;
    this.decide(this.svc.reject(p.id, reason), `"${p.name}" rejected.`, 'Could not reject this property.');
  }

  /** One decision path: act, surface the server's refusal verbatim, then refresh. */
  private decide(obs: import('rxjs').Observable<unknown>, okMsg: string, failMsg: string): void {
    this.acting.set(true);
    this.actionError.set(null);
    obs.subscribe({
      next: () => {
        this.acting.set(false);
        this.confirmApprove.set(null);
        this.rejectFor.set(null);
        this.rejectReason = '';
        this.open.set(null);
        this.toast.set(okMsg);
        setTimeout(() => this.toast.set(null), 4000);
        this.reload();  // the decided property leaves the queue
      },
      error: (e) => { this.acting.set(false); this.actionError.set(apiErrorMessage(e, failMsg)); },
    });
  }
}
