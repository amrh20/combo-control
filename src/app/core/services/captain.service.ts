import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import { ApiErrorBody } from '../models/auth.model';
import {
  Captain,
  CaptainListQuery,
  CaptainRole,
  CaptainStatus,
  CaptainVehicleType,
  CreateCaptainPayload,
  UpdateCaptainPayload,
} from '../models/captain.model';

const CAPTAINS_URL = `${API_BASE_URL}/v1/captains`;

const ROLES = new Set<CaptainRole>(['COLLECTOR', 'DELIVERY', 'BOTH']);
const STATUSES = new Set<CaptainStatus>(['ACTIVE', 'BLOCKED']);
const VEHICLE_TYPES = new Set<CaptainVehicleType>(['MOTORCYCLE', 'CAR', 'BICYCLE', 'NONE']);

interface CaptainApiRecord {
  id: string;
  phone?: string | null;
  fullName?: string | null;
  role?: string | null;
  status?: string | null;
  hubId?: string | null;
  vehicleType?: string | null;
}

interface CaptainPage {
  items?: CaptainApiRecord[];
}

@Injectable({ providedIn: 'root' })
export class CaptainService {
  private readonly http = inject(HttpClient);
  private readonly captainsSignal = signal<Captain[]>([]);

  readonly captains = this.captainsSignal.asReadonly();

  /** `GET /v1/captains` */
  getCaptains(query?: CaptainListQuery): Observable<Captain[]> {
    let params = new HttpParams();
    if (query?.role) {
      params = params.set('role', query.role);
    }
    if (query?.status) {
      params = params.set('status', query.status);
    }
    if (query?.hubId) {
      params = params.set('hubId', query.hubId);
    }

    return this.http.get<CaptainApiRecord[] | CaptainPage>(CAPTAINS_URL, { params }).pipe(
      map(unwrapCaptains),
      tap((captains) => this.captainsSignal.set(captains)),
    );
  }

  /** `GET /v1/captains/{id}` */
  getCaptain(id: string): Observable<Captain> {
    return this.http.get<CaptainApiRecord>(`${CAPTAINS_URL}/${id}`).pipe(
      map(toCaptain),
      tap((captain) => this.upsert(captain)),
    );
  }

  /** `POST /v1/captains` */
  createCaptain(payload: CreateCaptainPayload): Observable<Captain> {
    return this.http.post<CaptainApiRecord>(CAPTAINS_URL, payload).pipe(
      map(toCaptain),
      tap((captain) => this.upsert(captain)),
    );
  }

  /** `PATCH /v1/captains/{id}` */
  updateCaptain(id: string, payload: UpdateCaptainPayload): Observable<Captain> {
    return this.http.patch<CaptainApiRecord>(`${CAPTAINS_URL}/${id}`, payload).pipe(
      map(toCaptain),
      tap((captain) => this.upsert(captain)),
    );
  }

  /** `POST /v1/captains/{id}/reset-password` */
  resetPassword(id: string, password: string): Observable<void> {
    return this.http.post<void>(`${CAPTAINS_URL}/${id}/reset-password`, { password });
  }

  private upsert(captain: Captain): void {
    this.captainsSignal.update((list) => {
      const index = list.findIndex((item) => item.id === captain.id);
      if (index === -1) {
        return [captain, ...list];
      }
      return list.map((item) => (item.id === captain.id ? captain : item));
    });
  }
}

export function captainErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }

  const body = error.error as ApiErrorBody | null;
  const code = body?.error?.code;
  const message = body?.error?.message?.trim() ?? '';
  const arabic = /[\u0600-\u06FF]/.test(message) ? message : '';

  if (error.status === 409 || code === 'CONFLICT') {
    return arabic || 'رقم الهاتف مستخدم لكابتن آخر.';
  }

  if (error.status === 400) {
    if (arabic) {
      return arabic;
    }
    if (/phone/i.test(message)) {
      return 'رقم الهاتف غير صالح أو مستخدم مسبقاً.';
    }
    if (/password/i.test(message)) {
      return 'كلمة المرور غير مطابقة للشروط.';
    }
    return 'البيانات غير مقبولة. راجع الحقول وحاول مرة أخرى.';
  }

  return fallback;
}

function unwrapCaptains(body: CaptainApiRecord[] | CaptainPage): Captain[] {
  const rows = Array.isArray(body) ? body : (body.items ?? []);
  return rows.map(toCaptain);
}

function toCaptain(row: CaptainApiRecord): Captain {
  return {
    id: row.id,
    phone: row.phone?.trim() ?? '',
    fullName: row.fullName?.trim() ?? '',
    role: asRole(row.role),
    status: asStatus(row.status),
    hubId: row.hubId?.trim() ?? '',
    vehicleType: asVehicle(row.vehicleType),
  };
}

function asRole(value: string | null | undefined): CaptainRole {
  return value && ROLES.has(value as CaptainRole) ? (value as CaptainRole) : 'DELIVERY';
}

function asStatus(value: string | null | undefined): CaptainStatus {
  return value && STATUSES.has(value as CaptainStatus) ? (value as CaptainStatus) : 'ACTIVE';
}

function asVehicle(value: string | null | undefined): CaptainVehicleType {
  return value && VEHICLE_TYPES.has(value as CaptainVehicleType)
    ? (value as CaptainVehicleType)
    : 'NONE';
}
