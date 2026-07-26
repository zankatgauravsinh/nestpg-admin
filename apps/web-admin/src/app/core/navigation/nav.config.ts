import { NavItem } from '../models/nav-item.model';

/**
 * Primary navigation for the Operations OS sidebar.
 * `isSection` rows render as group labels. `roles` gates visibility.
 */
export const NAV_CONFIG: NavItem[] = [
  { id: 'sec-workspace', label: 'Workspace', isSection: true },
  { id: 'dashboard', label: 'Dashboard', icon: 'space_dashboard', route: '/dashboard' },
  { id: 'owner-dashboard', label: 'Owner Dashboard', icon: 'insights', route: '/dashboard/owner', roles: ['SUPER_ADMIN', 'OWNER'] },
  { id: 'manager-dashboard', label: 'Manager Dashboard', icon: 'support_agent', route: '/dashboard/manager', roles: ['SUPER_ADMIN', 'MANAGER'] },

  { id: 'sec-properties', label: 'Properties', isSection: true },
  { id: 'portfolio', label: 'Property Portfolio', icon: 'domain', route: '/properties' },
  { id: 'property-workspace', label: 'Property Workspace', icon: 'apartment', route: '/properties/workspace' },
  { id: 'inventory', label: 'Inventory', icon: 'bed', route: '/inventory' },

  { id: 'sec-residents', label: 'Residents', isSection: true },
  { id: 'residents', label: 'Residents', icon: 'groups', route: '/residents' },
  { id: 'resident-crm', label: 'Resident CRM', icon: 'badge', route: '/residents/crm' },

  { id: 'sec-bookings', label: 'Bookings', isSection: true },
  { id: 'bookings', label: 'Bookings', icon: 'event_available', route: '/bookings' },
  { id: 'reservations', label: 'Reservations', icon: 'bookmark_added', route: '/bookings/reservations' },
  { id: 'waitlist', label: 'Waitlist', icon: 'hourglass_top', route: '/bookings/waitlist' },
  { id: 'corporate', label: 'Corporate', icon: 'corporate_fare', route: '/bookings/corporate', roles: ['SUPER_ADMIN', 'OWNER'] },
  { id: 'check-in', label: 'Check-In', icon: 'login', route: '/bookings/check-in' },
  { id: 'check-out', label: 'Check-Out', icon: 'logout', route: '/bookings/check-out' },

  { id: 'sec-finance', label: 'Finance', isSection: true },
  { id: 'finance-overview', label: 'Finance Overview', icon: 'monitoring', route: '/finance' },
  { id: 'payments', label: 'Payments', icon: 'payments', route: '/finance/payments' },
  { id: 'invoices', label: 'Invoices', icon: 'receipt_long', route: '/finance/invoices' },
  { id: 'collections', label: 'Collections', icon: 'request_quote', route: '/finance/collections', badge: 8 },

  { id: 'sec-operations', label: 'Operations', isSection: true },
  { id: 'ops-center', label: 'Operations Center', icon: 'dashboard_customize', route: '/operations' },
  { id: 'tickets', label: 'Tickets', icon: 'confirmation_number', route: '/operations/tickets', badge: 12 },
  { id: 'kyc', label: 'KYC', icon: 'verified_user', route: '/operations/kyc', badge: 5 },
  { id: 'reviews', label: 'Reviews', icon: 'reviews', route: '/operations/reviews' },
  { id: 'visitors', label: 'Visitors', icon: 'badge', route: '/operations/visitors' },

  { id: 'sec-analytics', label: 'Analytics', isSection: true },
  { id: 'revenue', label: 'Revenue', icon: 'monitoring', route: '/analytics/revenue', roles: ['SUPER_ADMIN', 'OWNER'] },
  { id: 'occupancy', label: 'Occupancy', icon: 'pie_chart', route: '/analytics/occupancy' },

  { id: 'sec-communication', label: 'Communication', isSection: true },
  { id: 'comms', label: 'Communication Hub', icon: 'forum', route: '/communication' },
  { id: 'notification-center', label: 'Notification Center', icon: 'notifications', route: '/communication/notifications' },
  { id: 'notification-center', label: 'Notification Center', icon: 'notifications_active', route: '/communication/notifications' },

  { id: 'sec-admin', label: 'Administration', isSection: true, roles: ['SUPER_ADMIN', 'OWNER'] },
  { id: 'users', label: 'Users', icon: 'manage_accounts', route: '/admin/users', roles: ['SUPER_ADMIN', 'OWNER'] },
  { id: 'roles', label: 'Roles', icon: 'admin_panel_settings', route: '/admin/roles', roles: ['SUPER_ADMIN'] },
  { id: 'settings', label: 'Settings', icon: 'settings', route: '/admin/settings', roles: ['SUPER_ADMIN', 'OWNER'] },
];
