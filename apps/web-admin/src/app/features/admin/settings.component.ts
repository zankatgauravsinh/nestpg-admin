import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { ApiService } from '../../core/api/api.service';
import { ThemeService } from '../../core/theme/theme.service';
import { PageHeaderComponent } from '../../shared/components/page-header.component';
import { IconComponent } from '../../shared/components/icon.component';
import { AvatarUploadComponent } from '../../shared/components/avatar-upload.component';

interface Profile { fullName?: string; email?: string; phone?: string; [k: string]: unknown }
interface Me { id: string; avatarUrl?: string | null; [k: string]: unknown }

@Component({
  selector: 'os-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, PageHeaderComponent, IconComponent, AvatarUploadComponent],
  template: `
    <os-page-header eyebrow="Administration" title="Settings"
      subtitle="Manage your profile and workspace preferences." />

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <!-- Profile -->
      <div class="lg:col-span-2 bg-panel border border-border rounded-[16px] p-5">
        <h3 class="text-base font-semibold text-content mb-4">Profile</h3>
        @if (me(); as m) {
          <div class="flex items-center gap-4 mb-5">
            <os-avatar-upload entityType="resident" scope="resident-avatar"
              [entityId]="m.id" [name]="form.fullName ?? 'Me'" [size]="64" [initialUrl]="m.avatarUrl ?? null" />
            <div><p class="text-sm font-medium text-content">Profile photo</p>
              <p class="text-xs text-muted">JPG, PNG or WebP, up to 4 MB.</p></div>
          </div>
        }
        <div class="grid sm:grid-cols-2 gap-4">
          <label class="block"><span class="text-[12px] font-medium text-muted">Full name</span>
            <input [(ngModel)]="form.fullName" class="field mt-1.5" /></label>
          <label class="block"><span class="text-[12px] font-medium text-muted">Email</span>
            <input [(ngModel)]="form.email" type="email" class="field mt-1.5" /></label>
          <label class="block"><span class="text-[12px] font-medium text-muted">Phone</span>
            <input [(ngModel)]="form.phone" class="field mt-1.5" /></label>
        </div>
        <div class="flex items-center gap-3 mt-5">
          <button (click)="save()" class="h-10 px-4 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition">Save changes</button>
          @if (msg()) { <span class="text-xs text-success flex items-center gap-1"><os-icon name="check" [size]="14" /> {{ msg() }}</span> }
        </div>
      </div>

      <!-- Preferences -->
      <div class="bg-panel border border-border rounded-[16px] p-5">
        <h3 class="text-base font-semibold text-content mb-4">Appearance</h3>
        <div class="flex items-center justify-between">
          <div><p class="text-sm font-medium text-content">Dark mode</p><p class="text-xs text-muted">Switch the workspace theme</p></div>
          <button (click)="theme.toggle()" class="w-12 h-7 rounded-full transition relative" [class]="theme.isDark() ? 'bg-accent' : 'bg-border-strong'">
            <span class="absolute top-1 w-5 h-5 rounded-full bg-white transition-all" [class]="theme.isDark() ? 'left-6' : 'left-1'"></span>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .field { width:100%; height:40px; padding:0 12px; border-radius:8px; border:1px solid var(--border);
      background:var(--panel); font-size:14px; color:var(--text-primary); outline:none; transition:all .15s; }
    .field:focus { border-color:var(--accent); box-shadow:0 0 0 2px color-mix(in srgb, var(--accent) 15%, transparent); }
  `],
})
export class SettingsComponent {
  private readonly api = inject(ApiService);
  protected readonly theme = inject(ThemeService);

  private readonly loaded = toSignal(
    this.api.get<Profile>('/users/me/profile').pipe(catchError(() => of<Profile>({}))),
    { initialValue: {} as Profile },
  );
  /** Self identity (id + avatar) for the profile-photo uploader. */
  readonly me = toSignal(
    this.api.get<Me>('/users/me').pipe(catchError(() => of(null))),
    { initialValue: null as Me | null },
  );
  protected form: Profile = {};
  readonly msg = signal<string | null>(null);

  constructor() {
    effect(() => { this.form = { ...this.loaded() }; });
  }

  save(): void {
    this.api.put('/users/me/profile', this.form).pipe(catchError(() => of(null))).subscribe(() => {
      this.msg.set('Profile saved.');
    });
  }
}
