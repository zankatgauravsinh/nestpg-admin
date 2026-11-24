import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, catchError, expand, forkJoin, map, of, reduce } from 'rxjs';
import { ApiService } from '../api/api.service';
import { ApiResponse } from '../api/api.types';
import { Property, PropertyType } from './models';

/** One row of the Admin review queue — `GET /admin/properties` (A2). */
export interface ReviewQueueRow {
  id: string;
  name: string;
  propertyType: string;
  status: string;
  city: string;
  areaLocality: string;
  addressLine1: string;
  state: string;
  pincode: string;
  createdAt: string;
  updatedAt: string;
  verifiedAt: string | null;
  rejectionReason: string | null;
  owner: { id: string; phone: string | null; status: string | null };
  stats: RawBedStats;
  minPricePaisa: number;
  maxPricePaisa: number;
  /** Cover from the `media` table — the source the server-side readiness rule counts. */
  coverImageUrl: string | null;
  photoCount: number;
  /** `hasDailyPrices`: every live bed has a daily rate (server rule BED_WITHOUT_DAILY_PRICE). */
  readiness: { hasBeds: boolean; hasPhotos: boolean; hasDailyPrices: boolean; ready: boolean };
}

export interface ReviewQueueQuery {
  status?: string;
  city?: string;
  ownerId?: string;
  page?: number;
  limit?: number;
  sort?: 'oldest' | 'newest';
}

/** Raw property as returned by the NestPG backend. */
export interface RawBedStats {
  totalBeds: number;
  occupiedBeds: number;
  reservedBeds: number;
  availableBeds: number;
  maintenanceBeds: number;
  occupancyRate: number;
  /** Live beds with no daily rate (admin / owner reads only). */
  bedsWithoutDailyPrice?: number;
}

export interface RawProperty {
  id: string;
  name: string;
  propertyType?: string;
  status?: string;
  city?: string;
  state?: string;
  addressLine1?: string;
  addressLine2?: string;
  areaLocality?: string;
  pincode?: string;
  description?: string | null;
  securityDepositPaisa?: number;
  noticePeriodDays?: number;
  foodIncluded?: boolean;
  foodDescription?: string | null;
  totalBeds?: number;
  availableBeds?: number;
  minPricePaisa?: number;
  maxPricePaisa?: number;
  ownerId?: string;
  coverImageUrl?: string | null;
  houseRules?: string[];
  verifiedAt?: string | null;
  rejectionReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
  amenities?: { id: string; key?: string; label?: string }[];
  /**
   * Photos from the `media` table — the source the server-side submission rule
   * counts. The legacy `coverImageUrl` / `mediaUrls` columns above satisfy no
   * rule and must not be presented as proof a listing has photos.
   */
  media?: { coverImageUrl: string | null; coverImageKey: string | null; gallery: { id: string; key: string; url: string | null }[] };
  /** Live bed statistics from the backend (source of truth). */
  stats?: RawBedStats;
}

const TYPE_MAP: Record<string, PropertyType> = {
  COLIVING: 'CO_LIVING',
  CO_LIVING: 'CO_LIVING',
  PG: 'PG',
  HOSTEL: 'HOSTEL',
  RENTAL: 'RENTAL',
  APARTMENT: 'RENTAL',
};

@Injectable({ providedIn: 'root' })
export class PropertiesService {
  private readonly api = inject(ApiService);

  /** Normalizes the backend property into the view model used across screens. */
  private adapt(r: RawProperty): Property {
    // Prefer the backend's live bed stats (source of truth, reconciles with the
    // dashboard occupancy endpoint). Fall back to the legacy counter columns.
    const s = r.stats;
    const total = s?.totalBeds ?? r.totalBeds ?? 0;
    const available = s?.availableBeds ?? r.availableBeds ?? 0;
    const occupied = s?.occupiedBeds ?? Math.max(0, total - available);
    const rent = r.maxPricePaisa ?? r.minPricePaisa ?? 0;
    const addr = [r.addressLine1, r.areaLocality].filter(Boolean).join(', ');
    return {
      id: r.id,
      name: r.name,
      type: TYPE_MAP[(r.propertyType ?? '').toUpperCase()] ?? 'PG',
      city: r.city ?? '—',
      address: addr || '—',
      status: r.status ?? 'ACTIVE',
      coverImageUrl: r.coverImageUrl ?? null,
      totalBeds: total,
      occupiedBeds: occupied,
      reservedBeds: s?.reservedBeds ?? 0,
      availableBeds: available,
      maintenanceBeds: s?.maintenanceBeds ?? 0,
      occupancyRate: s?.occupancyRate ?? (total ? Math.round((occupied / total) * 10000) / 100 : 0),
      // No revenue field on the entity — derive monthly run-rate from occupied beds × rent.
      monthlyRevenuePaise: occupied * rent,
      manager: '—',
      rating: 0,
    };
  }

  /** Page size per request when walking a paginated list endpoint to completion. */
  private static readonly PAGE_SIZE = 50;

