import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { ApiService } from '../api/api.service';

export interface ApiBed {
  id: string;
  label?: string;
  bedNumber?: string;
  status?: string;
  roomId?: string;
  propertyId?: string;
  pricePaisa?: number;
  occupantName?: string;
  /** Occupant ids carried by the backend Bed entity (set on check-in). */
  currentTenantId?: string | null;
  currentBookingId?: string | null;
}
export interface BoardRoom {
  id: string;
  name: string;
  roomType?: string;
  floor: number;
  floorId: string;
  buildingId: string;
  beds: ApiBed[];
  furnishing?: string;
  attachedBathroom?: boolean;
  acAvailable?: boolean;
  balcony?: boolean;
  areaSqft?: number | null;
  description?: string | null;
}
export interface BoardBuilding {
  id: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
}
export interface BoardFloor {
  id: string;
  buildingId: string;
  floorNumber: number;
  label?: string | null;
}
export interface Board {
  buildings: BoardBuilding[];
  floors: BoardFloor[];
  rooms: BoardRoom[];
}

interface RawBuilding { id: string; name?: string; description?: string | null; sortOrder?: number }
interface RawFloor { id: string; floorNumber?: number; number?: number; label?: string }
interface RawRoom {
  id: string; roomNumber?: string; number?: string; name?: string; roomType?: string;
  furnishing?: string; attachedBathroom?: boolean; acAvailable?: boolean; balcony?: boolean;
  areaSqft?: number | null; description?: string | null;
}

