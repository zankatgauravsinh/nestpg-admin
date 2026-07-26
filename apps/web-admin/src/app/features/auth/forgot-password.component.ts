import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { IconComponent } from '../../shared/components/icon.component';

@Component({
  selector: 'os-forgot-password',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, IconComponent],
  template: `
    <a routerLink="/auth/login" class="inline-flex items-center gap-1 text-[13px] text-muted hover:text-content mb-6">
      <os-icon name="arrow_back" [size]="16" /> Back to sign in
    </a>
    <div class="mb-8">
      <h2 class="text-2xl font-semibold text-content mb-1.5">Reset your password</h2>
      <p class="text-sm text-muted">Enter your phone number and we'll send a one-time code to verify it's you.</p>
    </div>

    <form class="space-y-5" (ngSubmit)="submit()">
      <div>
        <label class="block text-[12px] font-medium text-muted mb-1.5">Phone number</label>
        <input name="phone" [(ngModel)]="phone" inputmode="numeric" placeholder="9876543210"
               class="w-full h-11 px-3.5 rounded-lg border border-border bg-panel text-sm text-content outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15" />
      </div>
      @if (error()) {
        <div class="flex items-center gap-2 text-[13px] text-danger bg-danger-subtle rounded-lg px-3 py-2">
          <os-icon name="error" [size]="16" /> {{ error() }}
        </div>
      }
      <button type="submit" [disabled]="loading()"
              class="w-full h-11 rounded-lg bg-accent text-white text-[15px] font-semibold hover:bg-accent-hover transition disabled:opacity-60 flex items-center justify-center gap-2">
        @if (loading()) { <span class="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin"></span> }
        Send verification code
      </button>
    </form>
  `,
})
export class ForgotPasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected phone = '';
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  submit(): void {
    if (!this.phone.trim()) {
      this.error.set('Enter your phone number.');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.auth.sendOtp(this.phone, 'PASSWORD_RESET').subscribe({
      next: () => this.router.navigate(['/auth/reset-password'], { queryParams: { phone: this.phone, purpose: 'PASSWORD_RESET' } }),
      error: (e) => {
        this.loading.set(false);
        this.error.set(apiErrorMessage(e, 'Could not send code. Try again.'));
      },
    });
  }
}
