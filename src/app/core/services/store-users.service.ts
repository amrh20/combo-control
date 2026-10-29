import { Injectable } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import {
  CreateStoreUserPayload,
  StoreUser,
  StoreUserStatus,
  UpdateStoreUserPayload,
} from '../models/store-user.model';

/**
 * Store dashboard logins.
 *
 * The ops API is not live yet. These methods keep the same shape as:
 * - `GET    /v1/ops/stores/{storeId}/users`
 * - `POST   /v1/ops/stores/{storeId}/users`
 * - `PATCH  /v1/ops/stores/{storeId}/users/{userId}`
 * - `PATCH  /v1/ops/stores/{storeId}/users/{userId}/status`
 * - `DELETE /v1/ops/stores/{storeId}/users/{userId}`
 *
 * Swap each body for `HttpClient` against `storeUsersUrl` when the backend ships.
 */
@Injectable({ providedIn: 'root' })
export class StoreUsersService {
  private readonly usersByStore = new Map<string, StoreUser[]>();

  private rows(storeId: string): StoreUser[] {
    const existing = this.usersByStore.get(storeId);
    if (existing) {
      return existing;
    }
    const created: StoreUser[] = [];
    this.usersByStore.set(storeId, created);
    return created;
  }

  listUsers(storeId: string): Observable<StoreUser[]> {
    return of(this.rows(storeId).map(cloneUser)).pipe(delay(180));
  }

  createUser(storeId: string, payload: CreateStoreUserPayload): Observable<StoreUser> {
    const phone = payload.phone.trim();
    if (this.rows(storeId).some((user) => user.phone === phone)) {
      return fail('PHONE_TAKEN');
    }

    const created: StoreUser = {
      id: crypto.randomUUID(),
      storeId,
      fullName: payload.fullName.trim(),
      phone,
      role: payload.role,
      status: 'ACTIVE',
    };
    this.rows(storeId).unshift(created);
    return of(cloneUser(created)).pipe(delay(180));
  }

  updateUser(
    storeId: string,
    userId: string,
    payload: UpdateStoreUserPayload,
  ): Observable<StoreUser> {
    const rows = this.rows(storeId);
    const current = rows.find((user) => user.id === userId);
    if (!current) {
      return fail('NOT_FOUND');
    }

    const phone = payload.phone.trim();
    if (rows.some((user) => user.id !== userId && user.phone === phone)) {
      return fail('PHONE_TAKEN');
    }

    current.fullName = payload.fullName.trim();
    current.phone = phone;
    current.role = payload.role;
    return of(cloneUser(current)).pipe(delay(180));
  }

  updateStatus(storeId: string, userId: string, status: StoreUserStatus): Observable<StoreUser> {
    const current = this.rows(storeId).find((user) => user.id === userId);
    if (!current) {
      return fail('NOT_FOUND');
    }
    current.status = status;
    return of(cloneUser(current)).pipe(delay(120));
  }

  deleteUser(storeId: string, userId: string): Observable<void> {
    const rows = this.rows(storeId);
    const index = rows.findIndex((user) => user.id === userId);
    if (index === -1) {
      return fail('NOT_FOUND');
    }
    rows.splice(index, 1);
    return of(undefined).pipe(delay(120));
  }
}

export type StoreUserErrorCode = 'PHONE_TAKEN' | 'NOT_FOUND';

export class StoreUserRequestError extends Error {
  constructor(readonly code: StoreUserErrorCode) {
    super(code);
  }
}

export function storeUserErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof StoreUserRequestError && error.code === 'PHONE_TAKEN') {
    return 'رقم الهاتف مستخدم لحساب آخر في هذا المتجر.';
  }
  if (error instanceof StoreUserRequestError && error.code === 'NOT_FOUND') {
    return 'الحساب غير موجود.';
  }
  return fallback;
}

/** `GET` / `POST /v1/ops/stores/{storeId}/users` */
export function storeUsersUrl(storeId: string): string {
  return `${API_BASE_URL}/v1/ops/stores/${encodeURIComponent(storeId)}/users`;
}

function fail(code: StoreUserErrorCode): Observable<never> {
  return throwError(() => new StoreUserRequestError(code));
}

function cloneUser(user: StoreUser): StoreUser {
  return { ...user };
}
