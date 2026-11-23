import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { IconComponent } from '../../shared/components/icon.component';

@Component({
  selector: 'os-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IconComponent],
  template: `
    <div class="mb-8">
      <h2 class="text-2xl font-semibold text-content mb-1.5">Welcome back</h2>
      <p class="text-sm text-muted">Sign in to access your property operations workspace.</p>
    </div>

    <!-- SSO (visual) -->
    <div class="grid grid-cols-2 gap-3 mb-6">
      @for (p of sso; track p) {
        <button type="button" class="flex items-center justify-center gap-2 h-11 border border-border rounded-lg text-sm font-medium text-content hover:bg-panel transition">
          <os-icon [name]="p === 'Google' ? 'g_translate' : 'window'" [size]="18" /> {{ p }}
        </button>
      }
    </div>
    <div class="relative mb-6">
      <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-border"></div></div>
      <div class="relative flex justify-center"><span class="bg-canvas px-3 text-[11px] uppercase tracking-wider text-faint">Or continue with phone</span></div>
    </div>

    <form class="space-y-5" (ngSubmit)="submit()">
      <div>
        <label class="block text-[12px] font-medium text-muted mb-1.5" for="phone">Phone number</label>
        <input id="phone" name="phone" [(ngModel)]="phone" inputmode="numeric" placeholder="9876543210"
               class="w-full h-11 px-3.5 rounded-lg border border-border bg-panel text-sm text-content outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15" />
      </div>

      <div>
        <div class="flex justify-between items-center mb-1.5">
          <label class="text-[12px] font-medium text-muted" for="pwd">Password</label>
          <span class="text-[12px] text-faint" data-testid="forgot-password-help">Forgot it? Ask your NestPG administrator.</span>
        </div>
        <div class="relative">
          <input [type]="show() ? 'text' : 'password'" id="pwd" name="pwd" [(ngModel)]="password" placeholder="••••••••"
                 class="w-full h-11 px-3.5 pr-11 rounded-lg border border-border bg-panel text-sm text-content outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15" />
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
        Sign in
      </button>
    </form>

    <div class="mt-10 pt-6 border-t border-border text-center">
      <p class="text-[13px] text-muted" data-testid="staff-accounts-help">
        Staff accounts are created by a NestPG administrator.
      </p>
    </div>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly sso = ['Google', 'Microsoft'];
  protected phone = '';
  protected password = '';
  protected readonly show = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  submit(): void {
    if (!this.phone.trim()) {
      this.error.set('Enter your phone number.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);

    this.auth.login({ phone: this.phone, password: this.password }).subscribe({
      next: () => this.router.navigateByUrl(this.returnUrl),
      error: (e) => this.fail(e),
    });
  }

  /** Where to land after login (set by the auth guard). */
  private get returnUrl(): string {
    const r = this.route.snapshot.queryParamMap.get('returnUrl');
    return r && !r.startsWith('/auth') ? r : '/dashboard';
  }

  private fail(e: unknown): void {
    this.loading.set(false);
    this.error.set(apiErrorMessage(e, 'Unable to sign in. Check your credentials.'));
  }
}
