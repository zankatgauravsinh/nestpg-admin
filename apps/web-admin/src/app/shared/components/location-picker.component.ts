import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, effect, inject, input, output, signal, viewChild,
} from '@angular/core';
import { GoogleMapsService, GMap, GMarker, INDIA_CENTER, LatLng } from '../../core/maps/google-maps.service';

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Pin a property's exact entrance on the map — the same tool owners have.
 * Find the typed address (Geocoding), use this device's location, or tap / drag
 * the pin. Emits the pin; the caller saves it. Without a Maps key the map is
 * replaced by a message and only the device location is offered.
 */
@Component({
  selector: 'os-location-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-2" data-testid="location-picker">
      @if (maps.status() === 'ready') {
        <div #mapEl class="w-full h-64 rounded-xl overflow-hidden border border-border" role="region" aria-label="Map: tap or drag the pin to the entrance" data-testid="location-picker-map"></div>
      } @else {
        <div class="w-full h-32 rounded-xl border border-border bg-canvas flex flex-col items-center justify-center gap-1 text-center px-4" data-testid="map-fallback" [attr.data-status]="maps.status()">
          <p class="text-[13px] text-muted">{{ maps.status() === 'loading' ? 'Loading the map…' : maps.status() === 'failed' ? 'The map couldn’t be loaded.' : 'The map isn’t set up for this console yet.' }}</p>
          @if (maps.status() === 'failed') { <button type="button" (click)="retry()" class="text-[13px] text-accent font-medium">Try again</button> }
        </div>
      }
      <div class="flex flex-wrap gap-2">
        @if (maps.status() === 'ready') {
          <button type="button" (click)="find()" [disabled]="!address().trim() || busy() !== null" data-testid="find-address"
            class="h-8 px-3 rounded-lg border border-border text-[13px] text-content disabled:opacity-50">{{ busy() === 'find' ? 'Finding…' : 'Find the address on the map' }}</button>
        }
        <button type="button" (click)="locate()" [disabled]="busy() !== null" data-testid="use-my-location"
          class="h-8 px-3 rounded-lg border border-border text-[13px] text-content disabled:opacity-50">{{ busy() === 'locate' ? 'Locating…' : 'Use this device’s location' }}</button>
      </div>
      @if (note(); as n) { <p class="text-[12px] text-muted" role="status">{{ n }}</p> }
      <p class="text-[12px]" [class.text-success]="!!value()" [class.text-warning]="!value()" data-testid="pin-status">
        {{ value() ? '📍 Pinned at ' + value()!.lat.toFixed(5) + ', ' + value()!.lng.toFixed(5) : 'Not pinned. Residents can’t find it on the map, and it can’t be submitted or approved.' }}
      </p>
    </div>
  `,
})
export class LocationPickerComponent implements AfterViewInit, OnDestroy {
  readonly maps = inject(GoogleMapsService);
  readonly value = input<LatLng | null>(null);
  /** The typed address, for "Find the address on the map". */
  readonly address = input('');
  readonly pinChange = output<LatLng>();
  readonly busy = signal<'find' | 'locate' | null>(null);
  readonly note = signal<string | null>(null);
  private readonly mapEl = viewChild<ElementRef<HTMLDivElement>>('mapEl');
  private map: GMap | null = null;
  private marker: GMarker | null = null;
  private listeners: Array<{ remove(): void }> = [];

  constructor() {
    // Build the map once its element exists; keep the pin where the value says.
    effect(() => { const el = this.mapEl(); if (el && !this.map) void this.build(el.nativeElement); });
    effect(() => { const v = this.value(); if (v) this.marker?.setPosition(v); });
  }

  ngAfterViewInit(): void { void this.maps.load(); }
  ngOnDestroy(): void { this.listeners.forEach((l) => l.remove()); this.marker?.setMap(null); }
  retry(): void { void this.maps.retry(); }

  private async build(el: HTMLElement): Promise<void> {
    const api = await this.maps.load();
    if (!api || this.map) return;
    const v = this.value();
    this.map = new api.Map(el, { center: v ?? INDIA_CENTER, zoom: v ? 17 : 5, gestureHandling: 'greedy', clickableIcons: false, disableDefaultUI: true, zoomControl: true, mapTypeControl: true });
    this.marker = new api.Marker({ map: this.map, draggable: true, title: 'Property location', ...(v ? { position: v } : {}) });
    this.listeners.push(this.marker.addListener('dragend', () => { const p = this.marker?.getPosition(); if (p) this.place({ lat: p.lat(), lng: p.lng() }); }));
    this.listeners.push(this.map.addListener('click', (e) => { if (e?.latLng) this.place({ lat: e.latLng.lat(), lng: e.latLng.lng() }); }));
  }

  private place(p: LatLng, zoom?: number): void {
    const at = { lat: round(p.lat), lng: round(p.lng) };
    this.marker?.setPosition(at);
    this.map?.panTo(at);
    if (zoom) this.map?.setZoom(zoom);
    this.pinChange.emit(at);
  }

  async find(): Promise<void> {
    const api = await this.maps.load();
    if (!api || !this.address().trim()) return;
    this.busy.set('find'); this.note.set(null);
    try {
      const { results } = await new api.Geocoder().geocode({ address: this.address(), region: 'IN' });
      const hit = results[0];
      if (!hit) this.note.set('That address wasn’t found. Move the map and tap the exact spot instead.');
      else { this.place({ lat: hit.geometry.location.lat(), lng: hit.geometry.location.lng() }, 17); this.note.set('Check the pin, and drag it to the entrance if it’s off.'); }
    } catch (e) {
      const code = String((e as { code?: string } | null)?.code ?? '');
      this.note.set(code === 'ZERO_RESULTS'
        ? 'That address wasn’t found. Move the map and tap the exact spot instead.'
        : 'Address search isn’t working right now. Move the map and tap the exact spot instead.');
    }
    this.busy.set(null);
  }

  locate(): void {
    if (!navigator.geolocation) { this.note.set('This device can’t share its location.'); return; }
    this.busy.set('locate'); this.note.set(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { this.busy.set(null); this.place({ lat: pos.coords.latitude, lng: pos.coords.longitude }, 18); this.note.set('Pinned where this device is. Drag the pin if you’re not at the property.'); },
      () => { this.busy.set(null); this.note.set('This device’s location isn’t available.'); },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }
}
