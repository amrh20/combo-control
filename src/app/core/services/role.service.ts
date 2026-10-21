import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import {
  CreateRolePayload,
  PermissionDefinition,
  Role,
  RolePermissionsUpdate,
} from '../models/role.model';

const ROLES_URL = `${API_BASE_URL}/v1/roles`;
const PERMISSIONS_URL = `${API_BASE_URL}/v1/permissions`;

interface RoleApiError {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ path?: string; message?: string }>;
  };
}

@Injectable({ providedIn: 'root' })
export class RoleService {
  private readonly http = inject(HttpClient);

  readonly roles = signal<Role[]>([]);

  /** `GET /v1/roles` */
  getRoles(): Observable<Role[]> {
    return this.http.get<Role[]>(ROLES_URL).pipe(tap((roles) => this.roles.set(roles)));
  }

  /** `GET /v1/permissions` */
  getPermissions(): Observable<PermissionDefinition[]> {
    return this.http.get<PermissionDefinition[]>(PERMISSIONS_URL);
  }

  /** `POST /v1/roles` */
  createRole(payload: CreateRolePayload): Observable<Role> {
    return this.http.post<Role>(ROLES_URL, payload);
  }

  /** `PUT /v1/roles/{key}/permissions` */
  updateRolePermissions(key: string, permissions: string[]): Observable<RolePermissionsUpdate> {
    return this.http.put<RolePermissionsUpdate>(`${ROLES_URL}/${encodeURIComponent(key)}/permissions`, {
      permissions,
    });
  }
}

export function roleErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }
  const body = error.error as RoleApiError | null;
  const code = body?.error?.code;
  const message = body?.error?.message ?? '';
  const details = Array.isArray(body?.error?.details) ? body.error.details : [];
  if (error.status === 409 || code === 'CONFLICT') {
    return 'هذا المفتاح مستخدم لدور آخر.';
  }
  if (message.includes("don't have") || message.includes('cannot grant')) {
    return 'لا يمكنك منح صلاحيات لا تملكها.';
  }
  if (message.includes('System roles')) {
    return 'أدوار النظام لا يمكن تعديلها.';
  }
  if (code === 'NOT_FOUND') {
    return 'الدور غير موجود.';
  }
  if (code === 'VALIDATION_FAILED' || error.status === 400) {
    const paths = details.map((issue) => issue.path ?? '');
    if (paths.some((path) => path === 'key' || path.endsWith('.key'))) {
      return 'المفتاح يجب أن يكون بالأحرف الإنجليزية الكبيرة والشرطة السفلية، من 3 إلى 50 حرفاً.';
    }
    if (paths.some((path) => path === 'name' || path.endsWith('.name'))) {
      return 'اسم الدور يجب أن يكون بين حرفين و100 حرف.';
    }
    if (paths.some((path) => path.startsWith('permissions'))) {
      return 'إحدى الصلاحيات المحددة غير معروفة.';
    }
    return 'تحقق من البيانات ثم أعد المحاولة.';
  }
  return fallback;
}
