import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { ApiService } from '../api/api.service';

export interface ApiNotification {
  id: string; type: string; category: string; title: string; body: string;
  data: Record<string, unknown>; entity_type: string | null; entity_id: string | null;
  priority: string; read_at: string | null; created_at: string;
}
export interface NotificationFeed { items: ApiNotification[]; unread: number }
export interface NotificationPreference { channel: string; category: string; enabled: boolean; muted: boolean; quiet_from: number | null; quiet_to: number | null }
export interface NotificationTemplate { id: string; key: string; category: string; channel: string; locale: string; version: number; subject: string | null; body: string; is_active: boolean }

@Injectable({ providedIn: 'root' })
export class NotificationsApiService {
  private readonly api = inject(ApiService);

  feed(unreadOnly = false, page = 1, limit = 20): Observable<NotificationFeed> {
    return this.api.get<NotificationFeed>('/notifications', { unreadOnly: unreadOnly ? 'true' : undefined, page, limit })
      .pipe(catchError(() => of({ items: [], unread: 0 })));
  }
  markRead(id: string): Observable<unknown> { return this.api.post(`/notifications/${id}/read`, {}); }
  markAllRead(): Observable<unknown> { return this.api.post('/notifications/read-all', {}); }
  preferences(): Observable<NotificationPreference[]> {
    return this.api.get<NotificationPreference[]>('/notifications/preferences').pipe(catchError(() => of([])));
  }
  setPreference(p: { channel: string; category: string; enabled?: boolean; muted?: boolean; quietFrom?: number | null; quietTo?: number | null }): Observable<unknown> {
    return this.api.put('/notifications/preferences', p);
  }
  templates(): Observable<NotificationTemplate[]> {
    return this.api.get<NotificationTemplate[]>('/notifications/templates').pipe(catchError(() => of([])));
  }
  upsertTemplate(t: { key: string; category: string; channel: string; locale?: string; version?: number; subject?: string; body: string; isActive?: boolean }): Observable<NotificationTemplate> {
    return this.api.post<NotificationTemplate>('/notifications/templates', t);
  }
  previewTemplate(subject: string | null, body: string, vars: Record<string, unknown>): Observable<{ subject: string | null; body: string }> {
    return this.api.post('/notifications/templates/preview', { subject, body, vars });
  }
}
