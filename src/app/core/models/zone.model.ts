/** Customer delivery area. Vendors are not assigned here. */
export interface ZonePolygon {
  type: 'Polygon';
  /** GeoJSON rings: [lng, lat]. */
  coordinates: number[][][];
}

export interface Zone {
  id: string;
  name: string;
  polygon: ZonePolygon;
  minOrder: number;
  isActive: boolean;
}

export type ZoneInput = Omit<Zone, 'id'>;

/** Payload the zone builder sends to ZoneService. Stored zones keep `polygon`. */
export interface ZoneWritePayload {
  name: string;
  minOrder: number;
  isActive: boolean;
  geometry: ZonePolygon;
}

/** Default map view — Cairo, Egypt. */
export const CAIRO_CENTER: [number, number] = [30.0444, 31.2357];
export const DEFAULT_ZOOM = 12;

/** Axis-aligned GeoJSON polygon. Arguments are west, south, east, north. */
export function rectanglePolygon(
  west: number,
  south: number,
  east: number,
  north: number,
): ZonePolygon {
  return {
    type: 'Polygon',
    coordinates: [[
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ]],
  };
}

function isPosition(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

/** Copy a ring and repeat the first vertex so it satisfies the GeoJSON spec. */
function closeRing(ring: unknown): number[][] | null {
  if (!Array.isArray(ring)) {
    return null;
  }

  const positions = ring
    .filter(isPosition)
    .map(([lng, lat]) => [lng, lat]);

  if (positions.length < 3) {
    return null;
  }

  const first = positions[0];
  const last = positions[positions.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    positions.push([first[0], first[1]]);
  }

  return positions.length >= 4 ? positions : null;
}

/**
 * Turn a drawn polygon into a plain GeoJSON Polygon.
 * Returns null when the ring is missing or too small to be a polygon.
 */
export function normalizeZonePolygon(
  value: ZonePolygon | null | undefined,
): ZonePolygon | null {
  if (!value || value.type !== 'Polygon' || !Array.isArray(value.coordinates)) {
    return null;
  }

  const outer = closeRing(value.coordinates[0]);
  if (!outer) {
    return null;
  }

  const holes = value.coordinates
    .slice(1)
    .map((ring) => closeRing(ring))
    .filter((ring): ring is number[][] => ring !== null);

  return {
    type: 'Polygon',
    coordinates: [outer, ...holes],
  };
}
