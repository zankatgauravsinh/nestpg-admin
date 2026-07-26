import { InjectionToken } from '@angular/core';
import { NavItem } from './nav-item.model';

export const NAV_ITEMS = new InjectionToken<NavItem[]>('NAV_ITEMS');

export function provideNavItems(items: NavItem[]) {
  return { provide: NAV_ITEMS, useValue: items };
}
