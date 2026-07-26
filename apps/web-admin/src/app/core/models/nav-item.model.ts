import { Role } from './role.model';

export interface NavItem {
  /** stable id */
  id: string;
  label: string;
  /** Material Symbols icon name */
  icon?: string;
  route?: string;
  badge?: string | number;
  /** roles allowed to see this item; empty/undefined = all roles */
  roles?: Role[];
  /** section header (renders as an uppercase group label) */
  isSection?: boolean;
  children?: NavItem[];
}
