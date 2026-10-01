// ═══════════════════════════════════════════════════════════════════
// Geofencing — shared models & constants
// Polygon + map center live in the core Zone model. This file keeps
// the map component's local event types and the city dropdown.
// ═══════════════════════════════════════════════════════════════════

import type { ZonePolygon } from '../../../core/models/zone.model';

export type { ZonePolygon as ZoneGeometry } from '../../../core/models/zone.model';
export { CAIRO_CENTER, DEFAULT_ZOOM } from '../../../core/models/zone.model';

/**
 * Final payload emitted by the legacy geofencing screen.
 * Shape is intentionally PostGIS / GeoJSON friendly.
 */
export interface CreateZonePayload {
  name: string;
  city: string;
  /** Cart value floor. Delivery price is calculated separately. */
  minOrder: number;
  isActive: boolean;
  geometry: ZonePolygon;
}

/** Payload broadcast by the map whenever the drawn polygon changes. */
export interface PolygonChange {
  geometry: ZonePolygon;
  /** Area of the polygon in square kilometres (rounded for display). */
  areaSqKm: number;
}

export interface CityOption {
  label: string;
  value: string;
}

/** Dropdown options for the City field. */
export const CITY_OPTIONS: CityOption[] = [
  { label: 'القاهرة',      value: 'cairo' },
  { label: 'الجيزة',       value: 'giza' },
  { label: 'الإسكندرية',   value: 'alexandria' },
  { label: 'المنصورة',     value: 'mansoura' },
  { label: 'طنطا',         value: 'tanta' },
  { label: 'بورسعيد',      value: 'port_said' },
  { label: 'السويس',       value: 'suez' },
  { label: 'الإسماعيلية',  value: 'ismailia' },
];