  // Both list endpoints paginate server-side (default limit 20). Calling them
  // without pagination silently truncated the portfolio (QA: "property list not
  // showing expected data"); a hardcoded high limit is still an arbitrary cap.
  // Instead we walk every page (page → page+1 while page*limit < total) and
  // accumulate all rows, so the portfolio and its aggregate chips see the full
  // set no matter how many properties exist.
  private allPages(path: string): Observable<RawProperty[]> {
    const fetchPage = (page: number) =>
      this.api.getPaged<RawProperty[]>(path, { page, limit: PropertiesService.PAGE_SIZE });
    return fetchPage(1).pipe(
      expand((res) => {
        const page = res.meta?.page ?? 1;
        const limit = res.meta?.limit ?? PropertiesService.PAGE_SIZE;
        const total = res.meta?.total ?? 0;
        return page * limit < total ? fetchPage(page + 1) : EMPTY;
      }),
      reduce((acc, res) => acc.concat(res.data ?? []), [] as RawProperty[]),
      catchError(() => of([] as RawProperty[])),
    );
  }

  list(): Observable<Property[]> {
    return this.allPages('/properties').pipe(map((rows) => rows.map((r) => this.adapt(r))));
  }
  mine(): Observable<Property[]> {
    return this.allPages('/properties/my').pipe(map((rows) => rows.map((r) => this.adapt(r))));
  }

  /**
   * Operator portfolio view: the public ACTIVE list merged with the caller's
   * own properties (any status — DRAFT/PENDING included), de-duplicated by id.
   * This is why a just-created DRAFT property still shows up.
   */
  portfolio(): Observable<Property[]> {
    return forkJoin([this.list(), this.mine()]).pipe(
      map(([active, own]) => {
        const byId = new Map<string, Property>();
        for (const p of active) byId.set(p.id, p);
        for (const p of own) byId.set(p.id, p); // own wins (fresher / includes status)
        return [...byId.values()];
      }),
      catchError(() => of([])),
    );
  }
  get(id: string): Observable<Property | null> {
    return this.api.get<RawProperty>(`/properties/${id}`).pipe(
      map((r) => (r ? this.adapt(r) : null)),
      catchError(() => of(null)),
    );
  }

  /** Raw (un-adapted) property — needed to prefill the edit form. */
  raw(id: string): Observable<RawProperty | null> {
    return this.api.get<RawProperty>(`/properties/${id}`).pipe(catchError(() => of(null)));
  }

  create(dto: CreatePropertyPayload): Observable<RawProperty> {
    return this.api.post<RawProperty>('/properties', dto);
  }

  /** Edit a property. */
  update(id: string, dto: Partial<CreatePropertyPayload>): Observable<RawProperty> {
    return this.api.put<RawProperty>(`/properties/${id}`, dto);
  }

  /** DRAFT → PENDING_REVIEW (owner submits for approval). */
  submit(id: string): Observable<unknown> {
    return this.api.post(`/properties/${id}/submit`, {});
  }

  /** PENDING_REVIEW → ACTIVE (ops/admin approves). */
  verify(id: string): Observable<unknown> {
    return this.api.put(`/properties/${id}/verify`, {});
  }

  /** Reject a property with a reason. */
  reject(id: string, reason: string): Observable<unknown> {
    return this.api.put(`/properties/${id}/reject`, { reason });
  }

  /**
   * Admin property review queue (A2).
   *
   * Deliberately NOT wrapped in `catchError(() => of([]))` like `portfolio()`:
   * a reviewer must be able to tell "nothing is waiting" from "the queue could
   * not be loaded". The error reaches the component, which renders a retry.
   */
  reviewQueue(q: ReviewQueueQuery = {}): Observable<ApiResponse<ReviewQueueRow[]>> {
    return this.api.getPaged<ReviewQueueRow[]>('/admin/properties', {
      status: q.status ?? 'PENDING_REVIEW',
      city: q.city,
      ownerId: q.ownerId,
      page: q.page ?? 1,
      limit: q.limit ?? 20,
      sort: q.sort ?? 'oldest',
    });
  }

  /**
   * One owner's portfolio (A4) — the same `/admin/properties` contract the
   * review queue uses, filtered by owner and status. No second listing API.
   */
  ownerPortfolio(ownerId: string, status?: string, page = 1, limit = 20): Observable<ApiResponse<ReviewQueueRow[]>> {
    return this.api.getPaged<ReviewQueueRow[]>('/admin/properties', {
      ownerId, status, page, limit, sort: 'newest',
    });
  }

  /**
   * Create a property FOR an owner (A4). Distinct from `create()`, which posts
   * to the owner-self-scoped route where the backend takes the owner from the
   * caller's token — the reason an admin's "create for owner" previously
   * produced a property owned by the admin.
   */
  createForOwner(ownerId: string, dto: CreatePropertyPayload): Observable<RawProperty> {
    return this.api.post<RawProperty>('/admin/properties', { ...dto, ownerId });
  }

  /** Soft-delete / archive a property. */
  remove(id: string): Observable<unknown> {
    return this.api.delete(`/properties/${id}`);
  }
}

export interface CreatePropertyPayload {
  name: string;
  propertyType: string;
  addressLine1: string;
  areaLocality: string;
  city: string;
  state: string;
  pincode: string;
  description?: string;
}
