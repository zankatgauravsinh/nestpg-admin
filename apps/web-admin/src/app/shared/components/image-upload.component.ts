import {
  ChangeDetectionStrategy, Component, computed, effect, inject, input, model, output, signal,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { IconComponent } from './icon.component';
import { UploadService, MediaItem } from '../../core/data/upload.service';
import { apiErrorMessage } from '../../core/http/api-error';

type ItemStatus = 'uploading' | 'done' | 'error';

interface UploadItem {
  localId: string;
  status: ItemStatus;
  progress: number;
  preview: string;        // object URL or remote url
  error?: string;
  file?: File;            // present while uploading/error (for retry/cancel)
  media?: MediaItem;      // present once confirmed
  sub?: Subscription;
}

const DEFAULT_ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];

/**
 * Production image uploader. Per file: validate → presign → PUT (progress) →
 * confirm → emit persisted KEY. Supports multiple, drag-drop, preview, per-item
 * progress/retry/cancel, and delete (soft-deletes the Media row server-side).
 *
 * The component is key-centric: it never deals in full URLs for persistence.
 * `keysChange` emits the current list of confirmed storage keys; `mediaChange`
 * emits the full MediaItem[] (id/key/url) for richer callers.
 */
@Component({
  selector: 'os-image-upload',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div
      class="rounded-xl border border-dashed p-3 transition"
      [class.border-accent]="dragging()"
      [class.bg-accent-subtle]="dragging()"
      [class.border-border-strong]="!dragging()"
      (dragover)="onDragOver($event)" (dragleave)="dragging.set(false)" (drop)="onDrop($event)">

      <div class="flex flex-wrap gap-2.5">
        @for (it of items(); track it.localId) {
          <div class="relative w-20 h-20 rounded-xl overflow-hidden border border-border group">
            <img [src]="it.preview" class="w-full h-full object-cover" alt="" />

            @if (it.status === 'uploading') {
              <div class="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1">
                <span class="text-[11px] text-white font-semibold">{{ it.progress }}%</span>
                <div class="w-14 h-1 rounded bg-white/30 overflow-hidden">
                  <div class="h-full bg-white transition-all" [style.width.%]="it.progress"></div>
                </div>
                <button type="button" (click)="cancel(it)" class="text-[10px] text-white/90 underline">cancel</button>
              </div>
            }
            @if (it.status === 'error') {
              <div class="absolute inset-0 bg-danger/70 flex flex-col items-center justify-center gap-1 px-1 text-center">
                <os-icon name="error" [size]="16" class="text-white" />
                <button type="button" (click)="retry(it)" class="text-[10px] text-white underline">retry</button>
              </div>
            }
            @if (it.status === 'done') {
              <button type="button" (click)="remove(it)" class="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                <os-icon name="close" [size]="13" />
              </button>
            }
          </div>
        }

        @if (canAddMore()) {
          <label class="w-20 h-20 rounded-xl border border-dashed border-border-strong flex flex-col items-center justify-center text-faint hover:border-accent hover:text-accent cursor-pointer transition">
            <os-icon name="add_photo_alternate" [size]="22" />
            <span class="text-[10px] mt-0.5">Add</span>
            <input type="file" [accept]="acceptAttr()" [multiple]="multiple()" class="hidden" (change)="onPick($event)" />
          </label>
        }
      </div>

      @if (formError()) { <p class="text-[11px] text-danger mt-1.5 flex items-center gap-1"><os-icon name="error" [size]="13" /> {{ formError() }}</p> }
      <p class="text-[11px] text-faint mt-1.5">
        {{ doneCount() }} uploaded@if (!entityId()) { · waiting for record to be saved }.
      </p>
    </div>
  `,
})
export class ImageUploadComponent {
  private readonly uploads = inject(UploadService);

  // Inputs ───────────────────────────────────────────────────────────────────
  /** Storage scope, e.g. 'property-cover' | 'property-gallery' | 'building' | 'room' | 'resident-avatar'. */
  readonly scope = input.required<string>();
  /** Generic entity type for confirm: 'property' | 'building' | 'room' | 'resident' | 'owner'. */
  readonly entityType = input.required<string>();
  /** Target entity id. When empty the picker is disabled until the record exists. */
  readonly entityId = input<string>('');
  /** Optional semantic role: 'cover' | 'gallery' | 'avatar'. */
  readonly role = input<string | undefined>(undefined);
  readonly multiple = input<boolean>(true);
  readonly max = input<number>(20);
  readonly maxBytes = input<number>(10 * 1024 * 1024);
  readonly accept = input<string[]>(DEFAULT_ACCEPT);
  /** Pre-existing media to render (already persisted). */
  readonly existing = model<MediaItem[]>([]);

  // Outputs ────────────────────────────────────────────────────────────────────
  readonly keysChange = output<string[]>();
  readonly mediaChange = output<MediaItem[]>();

  readonly items = signal<UploadItem[]>([]);
  readonly dragging = signal(false);
  readonly formError = signal<string | null>(null);

  private seeded = false;
  constructor() {
    // Seed once from server-provided existing media (renders already-saved items).
    effect(() => {
      const ex = this.existing();
      if (this.seeded || !ex.length) return;
      this.seeded = true;
      this.items.set(ex.map((m) => ({
        localId: m.id, status: 'done' as const, progress: 100,
        preview: m.url ?? '', media: m,
      })));
    });
  }

  readonly doneCount = computed(() => this.items().filter((i) => i.status === 'done').length);
  readonly acceptAttr = computed(() => this.accept().join(','));
  readonly canAddMore = computed(() => {
    if (!this.entityId()) return false;
    const count = this.items().length;
    return this.multiple() ? count < this.max() : count === 0;
  });

  // Picking / dropping ──────────────────────────────────────────────────────────
  onPick(e: Event): void {
    const input = e.target as HTMLInputElement;
    this.enqueue(Array.from(input.files ?? []));
    input.value = '';
  }

  onDragOver(e: DragEvent): void { e.preventDefault(); if (this.canAddMore()) this.dragging.set(true); }
  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragging.set(false);
    if (!this.canAddMore()) return;
    this.enqueue(Array.from(e.dataTransfer?.files ?? []));
  }

  private enqueue(files: File[]): void {
    this.formError.set(null);
    if (!this.entityId()) { this.formError.set('Save the record first, then add images.'); return; }
    let list = files;
    if (!this.multiple()) list = files.slice(0, 1);
    for (const f of list) {
      const err = this.validate(f);
      if (err) { this.formError.set(err); continue; }
      const item: UploadItem = {
        localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        status: 'uploading', progress: 0, preview: URL.createObjectURL(f), file: f,
      };
      this.items.update((l) => (this.multiple() ? [...l, item] : [item]));
      this.start(item);
    }
  }

  private validate(f: File): string | null {
    if (!this.accept().includes(f.type)) return `Unsupported type: ${f.type || 'unknown'}.`;
    if (f.size > this.maxBytes()) return `File too large (max ${(this.maxBytes() / 1048576).toFixed(0)} MB).`;
    return null;
  }

  // Upload pipeline ─────────────────────────────────────────────────────────────
  private start(item: UploadItem): void {
    const file = item.file!;
    item.sub = this.uploads.presign(this.scope(), this.entityId(), file).subscribe({
      next: (pre) => {
        item.sub = this.uploads.putToStorage(pre.uploadUrl, file).subscribe({
          next: (ev) => {
            if (ev.type === 'progress') this.patch(item, { progress: ev.pct });
            else this.confirm(item, pre.key);
          },
          error: (e) => this.fail(item, e),
        });
      },
      error: (e) => this.fail(item, e),
    });
  }

  private confirm(item: UploadItem, key: string): void {
    this.uploads
      .confirm(this.entityType(), this.entityId(), key, this.role())
      .subscribe({
        next: (media) => {
          this.patch(item, { status: 'done', progress: 100, media, file: undefined, preview: media.url ?? item.preview });
          this.emit();
        },
        error: (e) => this.fail(item, e),
      });
  }

  private fail(item: UploadItem, e: unknown): void {
    this.patch(item, { status: 'error', error: apiErrorMessage(e, 'Upload failed.') });
  }

  retry(item: UploadItem): void {
    if (!item.file) return;
    this.patch(item, { status: 'uploading', progress: 0, error: undefined });
    this.start(item);
  }

  cancel(item: UploadItem): void {
    item.sub?.unsubscribe();
    this.dropItem(item);
  }

  remove(item: UploadItem): void {
    if (item.media) {
      this.uploads.remove(item.media.id).subscribe({ next: () => {}, error: () => {} });
    }
    this.dropItem(item);
    this.emit();
  }

  private dropItem(item: UploadItem): void {
    if (item.preview.startsWith('blob:')) URL.revokeObjectURL(item.preview);
    this.items.update((l) => l.filter((i) => i.localId !== item.localId));
  }

  private patch(item: UploadItem, patch: Partial<UploadItem>): void {
    this.items.update((l) => l.map((i) => (i.localId === item.localId ? { ...i, ...patch } : i)));
  }

  private emit(): void {
    const media = this.items().filter((i) => i.status === 'done' && i.media).map((i) => i.media!);
    this.mediaChange.emit(media);
    this.keysChange.emit(media.map((m) => m.key));
  }
}
