import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SessionStore } from '../../core/auth/session.store';
import { SuperAdminDashboardComponent } from './super-admin-dashboard.component';
import { OwnerDashboardComponent } from './owner-dashboard.component';
import { ManagerDashboardComponent } from './manager-dashboard.component';
import { FinanceDashboardComponent } from '../finance/finance-dashboard.component';

/** Renders the role-appropriate dashboard at /dashboard. */
@Component({
  selector: 'os-dashboard-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SuperAdminDashboardComponent, OwnerDashboardComponent, ManagerDashboardComponent, FinanceDashboardComponent],
  template: `
    <!-- A Finance Admin shares the SUPER_ADMIN persona but not its operations access
         (GET /admin/ops/metrics is SUPER/OPS only): land them on the Finance overview. -->
    @switch (session.backendRole() === 'FINANCE_ADMIN' ? 'FINANCE' : session.role()) {
      @case ('FINANCE') { <os-finance-dashboard /> }
      @case ('SUPER_ADMIN') { <os-super-admin-dashboard /> }
      @case ('OWNER') { <os-owner-dashboard /> }
      @default { <os-manager-dashboard /> }
    }
  `,
})
export class DashboardHomeComponent {
  protected readonly session = inject(SessionStore);
}
