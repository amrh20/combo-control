import type { ZonePolygon } from './zone.model';

/** GeoJSON polygon that bounds a commercial street or dispatch hub. */
export type HubGeometry = ZonePolygon;

export interface Hub {
  id: string;
  /** Arabic street or cluster name, e.g. شارع ١٣ */
  name: string;
  geometry: HubGeometry;
  /** Sub-zone ids this hub is authorized to deliver to. */
  servingSubZoneIds: string[];
  isActive: boolean;
}

export type HubInput = Omit<Hub, 'id'>;

/** `GET` / `POST` / `PATCH /v1/hubs` body. Positions are `[lng, lat]`. */
export interface HubApiRecord {
  id: string;
  name: string;
  address: string | null;
  isActive: boolean;
  geometry: HubGeometry;
  servingSubZoneIds: string[];
  createdAt: string;
  updatedAt: string;
}
