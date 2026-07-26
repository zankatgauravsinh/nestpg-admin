import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { ApiService } from '../api/api.service';

@Injectable({ providedIn: 'root' })
export class OpsService {
  private readonly api = inject(ApiService);
  private g<T>(path: string, fallback: T): Observable<T> {
    return this.api.get<T>(path).pipe(catchError(() => of(fallback)));
  }
  metrics() { return this.g<Record<string, unknown>>('/admin/ops/metrics', {}); }
  alerts() { return this.g<unknown[]>('/admin/ops/alerts', []); }
  jobs() { return this.g<unknown[]>('/admin/ops/jobs', []); }
  outbox() { return this.g<Record<string, unknown>>('/admin/ops/outbox', {}); }
  outboxAnalytics() { return this.g<Record<string, unknown>>('/admin/ops/outbox/analytics', {}); }
  failedEvents(limit = 20) { return this.g<unknown[]>(`/admin/ops/outbox/failed?limit=${limit}`, []); }
  capacity() { return this.g<Record<string, unknown>>('/admin/ops/capacity', {}); }
  audit(params: { entityType?: string; action?: string; limit?: number } = {}) {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]),
    ).toString();
    return this.g<unknown[]>(`/admin/ops/audit${q ? '?' + q : ''}`, []);
  }
  requeueAll(): Observable<unknown> { return this.api.post('/admin/ops/outbox/requeue-all', {}); }
  requeueOne(id: string): Observable<unknown> { return this.api.post(`/admin/ops/outbox/requeue/${id}`, {}); }
}
