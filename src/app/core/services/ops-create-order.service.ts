import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, catchError, expand, map, of, reduce, throwError } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import { ApiErrorBody } from '../models/auth.model';
import {
  CartProblem,
  OpsCatalogProduct,
  OpsCustomerSearchResult,
  OpsOrderingHub,
  OpsOrderingSubZone,
  OpsOrderingVendor,
  OpsPlaceOrderPayload,
  OpsPlaceOrderResponse,
} from '../models/ops-create-order.model';
import { formatCartProblems } from '../utils/cart-problem.utils';

const OPS_URL = `${API_BASE_URL}/v1/ops`;

@Injectable({ providedIn: 'root' })
export class OpsCreateOrderService {
  private readonly http = inject(HttpClient);

  /** `GET /v1/ops/hubs` */
  getHubs(): Observable<OpsOrderingHub[]> {
    return this.http.get<unknown>(`${OPS_URL}/hubs`).pipe(map(parseHubs));
  }

  /** `GET /v1/ops/sub-zones` */
  getSubZones(): Observable<OpsOrderingSubZone[]> {
    return this.http.get<unknown>(`${OPS_URL}/sub-zones`).pipe(map(parseSubZones));
  }

  /** `GET /v1/ops/vendors?hubId=` */
  getVendors(hubId: string): Observable<OpsOrderingVendor[]> {
    const params = new HttpParams().set('hubId', hubId);
    return this.http.get<unknown>(`${OPS_URL}/vendors`, { params }).pipe(map(parseVendors));
  }

  /** `GET /v1/ops/vendors/{vendorId}/products?search=` — ops order item picker. */
  searchShopProducts(vendorId: string, search = ''): Observable<OpsCatalogProduct[]> {
    let params = new HttpParams();
    const query = search.trim();
    if (query) {
      params = params.set('search', query);
    }
    return this.http
      .get<unknown>(`${OPS_URL}/vendors/${encodeURIComponent(vendorId)}/products`, { params })
      .pipe(
        map((body) =>
          unwrapProducts(body)
            .map(toCatalogProduct)
            .filter((row): row is OpsCatalogProduct => row !== null),
        ),
      );
  }

  /** `GET /v1/ops/vendors/{vendorId}/products` — available products only. */
  getVendorProducts(vendorId: string): Observable<OpsCatalogProduct[]> {
    return this.fetchProductPage(vendorId).pipe(
      expand((page) => (page.nextCursor ? this.fetchProductPage(vendorId, page.nextCursor) : EMPTY)),
      reduce((all, page) => [...all, ...page.items], [] as OpsCatalogProduct[]),
    );
  }

  /** `GET /v1/ops/customers/search?phone=` — `null` when the phone has no account. */
  searchCustomerByPhone(phone: string): Observable<OpsCustomerSearchResult | null> {
    const params = new HttpParams().set('phone', phone);
    return this.http.get<OpsCustomerSearchResult>(`${OPS_URL}/customers/search`, { params }).pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          return of(null);
        }
        return throwError(() => error);
      }),
    );
  }

  /** `POST /v1/ops/orders` with `Idempotency-Key`. */
  placeOrder(payload: OpsPlaceOrderPayload, idempotencyKey: string): Observable<OpsPlaceOrderResponse> {
    return this.http
      .post<unknown>(`${OPS_URL}/orders`, payload, {
        headers: new HttpHeaders({ 'Idempotency-Key': idempotencyKey }),
      })
      .pipe(map(parsePlacedOrder));
  }

  private fetchProductPage(
    vendorId: string,
    cursor?: string,
  ): Observable<{ items: OpsCatalogProduct[]; nextCursor: string | null }> {
    let params = new HttpParams().set('limit', '100');
    if (cursor) {
      params = params.set('cursor', cursor);
    }
    return this.http
      .get<unknown>(`${OPS_URL}/vendors/${encodeURIComponent(vendorId)}/products`, { params })
      .pipe(
        map((body) => ({
          items: unwrapProducts(body)
            .map(toCatalogProduct)
            .filter((row): row is OpsCatalogProduct => row !== null),
          nextCursor: readCursor(body),
        })),
      );
  }
}

