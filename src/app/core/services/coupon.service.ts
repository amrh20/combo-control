import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import { ApiErrorBody } from '../models/auth.model';
import { Coupon, CouponApiRecord, CouponInput } from '../models/coupon.model';

const COUPONS_URL = `${API_BASE_URL}/v1/coupons`;

@Injectable({ providedIn: 'root' })
export class CouponService {
  private readonly http = inject(HttpClient);
  private readonly couponsSignal = signal<Coupon[]>([]);

  readonly coupons = this.couponsSignal.asReadonly();

  /** `GET /v1/coupons` */
  getCoupons(): Observable<Coupon[]> {
    return this.http.get<unknown>(COUPONS_URL).pipe(
      map((body) => normalizeList(body).map(toCoupon).filter((coupon) => coupon.id.length > 0)),
      tap((coupons) => this.couponsSignal.set(coupons)),
    );
  }

  /** `GET /v1/coupons/{id}` */
  getCoupon(id: string): Observable<Coupon> {
    return this.http.get<CouponApiRecord>(`${COUPONS_URL}/${encodeURIComponent(id)}`).pipe(
      map(toCoupon),
      tap((coupon) => this.upsert(coupon)),
    );
  }

  /** `POST /v1/coupons` */
  createCoupon(data: CouponInput): Observable<Coupon> {
    return this.http.post<CouponApiRecord>(COUPONS_URL, toCouponBody(data)).pipe(
      map(toCoupon),
      tap((coupon) => this.upsert(coupon)),
    );
  }

  /** `PATCH /v1/coupons/{id}` */
  updateCoupon(id: string, data: CouponInput): Observable<Coupon> {
    return this.http
      .patch<CouponApiRecord>(`${COUPONS_URL}/${encodeURIComponent(id)}`, toCouponBody(data))
      .pipe(
        map(toCoupon),
        tap((coupon) => this.upsert(coupon)),
      );
  }

  /** `PATCH /v1/coupons/{id}` with `{ isActive }` for the list toggle. */
  setCouponActive(id: string, isActive: boolean): Observable<Coupon> {
    return this.http
      .patch<CouponApiRecord>(`${COUPONS_URL}/${encodeURIComponent(id)}`, { isActive })
      .pipe(
        map(toCoupon),
        tap((coupon) => this.upsert(coupon)),
      );
  }

  /** `DELETE /v1/coupons/{id}` */
  deleteCoupon(id: string): Observable<void> {
    return this.http.delete<void>(`${COUPONS_URL}/${encodeURIComponent(id)}`).pipe(
      tap(() => {
        this.couponsSignal.update((list) => list.filter((coupon) => coupon.id !== id));
      }),
    );
  }

  private upsert(coupon: Coupon): void {
    if (!coupon.id) {
      return;
    }
    this.couponsSignal.update((list) => {
      const index = list.findIndex((item) => item.id === coupon.id);
      if (index === -1) {
        return [coupon, ...list];
      }
      return list.map((item) => (item.id === coupon.id ? coupon : item));
    });
  }
}

export function couponErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }

  const body = error.error as ApiErrorBody | null;
  const message = body?.error?.message?.trim() ?? '';
  if (/[\u0600-\u06FF]/.test(message)) {
    return message;
  }
  if (error.status === 409 || body?.error?.code === 'CONFLICT') {
    return 'هذا الكود مستخدم لكوبون آخر.';
  }
  if (error.status === 404) {
    return 'الكوبون غير موجود.';
  }
  if (error.status === 400) {
    return 'راجع بيانات الكوبون ثم حاول مرة أخرى.';
  }
  return fallback;
}

function normalizeList(body: unknown): CouponApiRecord[] {
  if (Array.isArray(body)) {
    return body as CouponApiRecord[];
  }
  if (body && typeof body === 'object' && 'items' in body && Array.isArray(body.items)) {
    return body.items as CouponApiRecord[];
  }
  return [];
}

function toCoupon(row: CouponApiRecord | null | undefined): Coupon {
  const source = row ?? {};
  return {
    id: text(source.id),
    code: text(source.code).toUpperCase(),
    discountPercent: numberValue(
      source.discountPercent ?? source.discount_percent ?? source.discountPercentage,
    ),
    maxDiscountAmount: numberValue(source.maxDiscountAmount ?? source.max_discount_amount),
    minOrderValue: numberValue(source.minOrderValue ?? source.min_order_value),
    expiresAt: dateOnly(source.expiresAt ?? source.expires_at ?? source.expiryDate ?? source.expiry_date),
    usageLimit: numberValue(source.usageLimit ?? source.usage_limit),
    usedCount: numberValue(source.usedCount ?? source.used_count ?? source.timesUsed),
    isActive: booleanValue(source.isActive ?? source.is_active, true),
  };
}

function toCouponBody(data: CouponInput): CouponInput {
  return {
    code: data.code.trim().toUpperCase(),
    discountPercent: Number(data.discountPercent),
    maxDiscountAmount: Number(data.maxDiscountAmount),
    minOrderValue: Number(data.minOrderValue),
    expiresAt: dateOnly(data.expiresAt) || null,
    usageLimit: Number(data.usageLimit),
    isActive: data.isActive,
  };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 1 || value === '1' || value === 'true') {
    return true;
  }
  if (value === 0 || value === '0' || value === 'false') {
    return false;
  }
  return fallback;
}

function dateOnly(value: unknown): string {
  const match = text(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? '';
}
