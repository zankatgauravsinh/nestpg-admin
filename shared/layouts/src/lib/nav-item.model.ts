import { UserRole } from '@nestpg/models';

export interface NavItem {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Angular Material icon ligature name */
  icon: string;
  /** Router link path */
  route?: string;
  /** Child nav items for grouped sections */
  children?: NavItem[];
  /** Roles allowed to see this item — empty = all authenticated roles */
  roles?: UserRole[];
  /** Badge count (e.g., pending KYC count) */
  badge?: number;
  /** Whether this is a section separator / header (not clickable) */
  isSectionLabel?: boolean;
}
