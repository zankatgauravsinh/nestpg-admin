import { Injectable, signal } from '@angular/core';

/**
 * Google Maps JavaScript API for the Admin console — loaded straight from Google.
 *
 * The browser key is NOT in the source: it is read at runtime from
 * `runtime-config.json` (served from `public/`, git-ignored), written per
 * environment at deploy time:  { "googleMapsApiKey": "…" }.
 * No file or no key → maps are off and every map shows a plain fallback.
 * The key needs the Maps JavaScript API and the Geocoding API, restricted to the
 * Admin console's web addresses.
 */
export interface LatLng { lat: number; lng: number }
export type MapsStatus = 'off' | 'loading' | 'ready' | 'failed';
interface GLatLng { lat(): number; lng(): number }
interface GListener { remove(): void }
export interface GMap { panTo(c: LatLng): void; setZoom(z: number): void; addListener(e: string, fn: (ev?: { latLng?: GLatLng | null }) => void): GListener }
export interface GMarker { setPosition(p: LatLng): void; getPosition(): GLatLng | null | undefined; setMap(m: GMap | null): void; addListener(e: string, fn: () => void): GListener }
export interface GoogleMapsApi {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
  Marker: new (opts: Record<string, unknown>) => GMarker;
  Geocoder: new () => { geocode(req: { address: string; region?: string }): Promise<{ results: Array<{ geometry: { location: GLatLng } }> }> };
  importLibrary?: (name: string) => Promise<unknown>;
}
type MapsWindow = Window & { google?: { maps?: GoogleMapsApi }; __nestpgAdminMapsReady?: () => void; gm_authFailure?: () => void };

export const INDIA_CENTER: LatLng = { lat: 21.15, lng: 79.09 };

@Injectable({ providedIn: 'root' })
export class GoogleMapsService {
  readonly status = signal<MapsStatus>('loading');
  private loading: Promise<GoogleMapsApi | null> | null = null;

  /** The API, or null when maps are off / could not load (see `status`). */
  load(): Promise<GoogleMapsApi | null> {
    const w = window as MapsWindow;
    if (w.google?.maps?.Map) { this.status.set('ready'); return Promise.resolve(w.google.maps); }
    if (this.loading) return this.loading;
    this.loading = this.key().then((key) => {
      if (!key) { this.status.set('off'); return null; }
      return this.inject(key, w);
    }).catch(() => { this.loading = null; this.status.set('failed'); return null; });
    return this.loading;
  }

  /** Forget a failed load so "Try again" really tries again. */
  retry(): Promise<GoogleMapsApi | null> { this.loading = null; this.status.set('loading'); return this.load(); }

  private async key(): Promise<string | null> {
    try {
      const r = await fetch('runtime-config.json', { cache: 'no-store' });
      if (!r.ok) return null;
      const j = (await r.json()) as { googleMapsApiKey?: unknown };
      return typeof j.googleMapsApiKey === 'string' && j.googleMapsApiKey.trim() ? j.googleMapsApiKey.trim() : null;
    } catch { return null; }
  }

  private inject(key: string, w: MapsWindow): Promise<GoogleMapsApi> {
    return new Promise<GoogleMapsApi>((resolve, reject) => {
      const fail = () => { clearTimeout(timer); document.getElementById('nestpg-admin-maps')?.remove(); reject(new Error('maps unavailable')); };
      const timer = setTimeout(fail, 20_000);
      w.gm_authFailure = () => this.status.set('failed');
      w.__nestpgAdminMapsReady = () => {
        clearTimeout(timer);
        const maps = w.google?.maps;
        if (!maps) { fail(); return; }
        const libs = maps.importLibrary ? ['maps', 'marker', 'geocoding'].map((l) => maps.importLibrary!(l)) : [];
        Promise.all(libs).then(() => { this.status.set('ready'); resolve(maps); }, fail);
      };
      const s = document.createElement('script');
      s.id = 'nestpg-admin-maps';
      s.async = true;
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&region=IN&language=en&callback=__nestpgAdminMapsReady`;
      s.addEventListener('error', fail, { once: true });
      document.head.appendChild(s);
    });
  }
}

/** A pin read from the API (decimals arrive as strings), or null. */
export function pinOf(p: { latitude?: number | string | null; longitude?: number | string | null } | null | undefined): LatLng | null {
  if (!p || p.latitude == null || p.longitude == null || p.latitude === '' || p.longitude === '') return null;
  const lat = Number(p.latitude), lng = Number(p.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}