/** Arabic message for a failed create-order request. */
export function createOrderErrorMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'تعذر إرسال الطلب. حاول مرة أخرى.';
  }

  const body = (error.error ?? null) as ApiErrorBody | null;
  const code = body?.error?.code ?? '';
  const details = asRecord(body?.error?.details);

  if (error.status === 422 && code === 'CART_INVALID') {
    const problems = readCartProblems(details['problems']);
    const message = formatCartProblems(problems);
    return message || 'السلة تحتاج مراجعة قبل الإرسال.';
  }

  if (error.status === 400 && code === 'VALIDATION_FAILED') {
    const issues = body?.error?.details;
    if (Array.isArray(issues)) {
      for (const issue of issues) {
        const row = asRecord(issue);
        if (row['path'] === 'dropOffAddress') {
          return 'تفاصيل العنوان قصيرة — أدخل 3 أحرف على الأقل (بعد حذف المسافات الزائدة).';
        }
      }
    }
  }

  if (error.status === 409) {
    const customerId = stringOrNull(details['customerId']);
    if (customerId) {
      return 'الرقم مسجّل لعميل موجود. تم ربط الحساب — راجع البيانات ثم أعد الإرسال.';
    }
    const apiMessage = body?.error?.message?.trim() ?? '';
    if (/blocked/i.test(apiMessage) || /محظور/.test(apiMessage)) {
      return 'لا يمكن إرسال طلب لعميل محظور.';
    }
    return apiMessage || 'تعارض في بيانات العميل. راجع الرقم أو الاسم.';
  }

  const message = body?.error?.message?.trim() ?? '';
  if (/[\u0600-\u06FF]/.test(message)) {
    return message;
  }
  if (error.status === 403) {
    return 'ليست لديك صلاحية إنشاء هذا الطلب.';
  }
  return message || 'تعذر إرسال الطلب. حاول مرة أخرى.';
}

export function readConflictCustomerId(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 409) {
    return null;
  }
  const body = (error.error ?? null) as ApiErrorBody | null;
  return stringOrNull(asRecord(body?.error?.details)['customerId']);
}

export function readCartProblemsFromError(error: unknown): CartProblem[] {
  if (!(error instanceof HttpErrorResponse) || error.status !== 422) {
    return [];
  }
  const body = (error.error ?? null) as ApiErrorBody | null;
  const code = body?.error?.code ?? '';
  if (code !== 'CART_INVALID') {
    return [];
  }
  return readCartProblems(asRecord(body?.error?.details)['problems']);
}

function parseHubs(body: unknown): OpsOrderingHub[] {
  const rows = Array.isArray(body) ? body : [];
  return rows
    .map((row) => {
      const record = asRecord(row);
      const id = stringOrNull(record['id']);
      const name = stringOrNull(record['name']);
      if (!id || !name) {
        return null;
      }
      const serving = record['servingSubZoneIds'] ?? record['serving_sub_zone_ids'];
      return {
        id,
        name,
        servingSubZoneIds: Array.isArray(serving)
          ? serving.filter((value): value is string => typeof value === 'string')
          : [],
      };
    })
    .filter((hub): hub is OpsOrderingHub => hub !== null);
}

function parseSubZones(body: unknown): OpsOrderingSubZone[] {
  const rows = Array.isArray(body) ? body : [];
  return rows
    .map((row) => {
      const record = asRecord(row);
      const id = stringOrNull(record['id']);
      const name = stringOrNull(record['name']);
      const zoneId = stringOrNull(record['zoneId'] ?? record['zone_id']);
      const zoneName = stringOrNull(record['zoneName'] ?? record['zone_name']) ?? '';
      if (!id || !name || !zoneId) {
        return null;
      }
      const hubIdsRaw = record['hubIds'] ?? record['hub_ids'];
      return {
        id,
        name,
        zoneId,
        zoneName,
        minOrderPiastres: readInt(record['minOrderPiastres'] ?? record['min_order_piastres']),
        hubIds: Array.isArray(hubIdsRaw)
          ? hubIdsRaw.filter((value): value is string => typeof value === 'string')
          : [],
        baseDeliveryFeePiastres: readInt(
          record['baseDeliveryFeePiastres'] ?? record['base_delivery_fee_piastres'],
          2500,
        ),
        extraShopFeePiastres: readInt(
          record['extraShopFeePiastres'] ?? record['extra_shop_fee_piastres'],
          500,
        ),
        baseServiceFeePiastres: readInt(
          record['baseServiceFeePiastres'] ?? record['base_service_fee_piastres'],
          500,
        ),
        extraShopServiceFeePiastres: readInt(
          record['extraShopServiceFeePiastres'] ?? record['extra_shop_service_fee_piastres'],
          200,
        ),
      };
    })
    .filter((zone): zone is OpsOrderingSubZone => zone !== null);
}

