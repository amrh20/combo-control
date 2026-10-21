import { HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { ApiErrorBody } from './auth.model';
import { ZonePolygon } from './zone.model';

export type GeometryProblem =
  | 'NOT_A_POLYGON'
  | 'TOO_MANY_POINTS'
  | 'OUTSIDE_EGYPT'
  | 'SELF_INTERSECTING'
  | 'OUTSIDE_PARENT_ZONE'
  | 'SUB_ZONES_OUTSIDE';

const GEOMETRY_MESSAGES: Record<GeometryProblem, string> = {
  NOT_A_POLYGON: 'الرسمة لازم تكون مضلع من 3 نقط على الأقل',
  TOO_MANY_POINTS: 'الرسمة فيها نقط أكتر من المسموح',
  OUTSIDE_EGYPT: 'في نقطة برا مصر. اتأكد إن الترتيب خط الطول ثم خط العرض',
  SELF_INTERSECTING: 'الخط بيقطع نفسه',
  OUTSIDE_PARENT_ZONE: 'المنطقة الفرعية لازم تكون جوا المنطقة الأم',
  SUB_ZONES_OUTSIDE: 'تصغير المنطقة هيطلّع مناطق فرعية براها',
};

/** 409 `GEOMETRY_OVERLAP`. `overlap` is the intersecting GeoJSON polygon. */
export class GeometryOverlapError extends Error {
  readonly overlap: ZonePolygon;

  constructor(overlap: ZonePolygon) {
    super('GEOMETRY_OVERLAP');
    this.name = 'GeometryOverlapError';
    this.overlap = overlap;
  }
}

/** 400 `GEOMETRY_INVALID`. `message` is the Arabic text for a toast. */
export class GeometryInvalidError extends Error {
  readonly reason: GeometryProblem;

  constructor(reason: GeometryProblem) {
    super(GEOMETRY_MESSAGES[reason]);
    this.name = 'GeometryInvalidError';
    this.reason = reason;
  }
}

/**
 * Turns geometry failures into `GeometryOverlapError` or `GeometryInvalidError`.
 * Every other error is rethrown unchanged.
 */
export function mapGeometryError(error: unknown): Observable<never> {
  if (error instanceof GeometryOverlapError || error instanceof GeometryInvalidError) {
    return throwError(() => error);
  }
  if (!(error instanceof HttpErrorResponse)) {
    return throwError(() => error);
  }

  const body = error.error as ApiErrorBody | null;
  const code = body?.error?.code;
  const details = body?.error?.details;

  if (error.status === 409 && code === 'GEOMETRY_OVERLAP') {
    const overlap = details?.conflicts?.[0]?.overlap;
    if (isPolygon(overlap)) {
      return throwError(() => new GeometryOverlapError(overlap));
    }
  }

  if (error.status === 400 && code === 'GEOMETRY_INVALID') {
    const reason = isGeometryProblem(details?.reason) ? details.reason : 'NOT_A_POLYGON';
    return throwError(() => new GeometryInvalidError(reason));
  }

  return throwError(() => error);
}

function isGeometryProblem(value: string | undefined): value is GeometryProblem {
  return value !== undefined && value in GEOMETRY_MESSAGES;
}

function isPolygon(value: unknown): value is ZonePolygon {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const polygon = value as ZonePolygon;
  return polygon.type === 'Polygon' && Array.isArray(polygon.coordinates);
}
