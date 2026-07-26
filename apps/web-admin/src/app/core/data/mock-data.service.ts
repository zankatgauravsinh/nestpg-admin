import { Injectable, computed, signal } from '@angular/core';
import { PlatformStats } from './models';
import {
  BEDS,
  BOOKINGS,
  KYC_SUBMISSIONS,
  PAYMENTS,
  PROPERTIES,
  RESIDENTS,
  TICKETS,
} from './seed';

/**
 * Central mock-data service. Every future screen reads from these signals,
 * giving a single, consistent data architecture without a backend.
 */
@Injectable({ providedIn: 'root' })
export class MockDataService {
  readonly properties = signal(PROPERTIES);
  readonly residents = signal(RESIDENTS);
  readonly beds = signal(BEDS);
  readonly bookings = signal(BOOKINGS);
  readonly payments = signal(PAYMENTS);
  readonly tickets = signal(TICKETS);
  readonly kyc = signal(KYC_SUBMISSIONS);

  readonly stats = computed<PlatformStats>(() => {
    const props = this.properties();
    const totalBeds = props.reduce((s, p) => s + p.totalBeds, 0);
    const occupiedBeds = props.reduce((s, p) => s + p.occupiedBeds, 0);
    const revenue = props.reduce((s, p) => s + p.monthlyRevenuePaise, 0);
    return {
      totalProperties: props.length,
      totalBeds,
      occupiedBeds,
      monthlyRevenuePaise: revenue,
      activeResidents: this.residents().filter((r) => r.status === 'CHECKED_IN').length,
      openTickets: this.tickets().filter((t) => t.status === 'OPEN' || t.status === 'ESCALATED').length,
      pendingKyc: this.kyc().filter((k) => k.status !== 'APPROVED' && k.status !== 'REJECTED').length,
      collectionRate: 0.94,
    };
  });

  propertyName(id: string): string {
    return this.properties().find((p) => p.id === id)?.name ?? '—';
  }
}
