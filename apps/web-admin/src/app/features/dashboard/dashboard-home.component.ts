import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SessionStore } from '../../core/auth/session.store';
import { SuperAdminDashboardComponent } from './super-admin-dashboard.component';
import { OwnerDashboardComponent } from './owner-dashboard.component';
import { ManagerDashboardComponent } from './manager-dashboard.component';

/** Renders the role-appropriate dashboard at /dashboard. */
@Component({
  selector: 'os-dashboard-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SuperAdminDashboardComponent, OwnerDashboardComponent, ManagerDashboardComponent],
  template: `
    @switch (session.role()) {
      @case ('SUPER_ADMIN') { <os-super-admin-dashboard /> }
      @case ('OWNER') { <os-owner-dashboard /> }
      @default { <os-manager-dashboard /> }
    }
  `,
})
export class DashboardHomeComponent {
  protected readonly session = inject(SessionStore);
}
