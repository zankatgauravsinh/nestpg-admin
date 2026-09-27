import { Capability } from './capability.model';

export interface NavItem {
  /** stable id */
  id: string;
  label: string;
  /** Material Symbols icon name */
  icon?: string;
  route?: string;
  badge?: string | number;
  /**
   * Capabilities required to see this item (A3). Empty/undefined = visible to
   * any authenticated session. Replaces the old persona `roles` list, which
   * could not tell three admin roles apart.
   */
  capabilities?: Capability[];
  /** section header (renders as an uppercase group label) */
  isSection?: boolean;
  children?: NavItem[];
}