function parseVendors(body: unknown): OpsOrderingVendor[] {
  const rows = Array.isArray(body) ? body : [];
  return rows
    .map((row) => {
      const record = asRecord(row);
      const id = stringOrNull(record['id']);
      const name = stringOrNull(record['name']);
      const hubId = stringOrNull(record['hubId'] ?? record['hub_id']);
      const liveStatus = record['liveStatus'] ?? record['live_status'];
      if (!id || !name || !hubId) {
        return null;
      }
      if (liveStatus !== 'OPEN' && liveStatus !== 'BUSY' && liveStatus !== 'CLOSED') {
        return null;
      }
      return {
        id,
        name,
        hubId,
        logoUrl: stringOrNull(record['logoUrl'] ?? record['logo_url']),
        liveStatus,
        discountBp: readInt(record['discountBp'] ?? record['discount_bp']),
        commissionBp: readInt(record['commissionBp'] ?? record['commission_bp']),
      };
    })
    .filter((vendor): vendor is OpsOrderingVendor => vendor !== null);
}

function parsePlacedOrder(body: unknown): OpsPlaceOrderResponse {
  const record = asRecord(body);
  const id = stringOrNull(record['id']) ?? '';
  const orderNumber = stringOrNull(record['orderNumber'] ?? record['order_number']) ?? '';
  return { id, orderNumber };
}

function toCatalogProduct(row: unknown): OpsCatalogProduct | null {
  const record = asRecord(row);
  const id = stringOrNull(record['id'] ?? record['productId']);
  const name = stringOrNull(record['name']);
  if (!id || !name) {
    return null;
  }
  return {
    id,
    name,
    pricePiastres: readInt(record['pricePiastres'] ?? record['price_piastres']),
    variants: readVariants(record['variants']),
  };
}

function readVariants(value: unknown): OpsCatalogProduct['variants'] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((variant) => {
      const record = asRecord(variant);
      const id = stringOrNull(record['id']);
      const name = stringOrNull(record['name']);
      if (!id || !name) {
        return null;
      }
      const optionsRaw = record['options'];
      const options = Array.isArray(optionsRaw)
        ? optionsRaw
            .map((option) => {
              const opt = asRecord(option);
              const optionId = stringOrNull(opt['id']);
              const label = stringOrNull(opt['label']);
              if (!optionId || !label) {
                return null;
              }
              return {
                id: optionId,
                label,
                priceDeltaPiastres: readInt(opt['priceDeltaPiastres'] ?? opt['price_delta_piastres']),
              };
            })
            .filter((option): option is NonNullable<typeof option> => option !== null)
        : [];
      return { id, name, options };
    })
    .filter((variant): variant is NonNullable<typeof variant> => variant !== null);
}

function readCartProblems(value: unknown): CartProblem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const record = asRecord(item);
    return {
      code: String(record['code'] ?? ''),
      message: stringOrNull(record['message']) ?? undefined,
      vendorId: stringOrNull(record['vendorId'] ?? record['vendor_id']) ?? undefined,
      productId: stringOrNull(record['productId'] ?? record['product_id']) ?? undefined,
      itemId: stringOrNull(record['itemId'] ?? record['item_id']) ?? undefined,
      missingPiastres: readOptionalInt(record['missingPiastres'] ?? record['missing_piastres']),
    };
  });
}

function unwrapProducts(body: unknown): unknown[] {
  if (Array.isArray(body)) {
    return body;
  }
  const record = asRecord(body);
  const items = record['items'];
  return Array.isArray(items) ? items : [];
}

function readCursor(body: unknown): string | null {
  const record = asRecord(body);
  return stringOrNull(record['nextCursor'] ?? record['next_cursor']);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function readInt(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return fallback;
}

function readOptionalInt(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const parsed = readInt(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
}
