import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AdminStaffComponent } from './admin-staff.component';
import { SessionStore } from '../../core/auth/session.store';
import { Capability } from '../../core/models/capability.model';
import { environment } from '../../../environments/environment';

const url = (p: string) => environment.apiBase + p;
const STAFF = url('/admin/staff');
const SUPER: Capability[] = ['ROLE_ADMINISTRATION', 'USER_OPERATIONS', 'OPERATIONAL_READ'];

const row = (over: Record<string, unknown> = {}) => ({
  id: 's-1', phone: '9900000002', email: 'ops@nestpg.in', role: 'OPS_ADMIN', status: 'ACTIVE',
  lastLoginAt: '2026-09-20T10:00:00.000Z', createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-20T10:00:00.000Z', ...over,
});

/** A3 — Admin Staff Management UI. */
describe('AdminStaffComponent', () => {
  let http: HttpTestingController;
  let session: SessionStore;

  const setup = (capabilities: Capability[] = SUPER) => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    session = TestBed.inject(SessionStore);
    session.setUser({ id: 'me-1', name: 'Super', email: 's@nestpg.test', role: 'SUPER_ADMIN',
      backendRole: 'SUPER_ADMIN', initials: 'S', organization: 'NestPG', capabilities });
    const f = TestBed.createComponent(AdminStaffComponent);
    f.detectChanges();
    return f;
  };
  const el = (f: { nativeElement: HTMLElement }, id: string) =>
    (f.nativeElement as HTMLElement).querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const text = (f: { nativeElement: HTMLElement }) => (f.nativeElement as HTMLElement).textContent ?? '';

  afterEach(() => { http.verify(); localStorage.clear(); });

  it('shows each administrator\'s ACTUAL role in the picker', () => {
    // A [value] binding on the <select> resolves before the @for options exist
    // and silently collapses every row to the first option — caught in the
    // browser, pinned here.
    const f = setup();
    http.expectOne((r) => r.url === STAFF).flush({
      data: [row({ id: 's-1', role: 'OPS_ADMIN' }), row({ id: 's-2', role: 'FINANCE_ADMIN' })],
      meta: { page: 1, limit: 20, total: 2 },
    });
    f.detectChanges();
    expect((el(f, 'role-s-1') as HTMLSelectElement).value).toBe('OPS_ADMIN');
    expect((el(f, 'role-s-2') as HTMLSelectElement).value).toBe('FINANCE_ADMIN');
  });

  it('lists administrators from the admin staff endpoint', () => {
    const f = setup();
    const req = http.expectOne((r) => r.url === STAFF);
    expect(req.request.method).toBe('GET');
    req.flush({ data: [row()], meta: { page: 1, limit: 20, total: 1 } });
    f.detectChanges();
    expect(text(f)).toContain('9900000002');
    expect(text(f)).toContain('Operations Admin');
  });

  it('shows loading, then a distinct error state with retry', () => {
    const f = setup();
    expect(el(f, 'staff-loading')).toBeTruthy();
    http.expectOne((r) => r.url === STAFF).flush('nope', { status: 500, statusText: 'Server Error' });
    f.detectChanges();
    expect(el(f, 'staff-error')).toBeTruthy();
    expect(el(f, 'staff-empty')).toBeNull();
    el(f, 'staff-error')!.querySelector('button')!.click();
    f.detectChanges();
    http.expectOne((r) => r.url === STAFF).flush({ data: [], meta: { page: 1, limit: 20, total: 0 } });
    f.detectChanges();
    expect(el(f, 'staff-empty')).toBeTruthy();
  });

  it('offers only the three Admin roles, never a platform role', async () => {
    const f = setup();
    http.expectOne((r) => r.url === STAFF).flush({ data: [row()], meta: { page: 1, limit: 20, total: 1 } });
    f.detectChanges();
    el(f, 'new-staff')!.click();
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    const options = [...el(f, 'staff-role')!.querySelectorAll('option')].map((o) => o.getAttribute('value'));
    expect(options).toEqual(['SUPER_ADMIN', 'OPS_ADMIN', 'FINANCE_ADMIN']);
    for (const forbidden of ['TENANT', 'PG_OWNER', 'PROP_MANAGER', 'CARETAKER', 'HOUSEKEEPING', 'SECURITY', 'CORP_HR', 'GUEST']) {
      expect(options).not.toContain(forbidden);
    }
  });

  /** jsdom does not submit a form from a button click; dispatch it directly. */
  const submit = (f: ReturnType<typeof setup>) => {
    (el(f, 'create-form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    f.detectChanges();
  };

  /**
   * ngModel inside a <form> registers its control on a microtask, so the model
   * is not bound in the same tick the form is revealed — hence the await.
   */
  const fillForm = async (f: ReturnType<typeof setup>, phone: string, password: string) => {
    el(f, 'new-staff')!.click();
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    const set = (id: string, v: string) => {
      const input = el(f, id) as HTMLInputElement;
      input.value = v; input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('staff-phone', phone);
    set('staff-password', password);
    f.detectChanges();
    await f.whenStable();
  };

  it('creates an administrator and never echoes the password back into the form', async () => {
    const f = setup();
    http.expectOne((r) => r.url === STAFF).flush({ data: [], meta: { page: 1, limit: 20, total: 0 } });
    f.detectChanges();
    await fillForm(f, '9812345678', 'secret123');
    submit(f);

    const req = http.expectOne((r) => r.url === STAFF && r.method === 'POST');
    expect(req.request.body).toEqual({ phone: '9812345678', initialPassword: 'secret123', role: 'OPS_ADMIN' });
    req.flush({ data: row({ id: 's-2', phone: '9812345678' }) });
    f.detectChanges();
    http.expectOne((r) => r.url === STAFF && r.method === 'GET')
      .flush({ data: [row({ id: 's-2', phone: '9812345678' })], meta: { page: 1, limit: 20, total: 1 } });
    f.detectChanges();

    expect(text(f)).toContain('added as');
    el(f, 'new-staff')!.click(); f.detectChanges();
    expect((el(f, 'staff-password') as HTMLInputElement).value).toBe('');
    expect((el(f, 'staff-password') as HTMLInputElement).type).toBe('password');
  });

  it('refuses to submit an invalid phone or a short password', async () => {
    const f = setup();
    http.expectOne((r) => r.url === STAFF).flush({ data: [], meta: { page: 1, limit: 20, total: 0 } });
    f.detectChanges();
    await fillForm(f, '123', 'short');
    expect((el(f, 'create-submit') as HTMLButtonElement).disabled).toBe(true);
  });

  it("surfaces the server's refusal instead of claiming success", async () => {
    const f = setup();
    http.expectOne((r) => r.url === STAFF).flush({ data: [], meta: { page: 1, limit: 20, total: 0 } });
    f.detectChanges();
    await fillForm(f, '9812345678', 'secret123');
    submit(f);
    http.expectOne((r) => r.method === 'POST')
      .flush({ errors: [{ code: 'Conflict', message: 'PHONE_ALREADY_REGISTERED' }] },
             { status: 409, statusText: 'Conflict' });
    f.detectChanges();
    expect(el(f, 'create-error')?.textContent).toContain('already exists');
  });

  it('assigns a role through the role endpoint', () => {
    const f = setup();
    http.expectOne((r) => r.url === STAFF).flush({ data: [row()], meta: { page: 1, limit: 20, total: 1 } });
    f.detectChanges();
    const select = el(f, 'role-s-1') as HTMLSelectElement;
    select.value = 'FINANCE_ADMIN';
    select.dispatchEvent(new Event('change'));
    f.detectChanges();

    const req = http.expectOne(url('/admin/staff/s-1/role'));
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ role: 'FINANCE_ADMIN' });
    req.flush({ data: row({ role: 'FINANCE_ADMIN' }) });
    f.detectChanges();
    http.expectOne((r) => r.url === STAFF).flush({ data: [row({ role: 'FINANCE_ADMIN' })], meta: { page: 1, limit: 20, total: 1 } });
    f.detectChanges();
    expect(text(f)).toContain('sessions were revoked');
  });

  it('suspends and reactivates through the status endpoint', () => {
    const f = setup();
    http.expectOne((r) => r.url === STAFF).flush({ data: [row()], meta: { page: 1, limit: 20, total: 1 } });
    f.detectChanges();
    el(f, 'suspend-s-1')!.click();
    f.detectChanges();
    const req = http.expectOne(url('/admin/staff/s-1/status'));
    expect(req.request.body).toEqual({ status: 'SUSPENDED' });
    req.flush({ data: row({ status: 'SUSPENDED' }) });
    f.detectChanges();
    http.expectOne((r) => r.url === STAFF).flush({ data: [row({ status: 'SUSPENDED' })], meta: { page: 1, limit: 20, total: 1 } });
    f.detectChanges();
    expect(el(f, 'activate-s-1')).toBeTruthy();
  });

  it('offers no destructive control against the signed-in administrator', () => {
    const f = setup();
    http.expectOne((r) => r.url === STAFF).flush({ data: [row({ id: 'me-1', role: 'SUPER_ADMIN' })], meta: { page: 1, limit: 20, total: 1 } });
    f.detectChanges();
    expect(el(f, 'suspend-me-1')).toBeNull();
    expect((el(f, 'role-me-1') as HTMLSelectElement).disabled).toBe(true);
    expect(text(f)).toContain('You');
  });
});
