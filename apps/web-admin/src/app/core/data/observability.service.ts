import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { ApiService } from '../api/api.service';

export interface HttpRouteMetric {
  method: string; route: string; count: number; errors: number;
  avgMs: number; p95Ms: number; p99Ms: number; status: Record<string, number>;
}
export interface SystemMetrics {
  timestamp: string;
  api: { totals: { requests: number; errors: number; avgMs: number; p95Ms: number; p99Ms: number }; routes: HttpRouteMetric[] };
  business: Record<string, number>;
  database: { status: string; activeConnections?: number; idleConnections?: number; totalConnections?: number; error?: string };
  redis: { status: string; connectedClients?: number; usedMemory?: string; opsPerSec?: number; version?: string; error?: string };
  storage: { status: string; bucket?: string; uploadSuccess: number; uploadFailure: number; presign: number; error?: string };
  queues: {
    outbox: { pending: number; failed: number; delivered: number; error?: string };
    jobs: { name: string; lastStatus: string | null; lastStartedAt: string | null; lastCompletedAt: string | null; lastDurationMs: number | null; failureCount: number }[];
  };
}
export interface SystemBusiness {
  timestamp: string;
  platform: { total_users: number; owners: number; residents: number; properties: number; buildings: number; rooms: number; beds: number };
  occupancy: { occupied: number; reserved: number; available: number; total: number; occupancyPct: number };
  today: { bookings: number; check_ins: number; check_outs: number; payments: number; revenue_paisa: string | number };
  finance: { outstanding_paisa: string | number; overdue_invoices: number };
  ops: { visitors_inside: number; pending_kyc: number; review_queue: number; notification_queue: number };
}
export interface OpsAlert { level: 'CRITICAL' | 'WARNING' | 'INFO'; source: string; message: string }

/** SDK for the RC3 observability endpoints (SUPER_ADMIN / OPS_ADMIN only). */
@Injectable({ providedIn: 'root' })
export class ObservabilityService {
  private readonly api = inject(ApiService);

  metrics(): Observable<SystemMetrics | null> {
    return this.api.get<SystemMetrics>('/admin/metrics').pipe(catchError(() => of(null)));
  }
  business(): Observable<SystemBusiness | null> {
    return this.api.get<SystemBusiness>('/admin/dashboard/system').pipe(catchError(() => of(null)));
  }
  alerts(): Observable<{ timestamp: string; alerts: OpsAlert[] } | null> {
    return this.api.get<{ timestamp: string; alerts: OpsAlert[] }>('/admin/dashboard/alerts').pipe(catchError(() => of(null)));
  }
}
