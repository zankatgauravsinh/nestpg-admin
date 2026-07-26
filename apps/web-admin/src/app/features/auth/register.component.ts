import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { IconComponent } from '../../shared/components/icon.component';

@Component({
  selector: 'os-register',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, IconComponent],
  template: `
    <div class="mb-8">
      <h2 class="text-2xl font-semibold text-content mb-1.5">Create your organization</h2>
      <p class="text-sm text-muted">Set up your NestPG workspace in a couple of minutes.</p>
    </div>

    <form class="space-y-4" (ngSubmit)="submit()">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-[12px] font-medium text-muted mb-1.5">Full name</label>
          <input name="name" [(ngModel)]="name" placeholder="Priya Sharma" class="field" />
        </div>
        <div>
          <!-- integration point: backend RegisterDto has no organization field yet -->
          <label class="block text-[12px] font-medium text-muted mb-1.5">Organization</label>
          <input name="org" [(ngModel)]="org" placeholder="Sunrise Living" class="field" />
        </div>
      </div>
      <div>
        <label class="block text-[12px] font-medium text-muted mb-1.5">Phone number</label>
        <input name="phone" [(ngModel)]="phone" inputmode="numeric" placeholder="9876543210" class="field" />
      </div>
      <div>
        <label class="block text-[12px] font-medium text-muted mb-1.5">Work email</label>
        <input name="email" [(ngModel)]="email" type="email" placeholder="priya@company.com" class="field" />
      </div>
      <div>
        <label class="block text-[12px] font-medium text-muted mb-1.5">Password</label>
        <div class="relative">
          <input [type]="show() ? 'text' : 'password'" name="pwd" [(ngModel)]="password" placeholder="At least 8 characters" class="field pr-11" />
          <button type="button" (click)="show.set(!show())" class="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-content">
            <os-icon [name]="show() ? 'visibility_off' : 'visibility'" [size]="18" />
          </button>
        </div>
      </div>

      @if (error()) {
        <div class="flex items-center gap-2 text-[13px] text-danger bg-danger-subtle rounded-lg px-3 py-2">
          <os-icon name="error" [size]="16" /> {{ error() }}
        </div>
      }

      <button type="submit" [disabled]="loading()"
              class="w-full h-11 rounded-lg bg-accent text-white text-[15px] font-semibold hover:bg-accent-hover transition disabled:opacity-60 flex items-center justify-center gap-2">
        @if (loading()) { <span class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span> }
        Create organization
      </button>
    </form>

    <div class="mt-8 pt-6 border-t border-border text-center">
      <p class="text-[13px] text-muted">Already have an account?
        <a routerLink="/auth/login" class="text-accent font-semibold hover:underline">Sign in</a>
      </p>
    </div>
  `,
  styles: [`
    .field {
      width: 100%; height: 44px; padding: 0 14px; border-radius: 8px;
      border: 1px solid var(--border); background: var(--panel);
      font-size: 14px; color: var(--text-primary); outline: none; transition: all .15s;
    }
    .field:focus { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 15%, transparent); }
  `],
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected name = '';
  protected org = '';
  protected phone = '';
  protected email = '';
  protected password = '';
  protected readonly show = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  submit(): void {
    if (!this.phone.trim() || this.password.length < 8) {
      this.error.set('Phone and an 8+ character password are required.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    // Registration triggers an OTP (REGISTRATION). Complete sign-up on the verify screen.
    this.auth.register({ phone: this.phone, email: this.email || undefined, password: this.password }).subscribe({
      next: () => this.router.navigate(['/auth/reset-password'], { queryParams: { phone: this.phone, purpose: 'REGISTRATION' } }),
      error: (e) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(e, 'Registration failed.'));
      },
    });
  }
}
