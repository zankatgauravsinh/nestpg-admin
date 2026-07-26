import {
  ChangeDetectionStrategy, Component, inject, input, signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { IconComponent } from './icon.component';
import { UploadService } from '../../core/data/upload.service';
import { apiErrorMessage } from '../../core/http/api-error';

/**
 * Private document tile (e.g. KYC). Stores only a storage KEY; the viewable URL
 * is fetched on demand via a 60s presigned GET (`POST /uploads/presign-get`) so
 * the object is never publicly addressable. View opens an in-tile lightbox (for
 * images) or a new tab (PDF / non-image).
 */
@Component({
  selector: 'os-private-doc',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="bg-panel border border-border rounded-[16px] overflow-hidden flex flex-col">
      <button (click)="open()" [disabled]="loading()"
        class="aspect-[4/3] bg-canvas overflow-hidden group relative flex items-center justify-center text-faint">
        @if (loading()) {
          <span class="w-5 h-5 rounded-full border-2 border-border-strong border-t-accent animate-spin"></span>
        } @else if (signedUrl() && isImage()) {
          <img [src]="signedUrl()" [alt]="label()" class="w-full h-full object-cover" />
        } @else {
          <os-icon [name]="isImage() ? 'lock' : 'picture_as_pdf'" [size]="28" />
        }
        <span class="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition">
          <span class="opacity-0 group-hover:opacity-100 text-white text-xs font-semibold flex items-center gap-1">
            <os-icon name="visibility" [size]="16" /> View
          </span>
        </span>
      </button>
      <div class="p-3 flex items-center justify-between gap-2">
        <p class="text-[13px] font-medium text-content truncate">{{ label() }}</p>
        <span class="text-[11px] text-faint shrink-0 flex items-center gap-1"><os-icon name="lock" [size]="12" /> Private</span>
      </div>
      @if (error()) { <p class="px-3 pb-2 text-[11px] text-danger">{{ error() }}</p> }
    </div>

    @if (lightbox(); as url) {
      <div class="fixed inset-0 z-[70] flex items-center justify-center p-6" (click)="lightbox.set(null)">
        <div class="absolute inset-0 bg-black/70"></div>
        <div class="relative max-w-2xl w-full bg-panel rounded-[16px] overflow-hidden" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between px-4 h-12 border-b border-border">
            <p class="text-sm font-semibold text-content flex items-center gap-1.5"><os-icon name="lock" [size]="15" /> {{ label() }}</p>
            <button (click)="lightbox.set(null)" class="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:bg-canvas"><os-icon name="close" [size]="18" /></button>
          </div>
          <img [src]="url" [alt]="label()" class="w-full max-h-[70vh] object-contain bg-canvas" />
        </div>
      </div>
    }
  `,
})
export class PrivateDocComponent {
  private readonly uploads = inject(UploadService);

  readonly docKey = input.required<string>();
  readonly label = input<string>('Document');
  /** Hint for rendering; defaults to image. */
  readonly mimeType = input<string | null>(null);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly signedUrl = signal<string | null>(null);
  readonly lightbox = signal<string | null>(null);

  isImage(): boolean {
    const m = this.mimeType();
    if (m) return m.startsWith('image/');
    return !/\.pdf$/i.test(this.docKey());
  }

  async open(): Promise<void> {
    this.error.set(null);
    this.loading.set(true);
    try {
      const { url } = await firstValueFrom(this.uploads.presignGet(this.docKey()));
      this.signedUrl.set(url);
      if (this.isImage()) this.lightbox.set(url);
      else window.open(url, '_blank', 'noopener');
    } catch (err) {
      this.error.set(apiErrorMessage(err, 'Could not load document.'));
    } finally {
      this.loading.set(false);
    }
  }
}
