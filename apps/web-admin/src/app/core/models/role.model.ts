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
  role: Role;
  initials: string;
  organization: string;
}
