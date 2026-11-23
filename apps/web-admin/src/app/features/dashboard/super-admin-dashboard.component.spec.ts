import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { SuperAdminDashboardComponent } from './super-admin-dashboard.component';
import { SessionStore } from '../../core/auth/session.store';
import { CurrentUser } from '../../core/models/role.model';

const admin = (backendRole: string): CurrentUser => ({ id: 'u-1', name: 'A', email: 'a@nestpg.test', role: 'SUPER_ADMIN', backendRole, initials: 'A', organization: 'NestPG', capabilities: [] });

/** Every figure on the platform dashboard is live or absent — never a placeholder. */
describe('SuperAdminDashboardComponent — no placeholder figures', () => {
  let http: HttpTestingController;
  const render = (metrics: unknown, status = 200) => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(SessionStore).setUser(admin('OPS_ADMIN'));
    const f = TestBed.createComponent(SuperAdminDashboardComponent);
    f.detectChanges();
    for (const r of http.match(() => true)) {
      if (r.request.url.includes('/admin/ops/metrics')) {
        if (status === 200) r.flush({ success: true, data: metrics }); else r.flush({ success: false }, { status, statusText: 'x' });
      } else r.flush({ success: true, data: [] });
    }
    f.detectChanges();
    return (f.nativeElement as HTMLElement);
  };
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ');

  it('shows the real delivery figures, conversion rates and a status derived from them', () => {
    const el = render({ reservationSuccessRate: 0.625, bookingSuccessRate: 0.9, outboxDeliveryRate: 0.98, failedEvents: 2, pendingEvents: 3, relayLagMinutes: 1 });
    const health = text(el.querySelector('[data-testid="ops-health"]'));
    expect(health).toBe('Delivered98%Failed events2Pending events3Oldest pending1 min');
    const conv = text(el.querySelector('[data-testid="ops-conversion"]'));
    expect(conv.replace(/ /g, '')).toContain('Holdsthatbecamebookings62.5%'); expect(conv.replace(/ /g, '')).toContain('Bookingsconfirmedorlater90%');
    expect(text(el.querySelector('[data-testid="ops-status"]'))).toContain('2 failed events');
  });

  it('never shows the old invented numbers or trend percentages', () => {
    const t = text(render({ reservationSuccessRate: 1, bookingSuccessRate: 1, outboxDeliveryRate: 1, failedEvents: 0, pendingEvents: 0, relayLagMinutes: 0 }));
    for (const fake of ['42ms', 'Active organizations', 'KYC processed (24h)', 'Bookings (24h)', 'All systems operational', '+6%', '+4.2%', '+9.1%', '+2.3%']) expect(t).not.toContain(fake);
    expect(t).toContain('Event delivery healthy');
  });

  it('when the metrics cannot be read it says so instead of inventing defaults', () => {
    const el = render(null, 500);
    expect(text(el.querySelector('[data-testid="ops-unavailable"]'))).toContain('Operational metrics are unavailable');
    expect(text(el.querySelector('[data-testid="ops-status"]'))).toContain('Metrics unavailable');
    expect(text(el)).not.toContain('Healthy');
  });
});
