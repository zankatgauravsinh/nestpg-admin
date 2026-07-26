import { CanDeactivateFn } from '@angular/router';

/** Components implementing this expose a leave check for the CanDeactivate guard. */
export interface CanComponentDeactivate {
  canLeave(): boolean | Promise<boolean>;
}

/**
 * Route guard that lets a component veto navigation while it holds unsaved edits.
 * The component drives its own "discard changes?" dialog and resolves the promise.
 */
export const unsavedChangesGuard: CanDeactivateFn<CanComponentDeactivate> = (component) =>
  component?.canLeave ? component.canLeave() : true;
