/**
 * A3 — the Admin capability vocabulary.
 *
 * These names are the backend's (`AdminCapability` in `@nestpg/users`), and the
 * VALUES a session holds are served by `GET /users/me` — the client never
 * derives them from a role table of its own. That is the whole point of A3: one
 * matrix, in one place, consulted by both sides. If the server says a session
 * has no capabilities (a non-admin, or an unknown role), every check here fails
 * closed.
 */
export type Capability =
  | 'PROPERTY_OPERATIONS'
  | 'PROPERTY_REVIEW_VIEW'
  | 'PROPERTY_REVIEW_DECISION'
  | 'USER_OPERATIONS'
  | 'OWNER_ADMINISTRATION'
  | 'PROPERTY_ADMINISTRATION_VIEW'
  | 'KYC_OPERATIONS'
  | 'BOOKING_OPERATIONS'
  | 'FINANCIAL_OPERATIONS'
  | 'ROLE_ADMINISTRATION'
  | 'SYSTEM_ADMINISTRATION'
  | 'OPERATIONAL_READ'
  | 'COMMUNITY_OPERATIONS';

/** The three Admin console roles, for display and for the staff role picker. */
export const ADMIN_ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  OPS_ADMIN: 'Operations Admin',
  FINANCE_ADMIN: 'Finance Admin',
};
