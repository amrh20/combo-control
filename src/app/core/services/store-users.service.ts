import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, throwError } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import {
  CreateStoreUserPayload,
  StoreUser,
  StoreUserRole,
  StoreUserStatus,
  UpdateStoreUserPayload,
} from '../models/store-user.model';

@Injectable({ providedIn: 'root' })
export class StoreUsersService {
  private readonly http = inject(HttpClient);

  /** `GET /v1/ops/stores/{storeId}/users` */
  listUsers(storeId: string): Observable<StoreUser[]> {
    return this.http.get<unknown>(storeUsersUrl(storeId)).pipe(
      map((body) => unwrapUsers(body).map(toStoreUser)),
    );
  }

  /** `POST /v1/ops/stores/{storeId}/users` */
  createUser(storeId: string, payload: CreateStoreUserPayload): Observable<StoreUser> {
    const username = normalizeUsername(payload.username);
    const role = asRole(payload.role);
    if (!username) {
      return throwError(() => new StoreUserRequestError('INVALID_USERNAME'));
    }
    if (!role) {
      return throwError(() => new StoreUserRequestError('INVALID_ROLE'));
    }
    return this.http
      .post<unknown>(storeUsersUrl(storeId), {
        fullName: payload.fullName.trim(),
        username,
        password: payload.password,
        role,
        ...(payload.isActive === undefined ? {} : { isActive: payload.isActive }),
      })
      .pipe(map(toStoreUser));
  }

  /** `PATCH /v1/ops/stores/{storeId}/users/{userId}`. Omit `password` to keep the current one. */
  updateUser(
    storeId: string,
    userId: string,
    payload: UpdateStoreUserPayload,
  ): Observable<StoreUser> {
    const username = normalizeUsername(payload.username);
    const role = asRole(payload.role);
    if (!username) {
      return throwError(() => new StoreUserRequestError('INVALID_USERNAME'));
    }
    if (!role) {
      return throwError(() => new StoreUserRequestError('INVALID_ROLE'));
    }
    const body: Record<string, unknown> = {
      fullName: payload.fullName.trim(),
      username,
      role,
    };
    const password = payload.password?.trim() ?? '';
    if (password) {
      body['password'] = password;
    }
    if (payload.isActive !== undefined) {
      body['isActive'] = payload.isActive;
    }
    return this.http
      .patch<unknown>(storeUserUrl(storeId, userId), body)
      .pipe(map(toStoreUser));
  }

  /** Suspend or restore via `PATCH` `{ isActive }`. */
  updateStatus(storeId: string, userId: string, status: StoreUserStatus): Observable<StoreUser> {
    return this.http
      .patch<unknown>(storeUserUrl(storeId, userId), { isActive: status === 'ACTIVE' })
      .pipe(map(toStoreUser));
  }

  /** `DELETE /v1/ops/stores/{storeId}/users/{userId}` */
  deleteUser(storeId: string, userId: string): Observable<void> {
    return this.http.delete<void>(storeUserUrl(storeId, userId));
  }
}

export function storeUserErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof StoreUserRequestError && error.code === 'INVALID_USERNAME') {
    return 'اسم المستخدم: حروف إنجليزية وأرقام فقط، من 3 إلى 32، بدون مسافات.';
  }
  if (error instanceof StoreUserRequestError && error.code === 'INVALID_ROLE') {
    return 'الدور يجب أن يكون مدير أو كاشير.';
  }
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }
  if (error.status === 400) {
    const details = (error.error as { error?: { details?: { path?: string }[] } } | null)?.error
      ?.details;
    const paths = Array.isArray(details) ? details.map((item) => item?.path) : [];
    if (paths.includes('password')) {
      return 'كلمة المرور يجب أن تكون 8 أحرف على الأقل، وفيها حرف ورقم.';
    }
    return 'تحقق من الاسم واسم المستخدم وكلمة المرور ثم أعد المحاولة.';
  }
  if (error.status === 409) {
    const field = (error.error as { error?: { details?: { field?: string } } } | null)?.error
      ?.details?.field;
    if (field === 'phone') {
      return 'رقم الهاتف مستخدم لحساب آخر في هذا المتجر.';
    }
    return 'اسم المستخدم مسجل مسبقاً، برجاء اختيار اسم آخر';
  }
  if (error.status === 403) {
    return 'لا يمكن تنفيذ العملية. المتجر خارج نطاق الفرع أو الصلاحية غير كافية.';
  }
  if (error.status === 404) {
    return 'الحساب أو المتجر غير موجود.';
  }
  return fallback;
}

/** `GET` / `POST /v1/ops/stores/{storeId}/users` */
export function storeUsersUrl(storeId: string): string {
  return `${API_BASE_URL}/v1/ops/stores/${encodeURIComponent(storeId)}/users`;
}

function storeUserUrl(storeId: string, userId: string): string {
  return `${storeUsersUrl(storeId)}/${encodeURIComponent(userId)}`;
}

const USERNAME_PATTERN = /^[A-Za-z0-9]{3,32}$/;

function normalizeUsername(raw: string): string | null {
  const username = raw.trim().toLowerCase();
  return USERNAME_PATTERN.test(username) ? username : null;
}

type StoreUserClientCode = 'INVALID_USERNAME' | 'INVALID_ROLE';

class StoreUserRequestError extends Error {
  constructor(readonly code: StoreUserClientCode) {
    super(code);
  }
}

function asRole(role: string): StoreUserRole | null {
  return role === 'MANAGER' || role === 'CASHIER' ? role : null;
}

function unwrapUsers(body: unknown): unknown[] {
  if (Array.isArray(body)) {
    return body;
  }
  if (body !== null && typeof body === 'object' && Array.isArray((body as { items?: unknown }).items)) {
    return (body as { items: unknown[] }).items;
  }
  return [];
}

function toStoreUser(value: unknown): StoreUser {
  const row = value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const role = row['role'] === 'MANAGER' ? 'MANAGER' : 'CASHIER';
  const isActive = row['isActive'] !== false && row['status'] !== 'SUSPENDED';
  return {
    id: String(row['id'] ?? ''),
    storeId: String(row['storeId'] ?? ''),
    fullName: String(row['fullName'] ?? ''),
    username: String(row['username'] ?? ''),
    role,
    status: isActive ? 'ACTIVE' : 'SUSPENDED',
  };
}
