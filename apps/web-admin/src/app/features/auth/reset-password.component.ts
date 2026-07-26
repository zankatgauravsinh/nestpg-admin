import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, OtpPurpose } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { IconComponent } from '../../shared/components/icon.component';

@Component({
  selector: 'os-reset-password',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, IconComponent],
  template: `
    <a routerLink="/auth/login" class="inline-flex items-center gap-1 text-[13px] text-muted hover:text-content mb-6">
      <os-icon name="arrow_back" [size]="16" /> Back to sign in
    </a>
    <div class="mb-8">
      <h2 class="text-2xl font-semibold text-content mb-1.5">Enter verification code</h2>
      <p class="text-sm text-muted">We sent a 6-digit code to <span class="font-medium text-content">{{ phone() || 'your phone' }}</span>.</p>
    </div>

    <form class="space-y-5" (ngSubmit)="submit()">
      <div>
        <label class="block text-[12px] font-medium text-muted mb-1.5">Verification code</label>
        <input name="otp" [(ngModel)]="otp" inputmode="numeric" maxlength="6" placeholder="••••••"
               class="w-full h-12 px-3.5 rounded-lg border border-border bg-panel text-center text-lg tracking-[0.5em] text-content outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15" />
      </div>
      @if (error()) {
        <div class="flex items-center gap-2 text-[13px] text-danger bg-danger-subtle rounded-lg px-3 py-2">
          <os-icon name="error" [size]="16" /> {{ error() }}
        </div>
      }
      <button type="submit" [disabled]="loading()"
              class="w-full h-11 rounded-lg bg-accent text-white text-[15px] font-semibold hover:bg-accent-hover transition disabled:opacity-60 flex items-center justify-center gap-2">
        @if (loading()) { <span class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span> }
        Verify &amp; continue
      </button>
      <button type="button" (click)="resend()" class="w-full text-[13px] text-muted hover:text-content transition">
        Didn't get a code? Resend
      </button>
    </form>
  `,
})
export class ResetPasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly phone = signal<string>(this.route.snapshot.queryParamMap.get('phone') ?? '');
  private readonly purpose = (this.route.snapshot.queryParamMap.get('purpose') as OtpPurpose) || 'LOGIN';
  protected otp = '';
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  submit(): void {
    if (this.otp.length !== 6) {
      this.error.set('Enter the 6-digit code we sent you.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.auth.verifyOtp(this.phone(), this.otp, this.purpose).subscribe({
      next: () => {
        // Tokens applied; load the full profile then enter the app.
        this.auth.me().subscribe({ next: () => {}, error: () => {} });
        const r = this.route.snapshot.queryParamMap.get('returnUrl');
        this.router.navigateByUrl(r && !r.startsWith('/auth') ? r : '/dashboard');
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(e, 'Invalid or expired code.'));
      },
    });
  }

  resend(): void {
    if (this.phone()) this.auth.sendOtp(this.phone(), this.purpose).subscribe({ next: () => {}, error: () => {} });
  }
}
