import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminOwner, AdminOwnersService, CreateOwnerPayload } from '../../core/data/admin-owners.service';
import { PropertiesService, ReviewQueueRow } from '../../core/data/properties.service';
import { SessionStore } from '../../core/auth/session.store';
import { apiErrorMessage } from '../../core/http/api-error';
import { IconComponent } from '../../shared/components/icon.component';
import { InrPipe } from '../../shared/pipes/inr.pipe';

const PAGE_SIZE = 20;

/**
 * Property Owners (A4) — SUPER_ADMIN's view of the owner accounts and their
 * portfolios.
 *
 * Two things this screen deliberately does not do. It never collects a
 * password: an owner created here is onboarded by OTP on their own phone, so
 * the administrator never holds the credential (that is the difference from
 * Admin Staff, where the console account is the admin's to issue). And it
 * offers no role control: turning an account into an admin is A3's Staff
 * workflow, and this surface must not become a second path to it.
 *
 * The portfolio panel reuses `/admin/properties?ownerId=` — the same contract
 * the review queue reads — rather than a second property listing API.
 */
@Component({
  selector: 'os-property-owners',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, FormsModule, RouterLink, IconComponent, InrPipe],
  template: `
    <div class="p-4 sm:p-6 max-w-[1300px] mx-auto">
      <header class="mb-5 flex items-start justify-between gap-4">
        <div>
          <p class="text-[11px] font-semibold tracking-wider text-accent uppercase">Administration</p>
          <h1 class="text-2xl font-bold text-content">Property Owners</h1>
          <p class="text-sm text-muted mt-1">Owner accounts and their portfolios. Owners complete their own onboarding.</p>
        </div>
        <button (click)="showCreate.set(!showCreate())" data-testid="new-owner"
                class="h-10 px-4 rounded-lg bg-accent text-white text-sm font-semibold shrink-0">
          {{ showCreate() ? 'Cancel' : '+ New owner' }}
        </button>
      </header>

      @if (toast(); as t) {
        <div class="mb-4 rounded-lg border border-border bg-panel px-4 py-3 text-sm text-content" data-testid="toast">{{ t }}</div>
      }

      @if (showCreate()) {
        <form (ngSubmit)="create()" data-testid="create-form" class="mb-5 rounded-xl border border-border bg-panel p-4 space-y-3">
          <div class="grid sm:grid-cols-2 gap-3">
            <label class="text-[13px] text-muted">Owner phone
              <input [(ngModel)]="form.phone" name="phone" data-testid="owner-phone" placeholder="9876543210"
                     class="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-panel text-sm text-content" />
            </label>
            <label class="text-[13px] text-muted">Email (optional)
              <input [(ngModel)]="form.email" name="email" data-testid="owner-email" placeholder="owner@example.com"
                     class="mt-1 w-full h-10 px-3 rounded-lg border border-border bg-panel text-sm text-content" />
            </label>
          </div>
          <div class="rounded-lg border border-border bg-canvas p-3" data-testid="onboarding-note">
            <p class="text-[13px] font-semibold text-content">The owner completes their own sign-in setup</p>
            <p class="text-[12px] text-muted mt-1">
              We send a one-time code to this phone. The owner verifies it and then signs in through the Owner app.
              You do not set, see, or hold their password.
            </p>
          </div>
          <div class="flex items-center gap-3">
            <button type="submit" [disabled]="saving() || !phoneValid()" data-testid="create-submit"
                    class="h-10 px-4 rounded-lg bg-accent text-white text-sm font-semibold disabled:opacity-60">Create owner &amp; send code</button>
            @if (createError(); as e) { <p class="text-sm text-danger" data-testid="create-error">{{ e }}</p> }
          </div>
        </form>
      }

      @if (loading()) {
        <div class="rounded-xl border border-border bg-panel p-10 text-center" data-testid="owners-loading">
          <p class="text-sm text-muted">Loading property owners…</p>
        </div>
      } @else if (error(); as err) {
        <div class="rounded-xl border border-danger/40 bg-danger-subtle p-8 text-center" data-testid="owners-error">
          <os-icon name="error" [size]="28" />
          <p class="mt-2 text-sm font-semibold text-content">The owner list could not be loaded.</p>
          <p class="text-sm text-muted">{{ err }}</p>
          <button (click)="reload()" class="mt-4 h-9 px-4 rounded-lg bg-accent text-white text-sm font-semibold">Try again</button>
        </div>
      } @else if (rows().length === 0) {
        <div class="rounded-xl border border-border bg-panel p-10 text-center" data-testid="owners-empty">
          <p class="text-sm font-semibold text-content">No property owners yet.</p>
        </div>
      } @else {
        <div class="rounded-xl border border-border bg-panel overflow-hidden" data-testid="owners-list">
          <table class="w-full text-sm">
            <thead class="bg-canvas text-[11px] uppercase text-faint">
              <tr>
                <th class="text-left px-4 py-2.5">Owner</th>
                <th class="text-left px-4 py-2.5">Onboarding</th>
                <th class="text-left px-4 py-2.5">Status</th>
                <th class="text-left px-4 py-2.5">Portfolio</th>
                <th class="text-right px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (o of rows(); track o.id) {
                <tr class="border-t border-border" [attr.data-testid]="'owner-' + o.id">
                  <td class="px-4 py-3">
                    <p class="font-medium text-content">{{ o.phone }}</p>
                    <p class="text-[12px] text-faint">{{ o.email ?? '—' }} · joined {{ o.createdAt | date: 'd MMM y' }}</p>
                  </td>
                  <td class="px-4 py-3">
                    <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          [class]="o.onboarding.phoneVerified ? 'bg-success-subtle text-success' : 'bg-warning-subtle text-warning'"
                          [attr.data-testid]="'onboarding-' + o.id">
                      {{ o.onboarding.phoneVerified ? 'Phone verified' : 'Awaiting code' }}
                    </span>
                    @if (!o.onboarding.hasPassword) {
                      <span class="ml-1 text-[11px] text-faint">signs in by code</span>
                    }
                  </td>
                  <td class="px-4 py-3">
                    <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          [class]="o.status === 'ACTIVE' ? 'bg-success-subtle text-success' : (o.status === 'SUSPENDED' ? 'bg-danger-subtle text-danger' : 'bg-warning-subtle text-warning')">
                      {{ o.status }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-[13px] text-content">
                    <button (click)="openPortfolio(o)" [attr.data-testid]="'portfolio-' + o.id"
                            class="underline underline-offset-2 hover:text-accent">
                      {{ o.properties.total }} propert{{ o.properties.total === 1 ? 'y' : 'ies' }}
                    </button>
                    <span class="text-[12px] text-faint">
                      ({{ o.properties.active }} active · {{ o.properties.pendingReview }} in review · {{ o.properties.draft }} draft)
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right whitespace-nowrap">
                    @if (o.status === 'SUSPENDED') {
                      <button (click)="setStatus(o, 'ACTIVE')" [disabled]="acting()" [attr.data-testid]="'activate-' + o.id"
                              class="h-9 px-3 rounded-lg border border-border text-content text-[13px] font-semibold disabled:opacity-60">Reactivate</button>
                    } @else {
                      <button (click)="setStatus(o, 'SUSPENDED')" [disabled]="acting()" [attr.data-testid]="'suspend-' + o.id"
                              class="h-9 px-3 rounded-lg border border-danger text-danger text-[13px] font-semibold disabled:opacity-60">Suspend</button>
                    }
                  </td>
                </tr>

                @if (openOwner() === o.id) {
                  <tr class="border-t border-border bg-canvas" [attr.data-testid]="'detail-' + o.id">
                    <td colspan="5" class="px-4 py-4">
                      <div class="flex items-center justify-between mb-3">
                        <p class="text-[13px] font-semibold text-content">Properties owned by {{ o.phone }}</p>
                        <a routerLink="/properties/new" [queryParams]="{ ownerId: o.id }" data-testid="create-for-owner"
                           class="h-9 px-3 rounded-lg bg-accent text-white text-[13px] font-semibold flex items-center">+ Create property for this owner</a>
                      </div>
                      @if (portfolioLoading()) {
                        <p class="text-sm text-muted" data-testid="portfolio-loading">Loading portfolio…</p>
                      } @else if (portfolioError(); as pe) {
                        <p class="text-sm text-danger" data-testid="portfolio-error">{{ pe }}</p>
                      } @else if (portfolio().length === 0) {
                        <p class="text-sm text-muted" data-testid="portfolio-empty">This owner has no properties yet.</p>
                      } @else {
                        <div class="space-y-2" data-testid="portfolio-list">
                          @for (p of portfolio(); track p.id) {
                            <div class="rounded-lg border border-border bg-panel px-3 py-2 flex flex-wrap items-center gap-3">
                              <span class="font-medium text-content">{{ p.name }}</span>
                              <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-border text-muted">{{ p.status }}</span>
                              <span class="text-[12px] text-muted">{{ p.city }}</span>
                              <span class="text-[12px] text-muted">{{ p.stats.totalBeds }} beds · {{ p.photoCount }} photos</span>
                              <span class="text-[12px] text-muted">from {{ p.minPricePaisa | inr }}</span>
                              <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                                    [class]="p.readiness.ready ? 'bg-success-subtle text-success' : 'bg-warning-subtle text-warning'">
                                {{ p.readiness.ready ? 'Ready' : 'Not ready' }}
                              </span>
                              <span class="text-[12px] text-faint">created {{ p.createdAt | date: 'd MMM y' }}</span>
                            </div>
                          }
                        </div>
                      }
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>

        @if (actionError(); as ae) { <p class="mt-3 text-sm text-danger" data-testid="action-error">{{ ae }}</p> }

        <div class="flex items-center justify-between mt-4">
          <p class="text-[13px] text-muted" data-testid="owners-count">{{ total() }} owner(s) · page {{ page() }} of {{ pages() }}</p>
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
export class PropertyOwnersComponent {
  private readonly svc = inject(AdminOwnersService);
  private readonly properties = inject(PropertiesService);
  private readonly session = inject(SessionStore);

  readonly rows = signal<AdminOwner[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly toast = signal<string | null>(null);

  readonly showCreate = signal(false);
  readonly saving = signal(false);
  readonly createError = signal<string | null>(null);
  readonly acting = signal(false);
  readonly actionError = signal<string | null>(null);

  readonly openOwner = signal<string | null>(null);
  readonly portfolio = signal<ReviewQueueRow[]>([]);
  readonly portfolioLoading = signal(false);
  readonly portfolioError = signal<string | null>(null);

  protected form: CreateOwnerPayload = { phone: '', email: '' };
  readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  /** Mutation here is OWNER_ADMINISTRATION; the route guard already checks it. */
  readonly canAdminister = computed(() => this.session.hasCapability('OWNER_ADMINISTRATION'));

  constructor() { this.reload(); }

  phoneValid(): boolean { return /^[6-9]\d{9}$/.test(this.form.phone.trim()); }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.list(this.page(), PAGE_SIZE).subscribe({
      next: (res) => {
        this.rows.set(res.data ?? []);
        this.total.set(res.meta?.total ?? (res.data?.length ?? 0));
        this.loading.set(false);
      },
      error: (e) => { this.error.set(apiErrorMessage(e, 'Could not load property owners.')); this.loading.set(false); },
    });
  }

  go(page: number): void {
    if (page < 1 || page > this.pages()) return;
    this.page.set(page);
    this.openOwner.set(null);
    this.reload();
  }

  create(): void {
    if (!this.phoneValid()) return;
    this.saving.set(true);
    this.createError.set(null);
    const payload: CreateOwnerPayload = {
      phone: this.form.phone.trim(),
      ...(this.form.email?.trim() ? { email: this.form.email.trim() } : {}),
    };
    this.svc.create(payload).subscribe({
      next: (r) => {
        this.saving.set(false);
        this.showCreate.set(false);
        this.form = { phone: '', email: '' };
        this.flash(`${r.owner.phone} created. ${r.message} — they verify it and then sign in to the Owner app.`);
        this.reload();
      },
      error: (e) => { this.saving.set(false); this.createError.set(apiErrorMessage(e, 'Could not create the owner.')); },
    });
  }

  openPortfolio(o: AdminOwner): void {
    if (this.openOwner() === o.id) { this.openOwner.set(null); return; }
    this.openOwner.set(o.id);
    this.portfolio.set([]);
    this.portfolioError.set(null);
    this.portfolioLoading.set(true);
    // Every status, not just the review queue's default.
    this.properties.ownerPortfolio(o.id, undefined, 1, 100).subscribe({
      next: (res) => { this.portfolio.set(res.data ?? []); this.portfolioLoading.set(false); },
      error: (e) => { this.portfolioError.set(apiErrorMessage(e, 'Could not load this portfolio.')); this.portfolioLoading.set(false); },
    });
  }

  setStatus(o: AdminOwner, status: 'ACTIVE' | 'SUSPENDED'): void {
    this.acting.set(true);
    this.actionError.set(null);
    this.svc.setStatus(o.id, status).subscribe({
      next: () => {
        this.acting.set(false);
        this.flash(status === 'SUSPENDED'
          ? `${o.phone} suspended. Their sessions were revoked.`
          : `${o.phone} reactivated.`);
        this.reload();
      },
      error: (e) => { this.acting.set(false); this.actionError.set(apiErrorMessage(e, 'Could not apply that change.')); this.reload(); },
    });
  }

  private flash(msg: string): void {
    this.toast.set(msg);
    setTimeout(() => this.toast.set(null), 6000);
  }
}
