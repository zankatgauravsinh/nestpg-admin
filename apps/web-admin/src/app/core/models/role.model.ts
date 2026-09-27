import { Capability } from './capability.model';
/** Platform roles. A single role-based application. */
export type Role = 'SUPER_ADMIN' | 'OWNER' | 'MANAGER';

export const ROLES: Role[] = ['SUPER_ADMIN', 'OWNER', 'MANAGER'];

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  OWNER: 'Owner',
  MANAGER: 'Manager',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  SUPER_ADMIN: 'Platform-wide control across every organization.',
  OWNER: 'Full visibility and control of owned properties.',
  MANAGER: 'Day-to-day operations for assigned properties.',
};

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  /** Navigation persona (three buckets). Several backend roles map onto one. */
  role: Role;
  /**
   * The role the backend actually holds for this user (SUPER_ADMIN, OPS_ADMIN,
   * FINANCE_ADMIN, …). Kept alongside the persona because the personas are
   * lossy: a FINANCE_ADMIN maps onto the SUPER_ADMIN persona, and would
   * otherwise be shown review controls the server refuses (A2 / BK102).
   */
  backendRole: string;
  /**
   * What this session may do, as served by `GET /users/me` (A3). Empty for a
   * non-admin role — every capability check then fails closed.
   */
  capabilities: Capability[];
  initials: string;
  organization: string;
}
