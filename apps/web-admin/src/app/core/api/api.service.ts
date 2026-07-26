import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from './api.types';

type Params = Record<string, string | number | boolean | undefined | null>;

/** Thin typed wrapper over HttpClient that unwraps the API envelope. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBase;

  get<T>(path: string, params?: Params): Observable<T> {
    return this.http
      .get<ApiResponse<T>>(this.base + path, { params: this.toParams(params) })
      .pipe(map((r) => this.unwrap(r)));
  }

  /** Returns both data and pagination meta. */
  getPaged<T>(path: string, params?: Params): Observable<ApiResponse<T>> {
    return this.http.get<ApiResponse<T>>(this.base + path, { params: this.toParams(params) });
  }

  post<T>(path: string, body?: unknown): Observable<T> {
    return this.http.post<ApiResponse<T>>(this.base + path, body).pipe(map((r) => this.unwrap(r)));
  }

  put<T>(path: string, body?: unknown): Observable<T> {
    return this.http.put<ApiResponse<T>>(this.base + path, body).pipe(map((r) => this.unwrap(r)));
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<ApiResponse<T>>(this.base + path).pipe(map((r) => this.unwrap(r)));
  }

  private unwrap<T>(r: ApiResponse<T>): T {
    return r && typeof r === 'object' && 'data' in r ? r.data : (r as unknown as T);
  }

  private toParams(params?: Params): HttpParams {
    let hp = new HttpParams();
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') hp = hp.set(k, String(v));
      }
    }
    return hp;
  }
}
