import {
  ChangeDetectionStrategy, Component, computed, inject, input, output, signal,
} from '@angular/core';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import { IconComponent } from './icon.component';
import { EntityAvatarComponent } from './entity-avatar.component';
import { UploadService, MediaItem } from '../../core/data/upload.service';
import { apiErrorMessage } from '../../core/http/api-error';

const AVATAR_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

/**
 * Circular single-image avatar uploader (presign → PUT → confirm → emit key).
 * Falls back to initials (os-avatar) when there is no image. Used for resident
 * avatars, owner avatars, and the self-profile photo. Backend ownership rules
 * apply: a user may set their own avatar; admins may set anyone's.
 */
@Component({
  selector: 'os-avatar-upload',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, EntityAvatarComponent],
  template: `
    <div class="relative inline-block group" [style.width.px]="size()" [style.height.px]="size()">
      @if (currentUrl()) {
        <img [src]="currentUrl()" alt="" class="rounded-full object-cover w-full h-full border border-border" />
      } @else {
        <os-avatar [name]="name()" [size]="size()" />
      }

      <label class="absolute inset-0 rounded-full flex items-center justify-center cursor-pointer" title="Change photo">
        @if (uploading()) {
          <span class="absolute inset-0 rounded-full bg-black/55 flex items-center justify-center">
            <span class="text-[11px] font-semibold text-white">{{ progress() }}%</span>
          </span>
        } @else {
          <span class="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
            <os-icon name="photo_camera" [size]="size() > 48 ? 20 : 16" class="text-white" />
          </span>
        }
        <input type="file" [accept]="acceptAttr" class="hidden" [disabled]="uploading()" (change)="onPick($event)" />
      </label>
    </div>
    @if (error()) { <p class="text-[11px] text-danger mt-1 flex items-center gap-1"><os-icon name="error" [size]="12" /> {{ error() }}</p> }
  `,
})
export class AvatarUploadComponent {
  private readonly uploads = inject(UploadService);

  /** scope: 'resident-avatar' | 'owner-avatar'. */
  readonly scope = input<string>('resident-avatar');
  /** entityType: 'resident' | 'owner'. */
  readonly entityType = input<string>('resident');
  readonly entityId = input.required<string>();
  readonly name = input<string>('');
  readonly size = input<number>(60);
  readonly maxBytes = input<number>(4 * 1024 * 1024);
  /** Initial avatar URL (from the entity read). */
  readonly initialUrl = input<string | null>(null);

  readonly uploaded = output<MediaItem>();

  private readonly localUrl = signal<string | null>(null);
  readonly uploading = signal(false);
  readonly progress = signal(0);
  readonly error = signal<string | null>(null);

  readonly currentUrl = computed(() => this.localUrl() ?? this.initialUrl());
  protected readonly acceptAttr = AVATAR_MIME.join(',');

  async onPick(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = (input.files ?? [])[0];
    input.value = '';
    if (!file) return;
    this.error.set(null);

    if (!AVATAR_MIME.includes(file.type)) { this.error.set('Use JPG, PNG or WebP.'); return; }
    if (file.size > this.maxBytes()) { this.error.set(`Max ${(this.maxBytes() / 1048576).toFixed(0)} MB.`); return; }

    const preview = URL.createObjectURL(file);
    this.localUrl.set(preview);
    this.uploading.set(true);
    this.progress.set(0);
    try {
      const pre = await firstValueFrom(this.uploads.presign(this.scope(), this.entityId(), file));
      await lastValueFrom(
        this.uploads.putToStorage(pre.uploadUrl, file).pipe(),
      );
      const media = await firstValueFrom(
        this.uploads.confirm(this.entityType(), this.entityId(), pre.key, 'avatar', 0),
      );
      this.localUrl.set(media.url ?? preview);
      this.uploaded.emit(media);
    } catch (err) {
      this.error.set(apiErrorMessage(err, 'Upload failed.'));
      this.localUrl.set(null);
    } finally {
      this.uploading.set(false);
      this.progress.set(100);
      if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
    }
  }
}
