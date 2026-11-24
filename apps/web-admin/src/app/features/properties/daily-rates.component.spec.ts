import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DailyRatesComponent } from './daily-rates.component';
import { environment } from '../../../environments/environment';

const REPORT = environment.apiBase + '/admin/beds/without-daily-price';

const bed = (over: Record<string, unknown> = {}) => ({
  propertyId: 'p-1', propertyName: 'Maple Nivas', propertyStatus: 'ACTIVE', city: 'Pune',
  ownerId: 'o-1', ownerPhone: '9811000001',
  roomNumber: '101', bedId: 'b-1', bedNumber: 'B1', bedStatus: 'AVAILABLE', pricePaisa: 800000,
  ...over,
});

const BEDS = [
  bed(),
  bed({ bedId: 'b-2', bedNumber: 'B2', bedStatus: 'OCCUPIED' }),
  bed({ bedId: 'b-3', roomNumber: '9', bedNumber: 'B1' }),
  bed({ propertyId: 'p-2', propertyName: 'Cedar House', propertyStatus: 'REJECTED', city: 'Surat', ownerPhone: '9811000002', bedId: 'b-4' }),
  bed({ propertyId: 'p-3', propertyName: 'Aster Co-living', propertyStatus: 'PENDING_REVIEW', city: 'Ahmedabad', ownerPhone: null, bedId: 'b-5', bedStatus: 'RESERVED' }),
];

/** The Ops chase list for beds without a daily rate. */
describe('DailyRatesComponent', () => {
  let http: HttpTestingController;

  const setup = () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(DailyRatesComponent);
    f.detectChanges();
    return f;
  };
  const flush = (f: ReturnType<typeof setup>, beds: unknown[]) => {
    http.expectOne(REPORT).flush({ success: true, data: { total: beds.length, beds }, meta: null, errors: [] });
    f.detectChanges();
  };
  const el = (f: { nativeElement: HTMLElement }, id: string) => f.nativeElement.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const text = (f: { nativeElement: HTMLElement }) => f.nativeElement.textContent ?? '';
  const articles = (f: { nativeElement: HTMLElement }) =>
    [...f.nativeElement.querySelectorAll<HTMLElement>('article')].map((a) => a.querySelector('h2')!.textContent!.trim());

  afterEach(() => http.verify());

  it('asks the admin report and shows a loading state until it answers', () => {
    const f = setup();
    expect(el(f, 'rates-loading')).toBeTruthy();
    flush(f, BEDS);
    expect(el(f, 'rates-loading')).toBeNull();
  });

  it('summarises the gap: beds, properties, beds in live listings, beds with a current stay', () => {
    const f = setup();
    flush(f, BEDS);
    expect(el(f, 'tile-beds')?.textContent).toContain('5');
    expect(el(f, 'tile-properties')?.textContent).toContain('3');
    expect(el(f, 'tile-live')?.textContent).toContain('3');
    expect(el(f, 'tile-stays')?.textContent).toContain('2'); // occupied + reserved
  });

  it('groups by property, live listings first, with the owner phone to call and rooms in natural order', () => {
    const f = setup();
    flush(f, BEDS);
    expect(articles(f)).toEqual(['Maple Nivas', 'Aster Co-living', 'Cedar House']);
    const maple = el(f, 'rates-p-1')!;
    expect(maple.textContent).toContain('Live');
    expect(maple.querySelector('a[href="tel:9811000001"]')).toBeTruthy();
    const chips = [...maple.querySelectorAll('li')].map((li) => li.textContent!.replace(/\s+/g, ' ').trim());
    expect(chips).toEqual(['Room 9 · Bed B1', 'Room 101 · Bed B1', 'Room 101 · Bed B2 · occupied']);
    expect(el(f, 'rates-p-3')?.textContent).toContain('In review');
    expect(el(f, 'rates-p-3')?.querySelector('a[href^="tel:"]')).toBeNull(); // no phone → no link
  });

  it('filters by listing status and searches property, city or owner phone', () => {
    const f = setup();
    flush(f, BEDS);
    expect(el(f, 'filter-ALL')?.textContent).toContain('All · 3');
    el(f, 'filter-REJECTED')!.click(); f.detectChanges();
    expect(articles(f)).toEqual(['Cedar House']);
    expect(el(f, 'rates-count')?.textContent).toContain('Showing 1 of 5 beds in 1 of 3 properties');

    el(f, 'filter-ALL')!.click(); f.detectChanges();
    const search = el(f, 'rates-search') as HTMLInputElement;
    search.value = 'ahmed'; search.dispatchEvent(new Event('input')); f.detectChanges();
    expect(articles(f)).toEqual(['Aster Co-living']);
    search.value = '9811000002'; search.dispatchEvent(new Event('input')); f.detectChanges();
    expect(articles(f)).toEqual(['Cedar House']);
    search.value = 'nowhere'; search.dispatchEvent(new Event('input')); f.detectChanges();
    expect(el(f, 'rates-no-match')).toBeTruthy();
  });

  it('nothing missing is an EMPTY state, with no export', () => {
    const f = setup();
    flush(f, []);
    expect(el(f, 'rates-empty')?.textContent).toContain('Every bed has a daily rate');
    expect(el(f, 'export-csv')).toBeNull();
  });

  it('a failed request is an ERROR state with a retry — never "every bed has a rate"', () => {
    const f = setup();
    http.expectOne(REPORT).flush({ errors: [{ code: 'FORBIDDEN', message: 'Forbidden' }] }, { status: 403, statusText: 'Forbidden' });
    f.detectChanges();
    expect(el(f, 'rates-error')).toBeTruthy();
    expect(el(f, 'rates-empty')).toBeNull();
    (el(f, 'rates-error')!.querySelector('button') as HTMLButtonElement).click();
    flush(f, BEDS);
    expect(articles(f).length).toBe(3);
  });

  it('exports the rows shown as CSV, quoted and safe to open in a spreadsheet', async () => {
    const f = setup();
    flush(f, [...BEDS, bed({ propertyId: 'p-9', propertyName: '=HYPERLINK("x")', bedId: 'b-9' })]);
    let captured: Blob | null = null;
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => { captured = b as Blob; return 'blob:x'; });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    el(f, 'filter-ACTIVE')!.click(); f.detectChanges();
    el(f, 'export-csv')!.click();
    const csv = await captured!.text();
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('"Property","Listing status","City","Owner phone","Room","Bed","Bed status"');
    expect(lines).toContain('"Maple Nivas","Live","Pune","9811000001","101","B2","OCCUPIED"');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);   // formula neutralised
    expect(csv).not.toContain('Cedar House');           // only what the filter shows
    expect(click).toHaveBeenCalled();
    create.mockRestore(); revoke.mockRestore(); click.mockRestore();
  });
});
