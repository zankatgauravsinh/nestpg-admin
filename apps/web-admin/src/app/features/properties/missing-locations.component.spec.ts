import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MissingLocationsComponent } from './missing-locations.component';
import { environment } from '../../../environments/environment';

const REPORT = environment.apiBase + '/admin/properties/without-location';
const row = (over: Record<string, unknown> = {}) => ({
  propertyId: 'p-1', propertyName: 'Maple Nivas', propertyStatus: 'ACTIVE', areaLocality: 'Hinjewadi', city: 'Pune',
  ownerPhone: '9811000001', currentBookings: 3, ...over,
});
const ROWS = [row(), row({ propertyId: 'p-2', propertyName: 'Cedar House', propertyStatus: 'PENDING_REVIEW', areaLocality: 'Wakad', currentBookings: 0, ownerPhone: null })];

describe('MissingLocationsComponent', () => {
  let http: HttpTestingController;
  const setup = () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(MissingLocationsComponent);
    f.detectChanges();
    return f;
  };
  const el = (f: { nativeElement: HTMLElement }, id: string) => f.nativeElement.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const txt = (n: HTMLElement | null) => (n?.textContent ?? '').replace(/\s+/g, ' ').trim();
  afterEach(() => http.verify());

  it('lists unpinned listings with the owner to chase and the bookings affected', () => {
    const f = setup();
    http.expectOne(REPORT).flush({ success: true, data: { total: 2, properties: ROWS }, meta: null, errors: [] });
    f.detectChanges();
    expect(txt(el(f, 'tile-total'))).toContain('2');
    expect(txt(el(f, 'tile-live'))).toContain('1');
    expect(txt(el(f, 'tile-bookings'))).toContain('1');
    const cells = (id: string) => [...el(f, id)!.querySelectorAll('td')].map((td) => txt(td));
    expect(cells('loc-p-1')).toEqual(['Maple Nivas', 'Live', 'Hinjewadi, Pune', '9811000001', '3', 'Pin']);
    expect(el(f, 'loc-p-1')!.querySelector('a')!.getAttribute('href')).toBe('tel:9811000001');
    expect(cells('loc-p-2')).toEqual(['Cedar House', 'In review', 'Wakad, Pune', '—', '0', 'Pin']);
  });

  it('search narrows by area', async () => {
    const f = setup();
    http.expectOne(REPORT).flush({ success: true, data: { total: 2, properties: ROWS }, meta: null, errors: [] });
    f.detectChanges();
    const box = el(f, 'loc-search') as HTMLInputElement;
    box.value = 'wakad'; box.dispatchEvent(new Event('input')); await f.whenStable(); f.detectChanges();
    expect(el(f, 'loc-p-1')).toBeNull();
    expect(el(f, 'loc-p-2')).toBeTruthy();
    expect(txt(el(f, 'loc-count'))).toBe('Showing 1 of 2');
  });

  it('empty and error are different states', () => {
    const f = setup();
    http.expectOne(REPORT).flush({ success: true, data: { total: 0, properties: [] }, meta: null, errors: [] });
    f.detectChanges();
    expect(el(f, 'loc-empty')).toBeTruthy();
    const g = TestBed.createComponent(MissingLocationsComponent); g.detectChanges();
    http.expectOne(REPORT).flush({}, { status: 500, statusText: 'x' }); g.detectChanges();
    expect(el(g, 'loc-error')).toBeTruthy();
    expect(el(g, 'loc-empty')).toBeNull();
  });

  it('Ops pins a listing: only the pin is sent, the row leaves the list, and the result is said', async () => {
    const f = setup();
    http.expectOne(REPORT).flush({ success: true, data: { total: 2, properties: ROWS.map((r) => ({ ...r, addressLine1: '1 Phase 1 Road', state: 'Maharashtra', pincode: '411057' })) }, meta: null, errors: [] });
    f.detectChanges();
    el(f, 'pin-p-1')!.click(); f.detectChanges();
    expect(txt(el(f, 'pin-address'))).toBe('1 Phase 1 Road, Hinjewadi, Pune, Maharashtra, 411057');
    expect((el(f, 'pin-save') as HTMLButtonElement).disabled).toBe(true); // nothing pinned yet
    f.componentInstance.draftPin.set({ lat: 18.5913, lng: 73.7389 }); f.detectChanges();
    el(f, 'pin-save')!.click();
    const req = http.expectOne(environment.apiBase + '/properties/p-1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ latitude: 18.5913, longitude: 73.7389 });
    req.flush({ success: true, data: { id: 'p-1' }, meta: null, errors: [] }); f.detectChanges();
    expect(el(f, 'loc-p-1')).toBeNull();
    expect(txt(el(f, 'pin-done'))).toContain('Maple Nivas is pinned');
  });

  it('a refused pin keeps the dialog open and explains why', () => {
    const f = setup();
    http.expectOne(REPORT).flush({ success: true, data: { total: 2, properties: ROWS }, meta: null, errors: [] });
    f.detectChanges();
    el(f, 'pin-p-1')!.click(); f.componentInstance.draftPin.set({ lat: 51.5, lng: -0.12 }); f.detectChanges();
    el(f, 'pin-save')!.click();
    http.expectOne(environment.apiBase + '/properties/p-1').flush({ success: false, errors: [{ code: 'Bad Request', message: 'LOCATION_OUTSIDE_INDIA' }] }, { status: 400, statusText: 'Bad Request' });
    f.detectChanges();
    expect(txt(el(f, 'pin-error'))).toContain('isn’t in India');
    expect(el(f, 'loc-p-1')).toBeTruthy();
  });
});
