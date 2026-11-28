import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { LocationPickerComponent } from './location-picker.component';
import { GoogleMapsService, LatLng } from '../../core/maps/google-maps.service';

/** A minimal stand-in for google.maps (jsdom has no map). */
function fakeMaps(geocode: (a: string) => Promise<unknown>) {
  const log = { maps: [] as Array<{ opts: Record<string, unknown>; fire: (e: string, a?: unknown) => void }>, markers: [] as Array<{ pos: LatLng | null; fire: (e: string) => void }> };
  const on = () => { const h = new Map<string, Array<(a?: unknown) => void>>(); return { h, add: (e: string, fn: (a?: unknown) => void) => { h.set(e, [...(h.get(e) ?? []), fn]); return { remove: () => {} }; }, fire: (e: string, a?: unknown) => (h.get(e) ?? []).forEach((f) => f(a)) }; };
  class FakeMap { private ev = on(); constructor(_el: HTMLElement, public opts: Record<string, unknown>) { log.maps.push({ opts, fire: this.ev.fire }); } panTo() {} setZoom() {} addListener(e: string, fn: (a?: unknown) => void) { return this.ev.add(e, fn); } }
  class Marker { private ev = on(); pos: LatLng | null; constructor(o: { position?: LatLng }) { this.pos = o.position ?? null; const self = this; log.markers.push({ get pos() { return self.pos; }, set pos(v) { self.pos = v; }, fire: this.ev.fire } as never); } setPosition(p: LatLng) { this.pos = p; } getPosition() { return this.pos ? { lat: () => this.pos!.lat, lng: () => this.pos!.lng } : null; } setMap() {} addListener(e: string, fn: () => void) { return this.ev.add(e, fn); } }
  class Geocoder { geocode(r: { address: string }) { return geocode(r.address); } }
  (window as unknown as { google?: unknown }).google = { maps: { Map: FakeMap, Marker, Geocoder } };
  return log;
}
const ll = (lat: number, lng: number) => ({ lat: () => lat, lng: () => lng });

@Component({ standalone: true, imports: [LocationPickerComponent], template: `<os-location-picker [value]="value()" [address]="address" (pinChange)="got.push($event); value.set($event)" />` })
class Host { value = signal<LatLng | null>(null); address = '1 Phase 1 Road, Hinjewadi, Pune'; got: LatLng[] = []; }

describe('LocationPickerComponent', () => {
  afterEach(() => { delete (window as unknown as { google?: unknown }).google; });
  const setup = () => { TestBed.configureTestingModule({}); const f = TestBed.createComponent(Host); f.detectChanges(); return f; };
  const el = (f: { nativeElement: HTMLElement }, id: string) => f.nativeElement.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const settle = async (f: { whenStable(): Promise<unknown>; detectChanges(): void }) => { for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 0)); await f.whenStable(); f.detectChanges(); } };

  it('without a key the map is replaced by a message; this device’s location still pins', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    const geo = vi.fn((ok: PositionCallback) => ok({ coords: { latitude: 18.59131234, longitude: 73.73891234 } } as GeolocationPosition));
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: geo }, configurable: true });
    const f = setup(); await settle(f);
    expect(el(f, 'map-fallback')?.getAttribute('data-status')).toBe('off');
    expect(el(f, 'find-address')).toBeNull();
    el(f, 'use-my-location')!.click(); await settle(f);
    expect(f.componentInstance.got).toEqual([{ lat: 18.591312, lng: 73.738912 }]);
    expect(el(f, 'pin-status')?.textContent).toContain('Pinned at 18.59131, 73.73891');
    vi.restoreAllMocks();
  });

  it('finds the address, then a tap and a drag move the pin; every move is emitted', async () => {
    const log = fakeMaps(async () => ({ results: [{ geometry: { location: ll(18.5913, 73.7389) } }] }));
    const f = setup(); TestBed.inject(GoogleMapsService).status.set('ready'); f.detectChanges(); await settle(f);
    expect(log.maps).toHaveLength(1);
    el(f, 'find-address')!.click(); await settle(f);
    expect(f.componentInstance.got.at(-1)).toEqual({ lat: 18.5913, lng: 73.7389 });
    log.maps[0]!.fire('click', { latLng: ll(18.6, 73.75) });
    expect(f.componentInstance.got.at(-1)).toEqual({ lat: 18.6, lng: 73.75 });
    log.markers[0]!.pos = { lat: 18.61234567, lng: 73.76 }; log.markers[0]!.fire('dragend');
    expect(f.componentInstance.got.at(-1)).toEqual({ lat: 18.612346, lng: 73.76 });
  });

  it('when Google refuses the search it says so, and doesn’t blame the address', async () => {
    fakeMaps(() => Promise.reject(Object.assign(new Error('denied'), { code: 'REQUEST_DENIED' })));
    const f = setup(); TestBed.inject(GoogleMapsService).status.set('ready'); f.detectChanges(); await settle(f);
    el(f, 'find-address')!.click(); await settle(f);
    expect(f.nativeElement.textContent).toContain('Address search isn’t working right now');
    expect(f.componentInstance.got).toEqual([]);
  });
});
