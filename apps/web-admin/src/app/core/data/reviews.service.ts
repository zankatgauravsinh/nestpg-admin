import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import { ApiService } from '../api/api.service';

export interface ApiReview {
  id: string; subject_type: string; subject_id: string; author_user_id: string; booking_id: string | null;
  rating: number; aspects: Record<string, number>; title: string | null; body: string | null;
  status: string; flag_count: number; created_at: string;
  author_name?: string;
}
export interface ReviewAggregate {
  subject_type: string; subject_id: string; avg_rating: number | string; review_count: number;
  dist: Record<string, number>; aspects: Record<string, number>;
}

@Injectable({ providedIn: 'root' })
export class ReviewsService {
  private readonly api = inject(ApiService);

  /** Approved reviews for a subject (+ aggregate). Public. */
  bySubject(subjectType: string, subjectId: string, page = 1, limit = 20): Observable<{ items: ApiReview[]; aggregate: ReviewAggregate }> {
    return this.api.get<{ items: ApiReview[]; aggregate: ReviewAggregate }>('/reviews', { subjectType, subjectId, page, limit })
      .pipe(catchError(() => of({ items: [], aggregate: { subject_type: subjectType, subject_id: subjectId, avg_rating: 0, review_count: 0, dist: {}, aspects: {} } })));
  }
  aggregate(subjectType: string, subjectId: string): Observable<ReviewAggregate> {
    return this.api.get<ReviewAggregate>('/reviews/aggregate', { subjectType, subjectId })
      .pipe(catchError(() => of({ subject_type: subjectType, subject_id: subjectId, avg_rating: 0, review_count: 0, dist: {}, aspects: {} })));
  }
  top(subjectType: string, limit = 10): Observable<(ReviewAggregate & { name?: string })[]> {
    return this.api.get<(ReviewAggregate & { name?: string })[]>('/reviews/top', { subjectType, limit }).pipe(catchError(() => of([])));
  }
  queue(page = 1, limit = 20): Observable<ApiReview[]> {
    return this.api.get<ApiReview[]>('/reviews/queue', { page, limit }).pipe(catchError(() => of([])));
  }
  get(id: string): Observable<ApiReview | null> {
    return this.api.get<ApiReview>(`/reviews/${id}`).pipe(catchError(() => of(null)));
  }
  flag(id: string): Observable<unknown> { return this.api.post(`/reviews/${id}/flag`, {}); }
  moderate(id: string, decision: 'APPROVE' | 'REJECT' | 'HIDE', reason?: string): Observable<ApiReview> {
    return this.api.post<ApiReview>(`/reviews/${id}/moderate`, { decision, reason });
  }
}
