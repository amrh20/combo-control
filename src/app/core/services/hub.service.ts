import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, defer, map, of, tap } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import { GeometryInvalidError, mapGeometryError } from '../models/geometry-error';
import { Hub, HubApiRecord, HubInput } from '../models/hub.model';
import { ZonePolygon, normalizeZonePolygon } from '../models/zone.model';
import { SubZoneService } from './sub-zone.service';

const HUBS_URL = `${API_BASE_URL}/v1/hubs`;

@Injectable({ providedIn: 'root' })
export class HubService {
  private readonly http = inject(HttpClient);
  private readonly subZones = inject(SubZoneService);
  private readonly hubsSignal = signal<Hub[]>([]);

  readonly hubs = this.hubsSignal.asReadonly();

  readonly activeHubs = computed(() =>
    this.hubsSignal().filter((hub) => hub.isActive),
  );

  /** Reads the cache. Drivers and vendors still call this synchronously. */
  getById(id: string): Hub | null {
    return this.hubsSignal().find((hub) => hub.id === id) ?? null;
  }

  nameOf(id: string): string {
    return this.getById(id)?.name ?? '';
  }

  /** Comma-separated Arabic names of the sub-zones this hub delivers to. */
  servingAreaNames(hub: Hub): string {
    const names = hub.servingSubZoneIds
      .map((id) => this.subZones.getById(id)?.name ?? '')
      .filter((name) => name.length > 0);
    return names.length > 0 ? names.join('، ') : '—';
  }

  /** `GET /v1/hubs` */
  getHubs(): Observable<Hub[]> {
    return this.http.get<HubApiRecord[]>(HUBS_URL).pipe(
      map((rows) => rows.map(toHub)),
      tap((hubs) => this.hubsSignal.set(hubs)),
    );
  }

  /** Cached row, otherwise `GET /v1/hubs/{id}`. */
  getHubById(id: string): Observable<Hub> {
    const cached = this.getById(id);
    if (cached) {
      return of(cached);
    }
    return this.http.get<HubApiRecord>(`${HUBS_URL}/${id}`).pipe(
      map(toHub),
      tap((hub) => this.upsert(hub)),
    );
  }

  /** `POST /v1/hubs`. There is no delete; pass `isActive: false` to retire a hub. */
  createHub(payload: HubInput): Observable<Hub> {
    return this.write(() => this.http.post<HubApiRecord>(HUBS_URL, toHubBody(payload)));
  }

  /** `PATCH /v1/hubs/{id}` */
  updateHub(id: string, payload: HubInput): Observable<Hub> {
    return this.write(() => this.http.patch<HubApiRecord>(`${HUBS_URL}/${id}`, toHubBody(payload)));
  }

  private write(request: () => Observable<HubApiRecord>): Observable<Hub> {
    return defer(request).pipe(
      map(toHub),
      tap((hub) => this.upsert(hub)),
      catchError(mapGeometryError),
    );
  }

  private upsert(hub: Hub): void {
    this.hubsSignal.update((list) => {
      const index = list.findIndex((item) => item.id === hub.id);
      if (index === -1) {
        return [...list, hub];
      }
      return list.map((item) => (item.id === hub.id ? hub : item));
    });
  }
}

function toHub(row: HubApiRecord): Hub {
  return {
    id: row.id,
    name: row.name,
    geometry: row.geometry,
    servingSubZoneIds: row.servingSubZoneIds ?? [],
    isActive: row.isActive,
  };
}

function toHubBody(payload: HubInput): {
  name: string;
  address: null;
  geometry: ZonePolygon;
  servingSubZoneIds: string[];
  isActive: boolean;
} {
  return {
    name: payload.name.trim(),
    address: null,
    geometry: requirePolygon(payload.geometry),
    servingSubZoneIds: [...payload.servingSubZoneIds],
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
