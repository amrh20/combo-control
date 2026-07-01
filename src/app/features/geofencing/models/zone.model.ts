// ═══════════════════════════════════════════════════════════════════
// Geofencing — shared models & constants
// ═══════════════════════════════════════════════════════════════════

/**
 * Final payload emitted by the "Save Zone" button.
 * Shape is intentionally PostGIS / GeoJSON friendly so the Node.js
 * backend can pipe `geometry` straight into a `geometry(Polygon, 4326)`
 * column (e.g. via `ST_GeomFromGeoJSON`).
 */
export interface CreateZonePayload {
  name: string;
  city: string;
  deliveryFee: number;
  minimumOrder: number;
  isActive: boolean;
  geometry: {
    type: 'Polygon';
    coordinates: number[][][]; // Standard GeoJSON [lng, lat] format
  };
}

/** Just the geometry slice, kept separate so the map component can emit
 *  it independently of the form fields. */
export interface ZoneGeometry {
  type: 'Polygon';
  coordinates: number[][][];
}

/** Payload broadcast by the map whenever the drawn polygon changes. */
export interface PolygonChange {
  geometry: ZoneGeometry;
  /** Area of the polygon in square kilometres (rounded for display). */
  areaSqKm: number;
}

export interface CityOption {
  label: string;
  value: string;
}

/** Dropdown options for the City field. */
export const CITY_OPTIONS: CityOption[] = [
  { label: 'Cairo',        value: 'cairo' },
  { label: 'Giza',         value: 'giza' },
  { label: 'Alexandria',   value: 'alexandria' },
  { label: 'Mansoura',     value: 'mansoura' },
  { label: 'Tanta',        value: 'tanta' },
  { label: 'Port Said',    value: 'port_said' },
  { label: 'Suez',         value: 'suez' },
  { label: 'Ismailia',     value: 'ismailia' },
];

/** Default map view — Cairo, Egypt. */
export const CAIRO_CENTER: [number, number] = [30.0444, 31.2357];
export const DEFAULT_ZOOM = 12;
