import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { EMPTY, Observable, expand, map, reduce, tap } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import { ApiErrorBody } from '../models/auth.model';
import {
  CreateStaffPayload,
  ScopeHub,
  Staff,
  StaffPage,
  StaffScope,
  StaffStatus,
} from '../models/staff.model';

const STAFF_URL = `${API_BASE_URL}/v1/staff`;

@Injectable({ providedIn: 'root' })
export class StaffService {
  private readonly http = inject(HttpClient);

  readonly staff = signal<Staff[]>([]);
  readonly scopeHubs = signal<ScopeHub[]>([]);

  /** `GET /v1/staff` */
  getStaff(cursor?: string, limit = 100): Observable<StaffPage> {
    let params = new HttpParams().set('limit', String(limit));
    if (cursor) {
      params = params.set('cursor', cursor);
    }
    return this.http.get<StaffPage>(STAFF_URL, { params });
  }

  /** Follows the cursor until every staff page is loaded. */
  loadStaff(): Observable<Staff[]> {
    return this.getStaff().pipe(
      expand((page) => (page.nextCursor ? this.getStaff(page.nextCursor) : EMPTY)),
      reduce((all, page) => [...all, ...page.items], [] as Staff[]),
      tap((items) => this.staff.set(items)),
    );
  }

  /** `POST /v1/staff` */
  createStaff(payload: CreateStaffPayload): Observable<Staff> {
    return this.http.post<Staff>(STAFF_URL, payload).pipe(tap((created) => this.upsert(created)));
  }

  /** `PUT /v1/staff/{id}/roles` */
  updateStaffRoles(id: string, roleKeys: string[]): Observable<Staff> {
    return this.http
      .put<Staff>(`${STAFF_URL}/${id}/roles`, { roleKeys })
      .pipe(tap((updated) => this.upsert(updated)));
  }

  /** `PUT /v1/staff/{id}/scope` */
  updateStaffScope(id: string, scope: StaffScope): Observable<Staff> {
    return this.http
      .put<Staff>(`${STAFF_URL}/${id}/scope`, scope)
      .pipe(tap((updated) => this.upsert(updated)));
  }

  /** `PATCH /v1/staff/{id}/status` */
  updateStaffStatus(id: string, status: StaffStatus): Observable<Staff> {
    return this.http
      .patch<Staff>(`${STAFF_URL}/${id}/status`, { status })
      .pipe(tap((updated) => this.upsert(updated)));
  }

  /** `POST /v1/staff/{id}/mfa/reset` */
  resetMfa(id: string): Observable<Staff> {
    return this.http
      .post<Staff>(`${STAFF_URL}/${id}/mfa/reset`, {})
      .pipe(tap((updated) => this.upsert(updated)));
  }

  /** Hubs the scope picker can assign. Empty when this account cannot read hubs. */
  loadScopeHubs(): Observable<ScopeHub[]> {
    return this.http.get<ScopeHub[]>(`${API_BASE_URL}/v1/hubs`).pipe(
      map((hubs) => hubs.map((hub) => ({ id: hub.id, name: hub.name, isActive: hub.isActive }))),
      tap((hubs) => this.scopeHubs.set(hubs)),
    );
  }

  emailTaken(email: string, exceptId?: string): boolean {
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    return this.staff().some((member) => member.email === normalized && member.id !== exceptId);
  }

  hubName(id: string): string {
    return this.scopeHubs().find((hub) => hub.id === id)?.name ?? '';
  }

  private upsert(member: Staff): void {
    this.staff.update((list) => {
      const index = list.findIndex((item) => item.id === member.id);
      if (index === -1) {
        return [member, ...list];
      }
      return list.map((item) => (item.id === member.id ? member : item));
    });
  }
}

export function staffErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }
  const body = error.error as ApiErrorBody | null;
  const code = body?.error?.code;
  const message = body?.error?.message ?? '';
  if (error.status === 409 || code === 'CONFLICT') {
    return 'هذا البريد مستخدم لموظف آخر.';
  }
  if (code === 'FORBIDDEN') {
    return 'لا يمكنك منح أو سحب هذا الدور.';
  }
  if (message.includes('own status')) {
    return 'لا يمكنك تغيير حالتك.';
  }
  if (message.includes('super admin')) {
    return 'يجب أن يبقى مدير أعلى واحد نشط على الأقل.';
  }
  if (message.includes('two-step')) {
    return 'لا يمكنك إعادة ضبط التحقق بخطوتين لحسابك من هنا.';
  }
  return fallback;
}
