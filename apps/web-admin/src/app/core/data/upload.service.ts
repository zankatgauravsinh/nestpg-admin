import { HttpClient, HttpEvent, HttpEventType } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../api/api.service';

export interface PresignResponse {
  key: string;
  uploadUrl: string;
  expiresIn: number;
  scope: string;
}

export interface MediaItem {
  id: string;
  entityType: string;
  entityId: string;
  role: string | null;
  key: string;
  url: string | null;
  mimeType: string;
  fileSize: number;
  sortOrder: number;
  createdAt: string;
}

export type UploadProgress =
  | { type: 'progress'; pct: number }
  | { type: 'done' };

/**
 * Direct-to-storage upload pipeline:
 *   presign → PUT (browser → S3/MinIO, with progress) → confirm.
 * The presigned URL is absolute (MinIO/S3), so the auth interceptor (scoped to
 * the /api base) does not attach a bearer to the PUT.
 */
@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);

  presign(scope: string, entityId: string, file: File): Observable<PresignResponse> {
    return this.api.post<PresignResponse>('/uploads/presign', {
      scope,
      entityId,
      contentType: file.type,
      sizeBytes: file.size,
    });
  }

  /** Raw PUT to the presigned URL; emits upload progress then completion. */
  putToStorage(uploadUrl: string, file: File): Observable<UploadProgress> {
    return this.http
      .put(uploadUrl, file, {
        headers: { 'Content-Type': file.type },
        reportProgress: true,
        observe: 'events',
      })
      .pipe(
        map((e: HttpEvent<unknown>): UploadProgress => {
          if (e.type === HttpEventType.UploadProgress) {
            const pct = e.total ? Math.round((e.loaded / e.total) * 100) : 0;
            return { type: 'progress', pct };
          }
          return { type: 'done' };
        }),
      );
  }

  confirm(entityType: string, entityId: string, key: string, role?: string, sortOrder?: number): Observable<MediaItem> {
    return this.api.post<MediaItem>('/uploads/confirm', { entityType, entityId, key, role, sortOrder });
  }

  /** Short-lived presigned GET for private objects (KYC etc.). */
  presignGet(key: string): Observable<{ url: string; expiresIn: number }> {
    return this.api.post<{ url: string; expiresIn: number }>('/uploads/presign-get', { key });
  }

  list(entityType: string, entityId: string): Observable<MediaItem[]> {
    return this.api.get<MediaItem[]>('/media', { entityType, entityId });
  }

  remove(id: string): Observable<{ deleted: boolean }> {
    return this.api.delete<{ deleted: boolean }>(`/media/${id}`);
  }
}
