import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { DepositDisputesQueueComponent } from './deposit-disputes-queue.component';
import { SessionStore } from '../../../core/auth/session.store';
import { environment } from '../../../../environments/environment';
import { adminUser, detail, READ_ONLY } from './dispute-test-fixtures';

const QUEUE = environment.apiBase + '/admin/deposit-disputes';

/** ADM-D.1 — the queue reads the backend filters, keeps its order, pages from meta.total. */
describe('DepositDisputesQueueComponent', () => {
  let http: HttpTestingController;
  const setup = (query: Record<string, string> = {}) => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) }, paramMap: of(convertToParamMap({})) } }],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(SessionStore).setUser(adminUser(READ_ONLY));
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const f = TestBed.createComponent(DepositDisputesQueueComponent);
    f.detectChanges();
    return f;
  };
  const el = (f: { nativeElement: HTMLElement }, id: string) => f.nativeElement.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const row = (over = {}) => { const d = detail(over); return { ...d, events: undefined, targetFacts: undefined }; };
  afterEach(() => http.verify());

  it('defaults to OPEN, page 1, limit 20; shows loading then rows in the server order', () => {
    const f = setup();
    expect(el(f, 'queue-loading')).toBeTruthy();
    const req = http.expectOne((r) => r.url === QUEUE);
    expect(req.request.params.get('status')).toBe('OPEN');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('limit')).toBe('20');
    req.flush({ data: [row({ id: 'd-open', status: 'OPEN' }), row({ id: 'd-res', status: 'RESOLVED', finding: 'UPHELD', effect: 'SETTLEMENT_SUPERSEDED', effectExecuted: false })], meta: { page: 1, limit: 20, total: 2 } });
    f.detectChanges();
    const ids = Array.from(f.nativeElement.querySelectorAll('tbody tr')).map((r) => (r as HTMLElement).dataset['testid']);
    expect(ids).toEqual(['row-d-open', 'row-d-res']); // rendered exactly as received (OPEN first is the server's order)
    expect(el(f, 'outcome-d-res')!.textContent).toMatch(/Upheld · Recorded — not applied/);
    expect(el(f, 'queue-count')!.textContent).toMatch(/2 cases · page 1 of 1/);
  });

  it('deep-link filters (booking, property, target type, status ALL) are sent as server params', () => {
    setup({ bookingId: 'b-1', propertyId: 'p-1', targetType: 'SETTLEMENT', status: 'ALL', page: '3' });
    const req = http.expectOne((r) => r.url === QUEUE);
    expect(req.request.params.get('bookingId')).toBe('b-1');
    expect(req.request.params.get('propertyId')).toBe('p-1');
    expect(req.request.params.get('targetType')).toBe('SETTLEMENT');
    expect(req.request.params.has('status')).toBe(false);
    expect(req.request.params.get('page')).toBe('3');
    req.flush({ data: [], meta: { page: 3, limit: 20, total: 0 } });
  });

  it('changing a filter re-queries the server (no client-side filtering) and resets to page 1', () => {
    const f = setup();
    http.expectOne((r) => r.url === QUEUE).flush({ data: [row()], meta: { page: 1, limit: 20, total: 45 } });
    f.detectChanges();
    el(f, 'next-page')!.click();
    expect(http.expectOne((r) => r.url === QUEUE).request.params.get('page')).toBe('2');
    el(f, 'status-RESOLVED')!.click();
    const req = http.expectOne((r) => r.url === QUEUE);
    expect(req.request.params.get('status')).toBe('RESOLVED');
    expect(req.request.params.get('page')).toBe('1');
    req.flush({ data: [], meta: { page: 1, limit: 20, total: 0 } });
    f.detectChanges();
    expect(el(f, 'queue-empty')!.textContent).toMatch(/No deposit disputes match these filters/);
  });

  it('pages are derived from meta.total (no totalPages in the envelope)', () => {
    const f = setup();
    http.expectOne((r) => r.url === QUEUE).flush({ data: [row()], meta: { page: 1, limit: 20, total: 41 } });
    f.detectChanges();
    expect(el(f, 'queue-count')!.textContent).toMatch(/page 1 of 3/);
    expect((el(f, 'prev-page') as HTMLButtonElement).disabled).toBe(true);
  });

  it('an empty OPEN queue and a failed load are different states', () => {
    const a = setup();
    http.expectOne((r) => r.url === QUEUE).flush({ data: [], meta: { page: 1, limit: 20, total: 0 } });
    a.detectChanges();
    expect(el(a, 'queue-empty')!.textContent).toMatch(/No open deposit disputes/);
    TestBed.resetTestingModule();
    const b = setup();
    http.expectOne((r) => r.url === QUEUE).flush({ errors: [{ code: 'Forbidden', message: 'Forbidden resource' }] }, { status: 403, statusText: 'Forbidden' });
    b.detectChanges();
    expect(el(b, 'queue-empty')).toBeNull();
    expect(el(b, 'queue-error')!.textContent).toMatch(/Your role cannot do this/);
  });

  it('rows show ids only where the projection has no names (no user lookups)', () => {
    const f = setup();
    http.expectOne((r) => r.url === QUEUE).flush({ data: [row()], meta: { page: 1, limit: 20, total: 1 } });
    f.detectChanges();
    http.expectNone((r) => r.url.includes('/users/'));
    expect(f.nativeElement.textContent).toMatch(/Resident/);
  });
});
