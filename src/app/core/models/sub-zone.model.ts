import type { ZonePolygon } from './zone.model';

/** A delivery sub-area drawn inside a single parent customer zone. */
export interface SubZone {
  id: string;
  parentZoneId: string;
  name: string;
  /** Pounds, same value as `minOrderEGP`. Templates already bind this field. */
  minOrder: number;
  /** Effective minimum in pounds: the sub-zone value, or the parent zone's when unset. */
  minOrderEGP: number;
  /** Polygon highlight color, `#rrggbb`. */
  color: string;
  isActive: boolean;
  geometry: ZonePolygon;
}

/** `GET` / `POST` / `PATCH` sub-zone body. `zoneId` is `parentZoneId` in the UI. */
export interface SubZoneApiRecord {
  id: string;
  zoneId: string;
  name: string;
  color: string;
  minOrderPiastres: number | null;
  effectiveMinOrderPiastres: number;
  isActive: boolean;
  geometry: ZonePolygon;
  createdAt: string;
  updatedAt: string;
}

export type SubZoneInput = Omit<SubZone, 'id' | 'minOrderEGP'>;
export type SubZoneBatchItem = Omit<SubZoneInput, 'parentZoneId'>;

export const DEFAULT_SUB_ZONE_COLOR = '#2563eb';

export const SUB_ZONE_COLOR_PRESETS: readonly string[] = [
  '#2563eb',
  '#1f7a4d',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#db2777',
];

export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
