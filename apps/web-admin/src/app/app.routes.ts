import { Routes } from '@angular/router';
import { AppShellComponent } from './layout/app-shell/app-shell.component';
import { capabilityGuard } from './core/auth/capability.guard';
import { reviewGuard } from './core/auth/review.guard';
import { authGuard } from './core/auth/auth.guard';
import { unsavedChangesGuard } from './core/auth/unsaved-changes.guard';

export const routes: Routes = [
  {
    path: 'auth',
    loadComponent: () => import('./features/auth/auth-shell.component').then((m) => m.AuthShellComponent),
    children: [
      { path: '', redirectTo: 'login', pathMatch: 'full' },
      { path: 'login', loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent) },
      // Staff accounts are password-only and provisioned by admins: the backend
      // has no registration, OTP or self-service reset for the Admin console.
      // Old links land on the login screen instead of a page that cannot work.
      { path: 'register', redirectTo: 'login', pathMatch: 'full' },
      { path: 'forgot-password', redirectTo: 'login', pathMatch: 'full' },
      { path: 'reset-password', redirectTo: 'login', pathMatch: 'full' },
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
      { path: 'dashboard/owner', loadComponent: () => import('./features/dashboard/owner-dashboard.component').then((m) => m.OwnerDashboardComponent), canActivate: [capabilityGuard], data: { capabilities: ['OPERATIONAL_READ'] } },
      { path: 'dashboard/manager', loadComponent: () => import('./features/dashboard/manager-dashboard.component').then((m) => m.ManagerDashboardComponent), canActivate: [capabilityGuard], data: { capabilities: ['OPERATIONAL_READ'] } },

      // Properties
      { path: 'properties', loadComponent: () => import('./features/properties/portfolio-hub.component').then((m) => m.PortfolioHubComponent) },
      { path: 'properties/new', loadComponent: () => import('./features/properties/create-property-wizard.component').then((m) => m.CreatePropertyWizardComponent) },
      { path: 'properties/:id/inventory/new', loadComponent: () => import('./features/properties/add-inventory-workspace.component').then((m) => m.AddInventoryWorkspaceComponent) },
      { path: 'properties/daily-rates', loadComponent: () => import('./features/properties/daily-rates.component').then((m) => m.DailyRatesComponent), canActivate: [capabilityGuard], data: { capabilities: ['PROPERTY_OPERATIONS'] } },
      { path: 'properties/review', canActivate: [reviewGuard], loadComponent: () => import('./features/properties/property-review.component').then((m) => m.PropertyReviewComponent) },
      { path: 'properties/workspace', loadComponent: () => import('./features/properties/property-workspace.component').then((m) => m.PropertyWorkspaceComponent) },
      { path: 'inventory', loadComponent: () => import('./features/inventory/inventory-workspace.component').then((m) => m.InventoryWorkspaceComponent), canDeactivate: [unsavedChangesGuard] },

      // Residents
      { path: 'residents', loadComponent: () => import('./features/residents/residents-command-center.component').then((m) => m.ResidentsCommandCenterComponent) },
      { path: 'residents/crm', loadComponent: () => import('./features/residents/resident-crm.component').then((m) => m.ResidentCrmComponent) },

      // Bookings
      { path: 'bookings', loadComponent: () => import('./features/bookings/bookings-list.component').then((m) => m.BookingsListComponent), data: { mode: 'all', eyebrow: 'Bookings', title: 'Bookings & Reservations', subtitle: 'All booking activity across your properties.' } },
      { path: 'bookings/reservations', loadComponent: () => import('./features/bookings/reservations.component').then((m) => m.ReservationsComponent) },
      { path: 'bookings/waitlist', loadComponent: () => import('./features/bookings/waitlist.component').then((m) => m.WaitlistComponent) },
      { path: 'bookings/corporate', loadComponent: () => import('./features/corporate/corporate.component').then((m) => m.CorporateComponent), canActivate: [capabilityGuard], data: { capabilities: ['BOOKING_OPERATIONS'] } },
      { path: 'bookings/check-in', loadComponent: () => import('./features/bookings/bookings-list.component').then((m) => m.BookingsListComponent), data: { mode: 'check-in', eyebrow: 'Bookings', title: 'Check-In', subtitle: 'Confirm arrivals and onboard residents.' } },
      { path: 'bookings/check-out', loadComponent: () => import('./features/bookings/bookings-list.component').then((m) => m.BookingsListComponent), data: { mode: 'check-out', eyebrow: 'Bookings', title: 'Check-Out', subtitle: 'Process departures and settlements.' } },

      // Finance
      { path: 'finance', loadComponent: () => import('./features/finance/finance-dashboard.component').then((m) => m.FinanceDashboardComponent) },
      { path: 'finance/payments', loadComponent: () => import('./features/finance/payments-feed.component').then((m) => m.PaymentsFeedComponent) },
      { path: 'finance/invoices', loadComponent: () => import('./features/finance/invoices.component').then((m) => m.InvoicesComponent) },
      { path: 'finance/collections', loadComponent: () => import('./features/finance/collections.component').then((m) => m.CollectionsComponent) },
      // ADM-D.1 — deposit dispute operations (read: OPERATIONAL_READ, as the backend routes)
      { path: 'finance/deposit-disputes', loadComponent: () => import('./features/finance/deposit-disputes/deposit-disputes-queue.component').then((m) => m.DepositDisputesQueueComponent), canActivate: [capabilityGuard], data: { capabilities: ['OPERATIONAL_READ'] } },
      { path: 'finance/deposit-disputes/:id', loadComponent: () => import('./features/finance/deposit-disputes/deposit-dispute-detail.component').then((m) => m.DepositDisputeDetailComponent), canActivate: [capabilityGuard], data: { capabilities: ['OPERATIONAL_READ'] } },
      { path: 'finance/deposits/:bookingId', loadComponent: () => import('./features/finance/deposit-disputes/booking-deposit-history.component').then((m) => m.BookingDepositHistoryComponent), canActivate: [capabilityGuard], data: { capabilities: ['OPERATIONAL_READ'] } },

      // Operations
      { path: 'operations', loadComponent: () => import('./features/operations/operations-center.component').then((m) => m.OperationsCenterComponent) },
      { path: 'operations/tickets', loadComponent: () => import('./features/operations/tickets-board.component').then((m) => m.TicketsBoardComponent) },
      { path: 'operations/kyc', loadComponent: () => import('./features/operations/kyc-queue.component').then((m) => m.KycQueueComponent), canActivate: [capabilityGuard], data: { capabilities: ['KYC_OPERATIONS'] } },
      { path: 'operations/reviews', loadComponent: () => import('./features/operations/reviews-moderation.component').then((m) => m.ReviewsModerationComponent), canActivate: [capabilityGuard], data: { capabilities: ['COMMUNITY_OPERATIONS'] } },
      { path: 'operations/visitors', loadComponent: () => import('./features/operations/visitors.component').then((m) => m.VisitorsComponent) },

      // Analytics
      { path: 'analytics/revenue', loadComponent: () => import('./features/analytics/revenue-analytics.component').then((m) => m.RevenueAnalyticsComponent), canActivate: [capabilityGuard], data: { capabilities: ['OPERATIONAL_READ'] } },
      { path: 'analytics/occupancy', loadComponent: () => import('./features/analytics/occupancy-analytics.component').then((m) => m.OccupancyAnalyticsComponent) },

      // Communication
      { path: 'communication', loadComponent: () => import('./features/communication/comms-hub.component').then((m) => m.CommsHubComponent) },
      { path: 'communication/notifications', loadComponent: () => import('./features/communication/notification-center.component').then((m) => m.NotificationCenterComponent) },

      // Administration
      { path: 'admin/users', loadComponent: () => import('./features/admin/users-admin.component').then((m) => m.UsersAdminComponent), canActivate: [capabilityGuard], data: { capabilities: ['USER_OPERATIONS'] } },
      { path: 'admin/owners', loadComponent: () => import('./features/admin/property-owners.component').then((m) => m.PropertyOwnersComponent), canActivate: [capabilityGuard], data: { capabilities: ['OWNER_ADMINISTRATION'] } },
      { path: 'admin/staff', loadComponent: () => import('./features/admin/admin-staff.component').then((m) => m.AdminStaffComponent), canActivate: [capabilityGuard], data: { capabilities: ['ROLE_ADMINISTRATION'] } },
      { path: 'admin/roles', loadComponent: () => import('./features/admin/roles-admin.component').then((m) => m.RolesAdminComponent), canActivate: [capabilityGuard], data: { capabilities: ['ROLE_ADMINISTRATION'] } },
      { path: 'admin/system', loadComponent: () => import('./features/admin/system-dashboard.component').then((m) => m.SystemDashboardComponent), canActivate: [capabilityGuard], data: { capabilities: ['SYSTEM_ADMINISTRATION'] } },
      { path: 'admin/settings', loadComponent: () => import('./features/admin/settings.component').then((m) => m.SettingsComponent), canActivate: [capabilityGuard], data: { capabilities: ['SYSTEM_ADMINISTRATION'] } },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
