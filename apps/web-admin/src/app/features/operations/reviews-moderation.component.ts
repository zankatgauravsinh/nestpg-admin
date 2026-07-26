import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ReviewsService, ApiReview, ReviewAggregate } from '../../core/data/reviews.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { LoadingStateComponent } from '../../shared/components/loading-state.component';
import { StatusPillComponent } from '../../shared/components/status-pill.component';
import { DrawerShellComponent } from '../../shared/components/drawer-shell.component';
import { IconComponent } from '../../shared/components/icon.component';

@Component({
  selector: 'os-reviews-moderation',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe, PageHeaderComponent, EmptyStateComponent, LoadingStateComponent,
    StatusPillComponent, DrawerShellComponent, IconComponent,
  ],
  template: `
    <os-page-header eyebrow="Operations" title="Review Moderation" subtitle="Approve, reject and analyse resident reviews." />

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- Queue -->
      <div class="lg:col-span-2 bg-panel border border-border rounded-[16px] overflow-hidden">
        <div class="flex items-center gap-1 px-3 pt-3 border-b border-border">
          @for (t of tabs; track t.id) {
            <button (click)="tab.set(t.id)" class="px-3.5 h-9 text-[13px] font-medium border-b-2 -mb-px transition" [class]="tab() === t.id ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-content'">{{ t.label }} ({{ countFor(t.id) }})</button>
          }
          <div class="ml-auto pb-2"><button (click)="loadQueue()" class="h-8 px-3 rounded-lg border border-border text-[13px] text-content hover:bg-canvas flex items-center gap-1.5"><os-icon name="refresh" [size]="15" /> Refresh</button></div>
        </div>
        @if (loading()) {
          <div class="p-5"><os-loading variant="skeleton" /></div>
        } @else if (visible().length === 0) {
          <os-empty-state icon="reviews" title="Nothing to moderate" message="No reviews in this state." />
        } @else {
          <div class="divide-y divide-border-subtle">
            @for (r of visible(); track r.id) {
              <button (click)="open(r)" class="w-full text-left px-5 py-4 hover:bg-canvas/60 transition flex items-start gap-3">
                <span class="w-10 h-10 rounded-lg bg-accent-subtle text-accent flex items-center justify-center shrink-0 font-semibold">{{ r.rating }}★</span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2"><p class="text-sm font-medium text-content truncate">{{ r.title || (r.subject_type + ' review') }}</p><os-status-pill [status]="r.status" [dot]="false" /></div>
                  <p class="text-[13px] text-muted line-clamp-2">{{ r.body || '(no comment)' }}</p>
                  <p class="text-[11px] text-faint mt-0.5">{{ r.subject_type }} · {{ r.created_at | date:'dd MMM yyyy' }}@if (r.flag_count) { · {{ r.flag_count }} flag(s) }</p>
                </div>
                <os-icon name="chevron_right" [size]="18" class="text-faint" />
              </button>
            }
          </div>
        }
      </div>

      <!-- Analytics: top-rated properties -->
      <div class="bg-panel border border-border rounded-[16px] p-5">
        <h3 class="text-base font-semibold text-content mb-4">Top rated properties</h3>
        @if (top().length === 0) {
          <p class="text-sm text-muted py-6 text-center">No rated properties yet.</p>
        } @else {
          <div class="space-y-3">
            @for (t of top(); track t.subject_id) {
              <div class="flex items-center justify-between">
                <div class="min-w-0"><p class="text-sm font-medium text-content truncate">{{ t.name || t.subject_id.slice(0,8) }}</p><p class="text-[11px] text-faint">{{ t.review_count }} review(s)</p></div>
                <span class="text-sm font-semibold text-content shrink-0">{{ num(t.avg_rating).toFixed(1) }} ★</span>
              </div>
            }
          </div>
        }
      </div>
    </div>

    <!-- Review drawer -->
    <os-drawer [open]="!!detail()" [title]="detail()?.title || 'Review'" subtitle="Review detail" width="460px" (closed)="detail.set(null)">
      @if (detail(); as r) {
        <div class="space-y-5">
          <div class="flex items-center justify-between">
            <span class="text-2xl font-semibold text-content">{{ r.rating }} <span class="text-warning">★</span></span>
            <os-status-pill [status]="r.status" />
          </div>
          @if (r.body) { <p class="text-sm text-content leading-relaxed">{{ r.body }}</p> }
          <div class="rounded-xl border border-border divide-y divide-border-subtle">
            <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">Subject</span><span class="text-sm text-content">{{ r.subject_type }}</span></div>
            <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">Submitted</span><span class="text-sm text-content">{{ r.created_at | date:'dd MMM yyyy' }}</span></div>
            @if (r.flag_count) { <div class="flex justify-between px-4 py-2"><span class="text-sm text-muted">Flags</span><span class="text-sm text-danger">{{ r.flag_count }}</span></div> }
          </div>
          @if (aspectKeys(r).length) {
            <div><p class="text-[12px] uppercase tracking-wider text-faint mb-2">Aspect ratings</p>
              <div class="grid grid-cols-2 gap-2">
                @for (k of aspectKeys(r); track k) { <div class="flex items-center justify-between rounded-lg border border-border px-3 py-1.5"><span class="text-[13px] text-muted capitalize">{{ k }}</span><span class="text-[13px] font-medium text-content">{{ r.aspects[k] }}★</span></div> }
              </div>
            </div>
          }
        </div>
      }
      <div footer class="w-full space-y-2">
        <div class="grid grid-cols-3 gap-2">
          <button (click)="moderate('APPROVE')" [disabled]="acting()" class="h-10 rounded-lg bg-success text-white text-[13px] font-semibold disabled:opacity-60">Approve</button>
          <button (click)="moderate('REJECT')" [disabled]="acting()" class="h-10 rounded-lg border border-danger text-danger text-[13px] font-semibold disabled:opacity-60">Reject</button>
          <button (click)="moderate('HIDE')" [disabled]="acting()" class="h-10 rounded-lg border border-border text-content text-[13px] font-semibold disabled:opacity-60">Hide</button>
        </div>
        @if (msg()) { <p class="text-[12px]" [class.text-danger]="err()" [class.text-success]="!err()">{{ msg() }}</p> }
        <button (click)="detail.set(null)" class="w-full h-10 rounded-lg border border-border text-sm font-medium text-content hover:bg-canvas">Close</button>
      </div>
    </os-drawer>
  `,
})
export class ReviewsModerationComponent {
  private readonly svc = inject(ReviewsService);

