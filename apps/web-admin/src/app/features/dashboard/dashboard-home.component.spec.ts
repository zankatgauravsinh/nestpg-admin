import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DashboardHomeComponent } from './dashboard-home.component';
import { SessionStore } from '../../core/auth/session.store';
import { CurrentUser } from '../../core/models/role.model';

const admin = (backendRole: string): CurrentUser => ({ id: 'u-1', name: 'A', email: 'a@nestpg.test', role: 'SUPER_ADMIN', backendRole, initials: 'A', organization: 'NestPG', capabilities: [] });

describe('DashboardHomeComponent — each admin lands where their access works', () => {
  let http: HttpTestingController;
  const render = (backendRole: string) => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(SessionStore).setUser(admin(backendRole));
    const f = TestBed.createComponent(DashboardHomeComponent);
    f.detectChanges();
    const urls = http.match(() => true).map((r) => r.request.url);
    return { f, urls };
  };

  it('a Finance Admin gets the Finance overview and never requests /admin/ops/metrics (403 for them)', () => {
    const { f, urls } = render('FINANCE_ADMIN');
    expect(f.nativeElement.querySelector('os-finance-dashboard')).not.toBeNull();
    expect(f.nativeElement.querySelector('os-super-admin-dashboard')).toBeNull();
    expect(urls.some((u) => u.includes('/admin/ops/metrics'))).toBe(false);
  });

  it.each(['SUPER_ADMIN', 'OPS_ADMIN'])('%s keeps the platform dashboard with operations metrics', (role) => {
    const { f, urls } = render(role);
    expect(f.nativeElement.querySelector('os-super-admin-dashboard')).not.toBeNull();
    expect(urls.some((u) => u.includes('/admin/ops/metrics'))).toBe(true);
  });
});
