import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { ApiService } from '../api/api.service';

/** Normalized dashboard payloads consumed by the screens. */
export interface RevenueDashboard {
  total: number;
  collected: number;
  outstanding: number;
  growthPct?: number;
  series?: { label: string; value: number }[];
}
export interface OccupancyDashboard {
  ratePct: number;
  totalBeds: number;
  occupiedBeds: number;
  reservedBeds?: number;
  availableBeds?: number;
}
export interface BookingsDashboard {
  total: number;
  confirmed: number;
  checkedIn: number;
  checkedOut: number;
  pending: number;
}

interface RawRevenue { expectedRentPaisa?: number; collectedPaisa?: number; outstandingPaisa?: number; growthPct?: number; series?: { label: string; value: number }[] }
interface RawOccupancy { occupancyRate?: number; ratePct?: number; totalBeds?: number; occupiedBeds?: number; reservedBeds?: number; availableBeds?: number }
interface RawBookings { pending?: number; confirmed?: number; checkedIn?: number; checkedOut?: number }

/** Reads dashboard/* endpoints and normalizes them. Errors degrade to null. */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly api = inject(ApiService);

  revenue(propertyId?: string): Observable<RevenueDashboard | null> {
    return this.api.get<RawRevenue>('/dashboard/revenue', { propertyId }).pipe(
      map((r) => {
        if (!r) return null;
        const total = r.expectedRentPaisa ?? 0;
        const collected = r.collectedPaisa ?? Math.round(total * 0.94);
        return {
          total,
          collected,
          outstanding: r.outstandingPaisa ?? Math.max(0, total - collected),
          growthPct: r.growthPct,
          series: r.series,
        } as RevenueDashboard;
      }),
      catchError(() => of(null)),
    );
  }

  occupancy(propertyId?: string): Observable<OccupancyDashboard | null> {
    return this.api.get<RawOccupancy>('/dashboard/occupancy', { propertyId }).pipe(
      map((r) =>
        r
          ? ({
              ratePct: r.occupancyRate ?? r.ratePct ?? 0,
              totalBeds: r.totalBeds ?? 0,
              occupiedBeds: r.occupiedBeds ?? 0,
              reservedBeds: r.reservedBeds,
              availableBeds: r.availableBeds,
            } as OccupancyDashboard)
          : null,
      ),
      catchError(() => of(null)),
    );
  }

  bookings(propertyId?: string): Observable<BookingsDashboard | null> {
    return this.api.get<RawBookings>('/dashboard/bookings', { propertyId }).pipe(
      map((r) =>
        r
          ? ({
              total: (r.pending ?? 0) + (r.confirmed ?? 0) + (r.checkedIn ?? 0) + (r.checkedOut ?? 0),
              confirmed: r.confirmed ?? 0,
              checkedIn: r.checkedIn ?? 0,
              checkedOut: r.checkedOut ?? 0,
              pending: r.pending ?? 0,
            } as BookingsDashboard)
          : null,
      ),
      catchError(() => of(null)),
    );
  }
}
