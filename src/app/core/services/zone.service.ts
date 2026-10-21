import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, defer, map, of, tap } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import { GeometryInvalidError, mapGeometryError } from '../models/geometry-error';
import { SubZone, SubZoneApiRecord, SubZoneBatchItem } from '../models/sub-zone.model';
import {
  Zone,
  ZoneApiRecord,
  ZonePolygon,
  ZoneWritePayload,
  egpToPiastres,
  normalizeZonePolygon,
  piastresToEgp,
} from '../models/zone.model';
import { SubZoneService } from './sub-zone.service';

const ZONES_URL = `${API_BASE_URL}/v1/zones`;
const SUB_ZONES_URL = `${API_BASE_URL}/v1/sub-zones`;

interface SubZoneApiBody {
  name: string;
  geometry: ZonePolygon;
  color: string;
  minOrderPiastres: number;
  isActive: boolean;
}

@Injectable({ providedIn: 'root' })
export class ZoneService {
  private readonly http = inject(HttpClient);
  private readonly subZoneStore = inject(SubZoneService);
  private readonly zonesSignal = signal<Zone[]>([]);

  readonly zones = this.zonesSignal.asReadonly();

  readonly activeZones = computed(() =>
    this.zonesSignal().filter((zone) => zone.isActive),
  );

  nameOf(id: string): string {
    return this.zonesSignal().find((zone) => zone.id === id)?.name ?? '';
  }

  /** `GET /v1/zones` */
  getZones(): Observable<Zone[]> {
    return this.http.get<ZoneApiRecord[]>(ZONES_URL).pipe(
      map((rows) => rows.map(toZone)),
      tap((zones) => this.zonesSignal.set(zones)),
    );
  }

  /** Cached row, otherwise `GET /v1/zones/{id}`. */
  getZoneById(id: string): Observable<Zone> {
    const cached = this.zonesSignal().find((zone) => zone.id === id);
    if (cached) {
      return of(cached);
    }
    return this.http.get<ZoneApiRecord>(`${ZONES_URL}/${id}`).pipe(
      map(toZone),
      tap((zone) => this.upsertZone(zone)),
    );
  }

  /** `POST /v1/zones`. Minimum order is omitted until the form exposes it again. */
  createZone(payload: ZoneWritePayload): Observable<Zone> {
    return defer(() =>
      this.http.post<ZoneApiRecord>(ZONES_URL, {
        name: payload.name.trim(),
        geometry: requirePolygon(payload.geometry),
        isActive: payload.isActive,
      }),
    ).pipe(
      map(toZone),
      tap((zone) => this.upsertZone(zone)),
      catchError(mapGeometryError),
    );
  }

  /** `PATCH /v1/zones/{id}` */
  updateZone(id: string, payload: ZoneWritePayload): Observable<Zone> {
    return defer(() =>
      this.http.patch<ZoneApiRecord>(`${ZONES_URL}/${id}`, {
        name: payload.name.trim(),
        geometry: requirePolygon(payload.geometry),
        isActive: payload.isActive,
      }),
    ).pipe(
      map(toZone),
      tap((zone) => this.upsertZone(zone)),
      catchError(mapGeometryError),
    );
  }

  /** `GET /v1/sub-zones`, optionally filtered by parent zone. */
  getSubZones(zoneId?: string): Observable<SubZone[]> {
    const params = zoneId ? new HttpParams().set('zoneId', zoneId) : undefined;
    return this.http.get<SubZoneApiRecord[]>(SUB_ZONES_URL, { params }).pipe(
      map((rows) => rows.map(toSubZone)),
      tap((items) => {
        if (zoneId) {
          this.subZoneStore.mergeForParent(zoneId, items);
        } else {
          this.subZoneStore.replaceAll(items);
        }
      }),
    );
  }

  /** `POST /v1/zones/{zoneId}/sub-zones` */
  createSubZone(zoneId: string, payload: SubZoneBatchItem): Observable<SubZone> {
    return defer(() =>
      this.http.post<SubZoneApiRecord>(`${ZONES_URL}/${zoneId}/sub-zones`, toSubZoneBody(payload)),
    ).pipe(
      map(toSubZone),
      tap((created) => this.subZoneStore.upsert(created)),
      catchError(mapGeometryError),
    );
  }

  /**
   * `POST /v1/zones/{zoneId}/sub-zones/batch`.
   * One failing polygon rejects the whole batch.
   */
  createSubZones(zoneId: string, items: readonly SubZoneBatchItem[]): Observable<SubZone[]> {
    return defer(() =>
      this.http.post<SubZoneApiRecord[]>(`${ZONES_URL}/${zoneId}/sub-zones/batch`, {
        items: items.map(toSubZoneBody),
      }),
    ).pipe(
      map((rows) => rows.map(toSubZone)),
      tap((created) => this.subZoneStore.upsertMany(created)),
      catchError(mapGeometryError),
    );
  }

  /** `PATCH /v1/sub-zones/{id}` */
  updateSubZone(id: string, payload: SubZoneBatchItem): Observable<SubZone> {
    return defer(() =>
      this.http.patch<SubZoneApiRecord>(`${SUB_ZONES_URL}/${id}`, toSubZoneBody(payload)),
    ).pipe(
      map(toSubZone),
      tap((updated) => this.subZoneStore.upsert(updated)),
      catchError(mapGeometryError),
    );
  }

  /** `DELETE /v1/sub-zones/{id}` → 204. The row leaves the cache only after success. */
  deleteSubZone(id: string): Observable<void> {
    return this.http.delete<void>(`${SUB_ZONES_URL}/${id}`).pipe(
      tap(() => this.subZoneStore.removeById(id)),
      map(() => undefined),
    );
  }

  private upsertZone(zone: Zone): void {
    this.zonesSignal.update((list) => {
      const index = list.findIndex((item) => item.id === zone.id);
      if (index === -1) {
        return [...list, zone];
      }
      return list.map((item) => (item.id === zone.id ? zone : item));
    });
  }
}

function toZone(row: ZoneApiRecord): Zone {
  const minOrderEGP = piastresToEgp(row.minOrderPiastres);
  return {
    id: row.id,
    name: row.name,
    polygon: row.geometry,
    minOrder: minOrderEGP,
    minOrderEGP,
    isActive: row.isActive,
  };
}

function toSubZone(row: SubZoneApiRecord): SubZone {
  const minOrderEGP = piastresToEgp(row.effectiveMinOrderPiastres);
  return {
    id: row.id,
    parentZoneId: row.zoneId,
    name: row.name,
    minOrder: minOrderEGP,
    minOrderEGP,
    color: row.color,
    isActive: row.isActive,
    geometry: row.geometry,
  };
}

function toSubZoneBody(payload: SubZoneBatchItem): SubZoneApiBody {
  return {
    name: payload.name.trim(),
    geometry: requirePolygon(payload.geometry),
    color: payload.color.toLowerCase(),
    minOrderPiastres: egpToPiastres(payload.minOrder),
    isActive: payload.isActive,
  };
}

/** Closed GeoJSON ring in `[lng, lat]` order. Does not swap axes. */
function requirePolygon(geometry: ZonePolygon): ZonePolygon {
  const normalized = normalizeZonePolygon(geometry);
  if (!normalized) {
    throw new GeometryInvalidError('NOT_A_POLYGON');
  }
  return normalized;
}
