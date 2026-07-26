import {
  Directive,
  inject,
  Input,
  OnInit,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';
import { UserRole } from '@nestpg/models';
import { AuthStore } from '../auth.store';
import { effect } from '@angular/core';

/**
 * Structural directive that renders the host element only when the current
 * user's role matches one of the allowed roles.
 *
 * Usage:
 *   <button *hasRole="['SUPER_ADMIN', 'OPS_ADMIN']">Admin only</button>
 */
@Directive({
  selector: '[hasRole]',
  standalone: true,
})
export class HasRoleDirective implements OnInit {
  private readonly tpl = inject(TemplateRef);
  private readonly vcr = inject(ViewContainerRef);
  private readonly auth = inject(AuthStore);

  private allowedRoles: UserRole[] = [];
  private hasView = false;

  @Input()
  set hasRole(roles: UserRole[] | UserRole) {
    this.allowedRoles = Array.isArray(roles) ? roles : [roles];
    this.updateView();
  }

  ngOnInit(): void {
    // Re-evaluate when auth state changes
    effect(() => {
      this.auth.role(); // track signal
      this.updateView();
    });
  }

  private updateView(): void {
    const role = this.auth.role();
    const allowed = !!role && this.allowedRoles.includes(role);

    if (allowed && !this.hasView) {
      this.vcr.createEmbeddedView(this.tpl);
      this.hasView = true;
    } else if (!allowed && this.hasView) {
      this.vcr.clear();
      this.hasView = false;
    }
  }
}
