import { Routes } from '@angular/router';
import { AppShellComponent } from './layout/app-shell/app-shell.component';
import { roleGuard } from './core/auth/role.guard';
import { authGuard } from './core/auth/auth.guard';
import { unsavedChangesGuard } from './core/auth/unsaved-changes.guard';

export const routes: Routes = [
  {
    path: 'auth',
    loadComponent: () => import('./features/auth/auth-shell.component').then((m) => m.AuthShellComponent),
    children: [
      { path: '', redirectTo: 'login', pathMatch: 'full' },
      { path: 'login', loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent) },
      { path: 'register', loadComponent: () => import('./features/auth/register.component').then((m) => m.RegisterComponent) },
      { path: 'forgot-password', loadComponent: () => import('./features/auth/forgot-password.component').then((m) => m.ForgotPasswordComponent) },
      { path: 'reset-password', loadComponent: () => import('./features/auth/reset-password.component').then((m) => m.ResetPasswordComponent) },
    ],
  },
  {
    path: '',
    component: AppShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'search', loadComponent: () => import('./features/search/global-search.component').then((m) => m.GlobalSearchComponent) },

      // Workspace
      { path: 'dashboard', loadComponent: () => import('./features/dashboard/dashboard-home.component').then((m) => m.DashboardHomeComponent) },
      { path: 'dashboard/owner', loadComponent: () => import('./features/dashboard/owner-dashboard.component').then((m) => m.OwnerDashboardComponent), canActivate: [roleGuard], data: { roles: ['SUPER_ADMIN', 'OWNER'] } },
      { path: 'dashboard/manager', loadComponent: () => import('./features/dashboard/manager-dashboard.component').then((m) => m.ManagerDashboardComponent), canActivate: [roleGuard], data: { roles: ['SUPER_ADMIN', 'MANAGER'] } },

      // Properties
      { path: 'properties', loadComponent: () => import('./features/properties/portfolio-hub.component').then((m) => m.PortfolioHubComponent) },
      { path: 'properties/new', loadComponent: () => import('./features/properties/create-property-wizard.component').then((m) => m.CreatePropertyWizardComponent) },
      { path: 'properties/:id/inventory/new', loadComponent: () => import('./features/properties/add-inventory-workspace.component').then((m) => m.AddInventoryWorkspaceComponent) },
      { path: 'properties/workspace', loadComponent: () => import('./features/properties/property-workspace.component').then((m) => m.PropertyWorkspaceComponent) },
      { path: 'inventory', loadComponent: () => import('./features/inventory/inventory-workspace.component').then((m) => m.InventoryWorkspaceComponent), canDeactivate: [unsavedChangesGuard] },

      // Residents
      { path: 'residents', loadComponent: () => import('./features/residents/residents-command-center.component').then((m) => m.ResidentsCommandCenterComponent) },
      { path: 'residents/crm', loadComponent: () => import('./features/residents/resident-crm.component').then((m) => m.ResidentCrmComponent) },

      // Bookings
      { path: 'bookings', loadComponent: () => import('./features/bookings/bookings-list.component').then((m) => m.BookingsListComponent), data: { mode: 'all', eyebrow: 'Bookings', title: 'Bookings & Reservations', subtitle: 'All booking activity across your properties.' } },
      { path: 'bookings/reservations', loadComponent: () => import('./features/bookings/reservations.component').then((m) => m.ReservationsComponent) },
      { path: 'bookings/waitlist', loadComponent: () => import('./features/bookings/waitlist.component').then((m) => m.WaitlistComponent) },
      { path: 'bookings/corporate', loadComponent: () => import('./features/corporate/corporate.component').then((m) => m.CorporateComponent), canActivate: [roleGuard], data: { roles: ['SUPER_ADMIN', 'OWNER'] } },
      { path: 'bookings/check-in', loadComponent: () => import('./features/bookings/bookings-list.component').then((m) => m.BookingsListComponent), data: { mode: 'check-in', eyebrow: 'Bookings', title: 'Check-In', subtitle: 'Confirm arrivals and onboard residents.' } },
      { path: 'bookings/check-out', loadComponent: () => import('./features/bookings/bookings-list.component').then((m) => m.BookingsListComponent), data: { mode: 'check-out', eyebrow: 'Bookings', title: 'Check-Out', subtitle: 'Process departures and settlements.' } },

      // Finance
      { path: 'finance', loadComponent: () => import('./features/finance/finance-dashboard.component').then((m) => m.FinanceDashboardComponent) },
      { path: 'finance/payments', loadComponent: () => import('./features/finance/payments-feed.component').then((m) => m.PaymentsFeedComponent) },
      { path: 'finance/invoices', loadComponent: () => import('./features/finance/invoices.component').then((m) => m.InvoicesComponent) },
      { path: 'finance/collections', loadComponent: () => import('./features/finance/collections.component').then((m) => m.CollectionsComponent) },

      // Operations
      { path: 'operations', loadComponent: () => import('./features/operations/operations-center.component').then((m) => m.OperationsCenterComponent) },
      { path: 'operations/tickets', loadComponent: () => import('./features/operations/tickets-board.component').then((m) => m.TicketsBoardComponent) },
      { path: 'operations/kyc', loadComponent: () => import('./features/operations/kyc-queue.component').then((m) => m.KycQueueComponent) },
      { path: 'operations/reviews', loadComponent: () => import('./features/operations/reviews-moderation.component').then((m) => m.ReviewsModerationComponent) },
      { path: 'operations/visitors', loadComponent: () => import('./features/operations/visitors.component').then((m) => m.VisitorsComponent) },

      // Analytics
      { path: 'analytics/revenue', loadComponent: () => import('./features/analytics/revenue-analytics.component').then((m) => m.RevenueAnalyticsComponent), canActivate: [roleGuard], data: { roles: ['SUPER_ADMIN', 'OWNER'] } },
      { path: 'analytics/occupancy', loadComponent: () => import('./features/analytics/occupancy-analytics.component').then((m) => m.OccupancyAnalyticsComponent) },

      // Communication
      { path: 'communication', loadComponent: () => import('./features/communication/comms-hub.component').then((m) => m.CommsHubComponent) },
      { path: 'communication/notifications', loadComponent: () => import('./features/communication/notification-center.component').then((m) => m.NotificationCenterComponent) },

      // Administration
      { path: 'admin/users', loadComponent: () => import('./features/admin/users-admin.component').then((m) => m.UsersAdminComponent), canActivate: [roleGuard], data: { roles: ['SUPER_ADMIN', 'OWNER'] } },
      { path: 'admin/roles', loadComponent: () => import('./features/admin/roles-admin.component').then((m) => m.RolesAdminComponent), canActivate: [roleGuard], data: { roles: ['SUPER_ADMIN'] } },
      { path: 'admin/system', loadComponent: () => import('./features/admin/system-dashboard.component').then((m) => m.SystemDashboardComponent), canActivate: [roleGuard], data: { roles: ['SUPER_ADMIN'] } },
      { path: 'admin/settings', loadComponent: () => import('./features/admin/settings.component').then((m) => m.SettingsComponent), canActivate: [roleGuard], data: { roles: ['SUPER_ADMIN', 'OWNER'] } },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
