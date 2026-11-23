import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TopbarComponent } from './topbar.component';
import { SessionStore } from '../../core/auth/session.store';
import { CurrentUser, Role } from '../../core/models/role.model';

const user = (role: Role, backendRole: string): CurrentUser => ({
  id: 'u-1', name: 'Asha', email: 'a@nestpg.test', role, backendRole, initials: 'A', organization: 'NestPG', capabilities: [],
});

describe('TopbarComponent role label (D6)', () => {
  const render = (u: CurrentUser | null) => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), provideNoopAnimations()] });
    if (u) TestBed.inject(SessionStore).setUser(u);
    const f = TestBed.createComponent(TopbarComponent);
    f.detectChanges();
    const el = f.nativeElement.querySelector('[data-testid="topbar-role"]') as HTMLElement | null;
    return el ? (el.textContent ?? '').replace(/\s+/g, ' ').replace('shield_person', '').trim() : null;
  };

  it('a Finance Admin is labelled Finance Admin, not Super Admin (the persona is lossy)', () => {
    expect(render(user('SUPER_ADMIN', 'FINANCE_ADMIN'))).toBe('Finance Admin');
  });

  it('an Operations Admin is labelled Operations Admin', () => {
    expect(render(user('SUPER_ADMIN', 'OPS_ADMIN'))).toBe('Operations Admin');
  });

  it('only a real Super Admin reads Super Admin', () => {
    expect(render(user('SUPER_ADMIN', 'SUPER_ADMIN'))).toBe('Super Admin');
  });

  it('non-admin roles keep their persona label', () => {
    expect(render(user('OWNER', 'PG_OWNER'))).toBe('Owner');
    TestBed.resetTestingModule();
    expect(render(user('MANAGER', 'PROP_MANAGER'))).toBe('Manager');
  });

  it('no session, no role chip', () => {
    expect(render(null)).toBeNull();
  });
});
