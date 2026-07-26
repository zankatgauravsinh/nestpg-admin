import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { UsersService, ApiUser, userDisplayName } from './users.service';
import { PropertiesService } from './properties.service';
import { BookingsService, ApiBooking } from './bookings.service';
import { Property } from './models';

export interface SearchResults {
  residents: { id: string; name: string; sub: string; route: string[]; query: Record<string, string> }[];
  properties: { id: string; name: string; sub: string; route: string[]; query: Record<string, string> }[];
  bookings: { id: string; name: string; sub: string; route: string[]; query: Record<string, string> }[];
  total: number;
}

/** Cross-entity search across residents, properties and bookings (client-side filter). */
@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly users = inject(UsersService);
  private readonly props = inject(PropertiesService);
  private readonly bookings = inject(BookingsService);

  search(qRaw: string): Observable<SearchResults> {
    const q = qRaw.toLowerCase().trim();
    return forkJoin({
      users: this.users.list({ limit: 100 }),
      properties: this.props.portfolio(),
      bookings: this.bookings.bookings({ limit: 100 }),
    }).pipe(
      map(({ users, properties, bookings }) => {
        const residents = (users as ApiUser[])
          .filter((u) => `${userDisplayName(u)} ${u.phone ?? ''} ${u.email ?? ''}`.toLowerCase().includes(q))
          .slice(0, 8)
          .map((u) => ({
            id: u.id, name: userDisplayName(u), sub: `${u.phone ?? ''} · ${u.role ?? 'TENANT'}`,
            route: ['/residents/crm'], query: { id: u.id },
          }));

        const props = (properties as Property[])
          .filter((p) => `${p.name} ${p.city} ${p.address}`.toLowerCase().includes(q))
          .slice(0, 8)
          .map((p) => ({
            id: p.id, name: p.name, sub: `${p.city} · ${p.occupiedBeds}/${p.totalBeds} beds`,
            route: ['/properties/workspace'], query: { id: p.id },
          }));

        const bks = (bookings as ApiBooking[])
          .filter((b) => `${b.tenantName ?? ''} ${b.bookingNumber ?? ''} ${b.roomNumber ?? ''}`.toLowerCase().includes(q))
          .slice(0, 8)
          .map((b) => ({
            id: b.id, name: b.tenantName || b.bookingNumber || 'Booking',
            sub: `${b.bookingNumber ?? ''} · ${b.status ?? ''}`, route: ['/bookings'], query: {},
          }));

        return { residents, properties: props, bookings: bks, total: residents.length + props.length + bks.length };
      }),
    );
  }
}
