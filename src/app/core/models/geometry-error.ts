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

/** 4xx `GEOMETRY_OVERLAP`. Carries conflicting names and optional overlap polygon. */
export class GeometryOverlapError extends Error {
  readonly conflictNames: string[];
  readonly overlap: ZonePolygon | null;

  constructor(conflictNames: string[], overlap: ZonePolygon | null = null) {
    super('GEOMETRY_OVERLAP');
    this.name = 'GeometryOverlapError';
    this.conflictNames = conflictNames;
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

export interface GeometrySaveToast {
  summary: string;
  detail: string;
}

/** Toast copy for zone / sub-zone / hub geometry save failures. */
export function geometrySaveErrorToast(error: unknown): GeometrySaveToast {
  if (error instanceof GeometryOverlapError) {
    const names = error.conflictNames.join('، ');
    return {
      summary: 'تداخل في الخريطة',
      detail: names
        ? `لا يمكن الحفظ. هذه المنطقة تتداخل مع: ${names}`
        : 'لا يمكن الحفظ. هذه المنطقة تتداخل مع منطقة أخرى.',
    };
  }

  if (error instanceof GeometryInvalidError) {
    return {
      summary: 'تعذر الحفظ',
      detail: error.message,
    };
  }

  return {
    summary: 'حدث خطأ',
    detail: 'حدث خطأ',
  };
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

  if (error.status >= 400 && error.status < 500 && code === 'GEOMETRY_OVERLAP') {
    const conflicts = Array.isArray(details?.conflicts) ? details.conflicts : [];
    const conflictNames = conflicts
      .map((conflict) => conflict.name?.trim())
      .filter((name): name is string => !!name);
    const overlap = conflicts.map((conflict) => conflict.overlap).find(isPolygon) ?? null;
    return throwError(() => new GeometryOverlapError(conflictNames, overlap));
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