/** Loads the full bed-inventory board for a property (buildings→floors→rooms→beds). */
@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly api = inject(ApiService);

  board(propertyId: string): Observable<Board> {
    const empty: Board = { buildings: [], floors: [], rooms: [] };
    return this.api.get<RawBuilding[]>(`/properties/${propertyId}/buildings`).pipe(
      switchMap((buildings) => {
        if (!buildings?.length) return of(empty);
        const buildingList: BoardBuilding[] = buildings.map((b) => ({ id: b.id, name: b.name ?? 'Building', description: b.description ?? null, sortOrder: b.sortOrder ?? 0 }));
        return forkJoin(buildings.map((b) => this.roomsForBuilding(b.id))).pipe(
          map((nested) => ({
            buildings: buildingList,
            floors: nested.flatMap((n) => n.floors),
            rooms: nested.flatMap((n) => n.rooms),
          } as Board)),
        );
      }),
      catchError(() => of(empty)),
    );
  }

  private roomsForBuilding(buildingId: string): Observable<{ floors: BoardFloor[]; rooms: BoardRoom[] }> {
    return this.api.get<RawFloor[]>(`/buildings/${buildingId}/floors`).pipe(
      switchMap((floors) => {
        if (!floors?.length) return of({ floors: [] as BoardFloor[], rooms: [] as BoardRoom[] });
        const floorList: BoardFloor[] = floors.map((f, i) => ({
          id: f.id, buildingId, floorNumber: f.floorNumber ?? f.number ?? i + 1, label: f.label ?? null,
        }));
        return forkJoin(
          floors.map((f, i) => this.roomsForFloor(buildingId, f.id, f.floorNumber ?? f.number ?? i + 1)),
        ).pipe(map((nested) => ({ floors: floorList, rooms: nested.flat() })));
      }),
      catchError(() => of({ floors: [] as BoardFloor[], rooms: [] as BoardRoom[] })),
    );
  }

  private roomsForFloor(buildingId: string, floorId: string, floorNo: number): Observable<BoardRoom[]> {
    return this.api.get<RawRoom[]>(`/floors/${floorId}/rooms`).pipe(
      switchMap((rooms) => {
        if (!rooms?.length) return of([] as BoardRoom[]);
        return forkJoin(
          rooms.map((r) =>
            this.api.get<ApiBed[]>(`/rooms/${r.id}/beds`).pipe(
              catchError(() => of([] as ApiBed[])),
              map((beds) => ({
                id: r.id,
                name: r.roomNumber ?? r.number ?? r.name ?? r.id,
                roomType: r.roomType,
                floor: floorNo,
                floorId,
                buildingId,
                furnishing: r.furnishing,
                attachedBathroom: r.attachedBathroom,
                acAvailable: r.acAvailable,
                balcony: r.balcony,
                areaSqft: r.areaSqft ?? null,
                description: r.description ?? null,
                beds: [...beds].sort((a, b) => (a.label ?? a.bedNumber ?? '').localeCompare(b.label ?? b.bedNumber ?? '')),
              }) as BoardRoom),
            ),
          ),
        );
      }),
      catchError(() => of([] as BoardRoom[])),
    );
  }

  setStatus(bedId: string, status: string): Observable<unknown> {
    return this.api.put(`/beds/${bedId}/status`, { status });
  }
  /** Move a tenant/booking from one bed to another. */
  transferBed(bedId: string, targetBedId: string): Observable<unknown> {
    return this.api.post(`/beds/${bedId}/transfer`, { targetBedId });
  }

  // ── Inventory edit / delete ───────────────────────────────────────────────
  updateBuilding(id: string, dto: { name?: string; description?: string; sortOrder?: number }): Observable<unknown> { return this.api.put(`/buildings/${id}`, dto); }
  deleteBuilding(id: string): Observable<unknown> { return this.api.delete(`/buildings/${id}`); }
  updateFloor(id: string, dto: { floorNumber?: number; label?: string }): Observable<unknown> { return this.api.put(`/floors/${id}`, dto); }
  updateRoom(floorId: string, id: string, dto: Record<string, unknown>): Observable<unknown> { return this.api.put(`/floors/${floorId}/rooms/${id}`, dto); }
  deleteRoom(floorId: string, id: string): Observable<unknown> { return this.api.delete(`/floors/${floorId}/rooms/${id}`); }

  // ── Inventory creation ──────────────────────────────────────────────────
  createBuilding(propertyId: string, dto: { name: string; description?: string }): Observable<{ id: string }> {
    return this.api.post<{ id: string }>(`/properties/${propertyId}/buildings`, dto);
  }
  createFloor(buildingId: string, dto: { floorNumber: number; label?: string }): Observable<{ id: string }> {
    return this.api.post<{ id: string }>(`/buildings/${buildingId}/floors`, dto);
  }
  createRoom(floorId: string, dto: { roomNumber: string; roomType: string; furnishing: string }): Observable<{ id: string }> {
    return this.api.post<{ id: string }>(`/floors/${floorId}/rooms`, dto);
  }
  createBed(roomId: string, dto: { bedNumber: string; pricePaisa: number; label?: string }): Observable<{ id: string }> {
    return this.api.post<{ id: string }>(`/rooms/${roomId}/beds`, dto);
  }

  /** Chained quick-add: building → floor → room → N beds. Returns the new room id. */
  quickAddUnit(propertyId: string, input: {
    buildingName: string; floorNumber: number; roomNumber: string;
    roomType: string; furnishing: string; bedCount: number; pricePaisa: number;
  }): Observable<unknown> {
    return this.createBuilding(propertyId, { name: input.buildingName }).pipe(
      switchMap((b) => this.createFloor(b.id, { floorNumber: input.floorNumber, label: `Floor ${input.floorNumber}` })),
      switchMap((f) => this.createRoom(f.id, { roomNumber: input.roomNumber, roomType: input.roomType, furnishing: input.furnishing })),
      switchMap((room) => {
        const beds = Array.from({ length: Math.max(1, input.bedCount) }, (_, i) =>
          this.createBed(room.id, { bedNumber: `${input.roomNumber}-${String.fromCharCode(65 + i)}`, label: String.fromCharCode(65 + i), pricePaisa: input.pricePaisa }),
        );
        return forkJoin(beds);
      }),
    );
  }
}
