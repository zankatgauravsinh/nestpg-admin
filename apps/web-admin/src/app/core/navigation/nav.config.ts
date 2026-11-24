import { NavItem } from '../models/nav-item.model';

/**
 * Primary navigation for the Operations OS sidebar.
 * `isSection` rows render as group labels. `capabilities` gates visibility (A3):
 * an item appears only when the session holds every capability listed, which
 * is the same matrix the backend authorizes with.
 */
export const NAV_CONFIG: NavItem[] = [
  { id: 'sec-workspace', label: 'Workspace', isSection: true },
  { id: 'dashboard', label: 'Dashboard', icon: 'space_dashboard', route: '/dashboard' },
  { id: 'owner-dashboard', label: 'Owner Dashboard', icon: 'insights', route: '/dashboard/owner', capabilities: ['OPERATIONAL_READ'] },
  { id: 'manager-dashboard', label: 'Manager Dashboard', icon: 'support_agent', route: '/dashboard/manager', capabilities: ['OPERATIONAL_READ'] },

  { id: 'sec-properties', label: 'Properties', isSection: true },
  { id: 'portfolio', label: 'Property Portfolio', icon: 'domain', route: '/properties' },
  { id: 'property-review', label: 'Property Review', icon: 'fact_check', route: '/properties/review', capabilities: ['PROPERTY_REVIEW_VIEW'] },
  { id: 'daily-rates', label: 'Missing daily rates', icon: 'price_change', route: '/properties/daily-rates', capabilities: ['PROPERTY_OPERATIONS'] },
  { id: 'property-workspace', label: 'Property Workspace', icon: 'apartment', route: '/properties/workspace' },
  { id: 'inventory', label: 'Inventory', icon: 'bed', route: '/inventory' },

  { id: 'sec-residents', label: 'Residents', isSection: true },
  { id: 'residents', label: 'Residents', icon: 'groups', route: '/residents' },
  { id: 'resident-crm', label: 'Resident CRM', icon: 'badge', route: '/residents/crm' },

  { id: 'sec-bookings', label: 'Bookings', isSection: true },
  { id: 'bookings', label: 'Bookings', icon: 'event_available', route: '/bookings' },
  { id: 'reservations', label: 'Reservations', icon: 'bookmark_added', route: '/bookings/reservations' },
  { id: 'waitlist', label: 'Waitlist', icon: 'hourglass_top', route: '/bookings/waitlist' },
  { id: 'corporate', label: 'Corporate', icon: 'corporate_fare', route: '/bookings/corporate', capabilities: ['BOOKING_OPERATIONS'] },
  { id: 'check-in', label: 'Check-In', icon: 'login', route: '/bookings/check-in' },
  { id: 'check-out', label: 'Check-Out', icon: 'logout', route: '/bookings/check-out' },

  { id: 'sec-finance', label: 'Finance', isSection: true },
  { id: 'finance-overview', label: 'Finance Overview', icon: 'monitoring', route: '/finance' },
  { id: 'payments', label: 'Payments', icon: 'payments', route: '/finance/payments' },
  { id: 'invoices', label: 'Invoices', icon: 'receipt_long', route: '/finance/invoices' },
  { id: 'rent-invoices', label: 'Monthly rent', icon: 'event_repeat', route: '/finance/rent-invoices', capabilities: ['FINANCIAL_OPERATIONS'] },
  { id: 'collections', label: 'Collections', icon: 'request_quote', route: '/finance/collections', badge: 8 },
  { id: 'deposit-disputes', label: 'Deposit disputes', icon: 'gavel', route: '/finance/deposit-disputes', capabilities: ['OPERATIONAL_READ'] },

  { id: 'sec-operations', label: 'Operations', isSection: true },
  { id: 'ops-center', label: 'Operations Center', icon: 'dashboard_customize', route: '/operations' },
  { id: 'tickets', label: 'Tickets', icon: 'confirmation_number', route: '/operations/tickets', badge: 12 },
  { id: 'kyc', label: 'KYC', icon: 'verified_user', route: '/operations/kyc', badge: 5, capabilities: ['KYC_OPERATIONS'] },
  { id: 'reviews', label: 'Reviews', icon: 'reviews', route: '/operations/reviews', capabilities: ['COMMUNITY_OPERATIONS'] },
  { id: 'visitors', label: 'Visitors', icon: 'badge', route: '/operations/visitors', capabilities: ['COMMUNITY_OPERATIONS'] },

  { id: 'sec-analytics', label: 'Analytics', isSection: true },
  { id: 'revenue', label: 'Revenue', icon: 'monitoring', route: '/analytics/revenue', capabilities: ['OPERATIONAL_READ'] },
  { id: 'occupancy', label: 'Occupancy', icon: 'pie_chart', route: '/analytics/occupancy' },

  { id: 'sec-communication', label: 'Communication', isSection: true },
  { id: 'comms', label: 'Communication Hub', icon: 'forum', route: '/communication' },
  { id: 'notification-center', label: 'Notification Center', icon: 'notifications', route: '/communication/notifications' },
  

  { id: 'sec-admin', label: 'Administration', isSection: true, capabilities: ['USER_OPERATIONS'] },
  { id: 'users', label: 'Users', icon: 'manage_accounts', route: '/admin/users', capabilities: ['USER_OPERATIONS'] },
  { id: 'owners', label: 'Property Owners', icon: 'real_estate_agent', route: '/admin/owners', capabilities: ['OWNER_ADMINISTRATION'] },
  { id: 'staff', label: 'Staff / Administrators', icon: 'admin_panel_settings', route: '/admin/staff', capabilities: ['ROLE_ADMINISTRATION'] },
  { id: 'roles', label: 'Roles', icon: 'shield_person', route: '/admin/roles', capabilities: ['ROLE_ADMINISTRATION'] },
  { id: 'settings', label: 'Settings', icon: 'settings', route: '/admin/settings', capabilities: ['SYSTEM_ADMINISTRATION'] },
];