  protected readonly tabs = [{ id: 'PENDING', label: 'Pending' }, { id: 'FLAGGED', label: 'Flagged' }];
  readonly tab = signal('PENDING');
  readonly queue = signal<ApiReview[]>([]);
  readonly top = signal<(ReviewAggregate & { name?: string })[]>([]);
  readonly loading = signal(true);
  readonly detail = signal<ApiReview | null>(null);
  readonly acting = signal(false);
  readonly msg = signal<string | null>(null);
  readonly err = signal(false);

  readonly visible = computed(() => this.queue().filter((r) => r.status === this.tab()));
  num = (v: unknown) => Number(v ?? 0);
  countFor = (status: string) => this.queue().filter((r) => r.status === status).length;
  aspectKeys = (r: ApiReview) => Object.keys(r.aspects ?? {});

  constructor() { this.loadQueue(); this.svc.top('PROPERTY', 8).subscribe((t) => this.top.set(t)); }

  loadQueue(): void {
    this.loading.set(true);
    this.svc.queue(1, 100).subscribe((q) => { this.queue.set(q); this.loading.set(false); });
  }

  open(r: ApiReview): void { this.msg.set(null); this.svc.get(r.id).subscribe((d) => this.detail.set(d ?? r)); }

  moderate(decision: 'APPROVE' | 'REJECT' | 'HIDE'): void {
    const r = this.detail(); if (!r) return;
    this.acting.set(true); this.msg.set(null);
    this.svc.moderate(r.id, decision).subscribe({
      next: () => { this.acting.set(false); this.err.set(false); this.msg.set(`Review ${decision.toLowerCase()}d.`); this.detail.set(null); this.loadQueue(); this.svc.top('PROPERTY', 8).subscribe((t) => this.top.set(t)); },
      error: (e) => { this.acting.set(false); this.err.set(true); this.msg.set(apiErrorMessage(e, 'Could not moderate.')); },
    });
  }
}
