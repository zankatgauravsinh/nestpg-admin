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
    expect(cells('loc-p-1')).toEqual(['Maple Nivas', 'Live', 'Hinjewadi, Pune', '9811000001', '3']);
    expect(el(f, 'loc-p-1')!.querySelector('a')!.getAttribute('href')).toBe('tel:9811000001');
    expect(cells('loc-p-2')).toEqual(['Cedar House', 'In review', 'Wakad, Pune', '—', '0']);
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
});
