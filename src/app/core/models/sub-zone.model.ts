import type { ZonePolygon } from './zone.model';

/** A delivery sub-area drawn inside a single parent customer zone. */
export interface SubZone {
  id: string;
  parentZoneId: string;
  name: string;
  minOrder: number;
  /** Polygon highlight color, `#rrggbb`. */
  color: string;
  isActive: boolean;
  geometry: ZonePolygon;
}

export type SubZoneInput = Omit<SubZone, 'id'>;
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
