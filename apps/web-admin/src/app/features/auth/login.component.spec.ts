import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { LoginComponent } from './login.component';
import { routes } from '../../app.routes';

/**
 * Staff accounts are password-only and created by admins; the backend serves no
 * /auth/register, /auth/send-otp or self-service reset. The login screen must not
 * offer them, and old links must land on login rather than a page that 404s.
 */
describe('Admin login — no dead self-service paths', () => {
  it('offers password sign-in only, and says who creates accounts and resets passwords', () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    const f = TestBed.createComponent(LoginComponent);
    f.detectChanges();
    const t = (f.nativeElement as HTMLElement).textContent ?? '';
    expect(t).not.toMatch(/OTP/);
    expect(t).not.toMatch(/Create organization/);
    expect((f.nativeElement as HTMLElement).querySelector('a[href*="/auth/"]')).toBeNull();
    expect(t).toContain('Ask your NestPG administrator');
    expect(t).toContain('Staff accounts are created by a NestPG administrator');
  });

  it.each(['/auth/register', '/auth/forgot-password', '/auth/reset-password', '/auth'])('%s lands on /auth/login', async (url) => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)] });
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    expect(router.url).toBe('/auth/login');
  });
});
