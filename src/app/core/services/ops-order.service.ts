import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, filter, map, merge, share } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import {
  AssignmentMode,
  CancelOrderPayload,
  CursorPage,
  AddOrderShopItemPayload,
  EditOrderItemPayload,
  OfferStatus,
  OpsOrder,
  OpsOrderListQuery,
  OpsOrderRow,
  OpsOrderEvent,
  OpsTrip,
  OpsTripOffer,
  OrderStatus,
  SubOrderStatus,
  SubOrderStatusChange,
  TaskStatus,
} from '../models/ops-order.model';
import { RealtimeService } from './realtime.service';

const ORDERS_URL = `${API_BASE_URL}/v1/ops/orders`;

const ORDER_TOUCH_EVENTS = [
  'order.updated',
  'offer.created',
  'offer.declined',
  'offer.expired',
  'offer.cancelled',
  'task.assigned',
  'task.started',
  'task.completed',
  'task.cancelled',
  'task.failed',
] as const;

interface ApiErrorBody {
  code?: string;
  message?: string;
  error?: {
    code?: string;
    message?: string;
  };
}

@Injectable({ providedIn: 'root' })
export class OpsOrderService {
  private readonly http = inject(HttpClient);
  private readonly realtime = inject(RealtimeService);

  /** Live `order:created` payloads, mapped to list rows. */
  readonly orderCreated$: Observable<OpsOrderRow> = this.realtime.on<unknown>('order.created').pipe(
    map(asCreatedOrderRow),
    filter((row): row is OpsOrderRow => row !== null),
    share(),
  );

  /**
   * Order ids that changed on the hub socket (dispatch, status, offers).
   * Refetch the open order or list row when the id matches.
   */
  readonly orderTouched$: Observable<string> = merge(
    ...ORDER_TOUCH_EVENTS.map((event) =>
      this.realtime.on<unknown>(event).pipe(
        map(orderIdFromRealtimePayload),
        filter((id): id is string => id !== null),
      ),
    ),
  ).pipe(share());

  /** `GET /v1/ops/orders` — newest first, cursor page. */
  listOrders(query: OpsOrderListQuery = {}): Observable<CursorPage<OpsOrderRow>> {
    let params = new HttpParams().set('limit', String(query.limit ?? 20));
    const status = query.status?.trim() ?? '';
    const hubId = query.hubId?.trim() ?? '';
    const customerId = query.customerId?.trim() ?? '';
    const vendorId = query.vendorId?.trim() ?? '';
    const cursor = query.cursor?.trim() ?? '';
    if (status) {
      params = params.set('status', status);
    }
    if (hubId) {
      params = params.set('hubId', hubId);
    }
    if (customerId) {
      params = params.set('customerId', customerId);
    }
    if (vendorId) {
      params = params.set('vendorId', vendorId);
    }
    if (cursor) {
      params = params.set('cursor', cursor);
    }

    return this.http.get<CursorPage<OpsOrderRow>>(ORDERS_URL, { params }).pipe(map(toPage));
  }

  /** `GET /v1/ops/orders/{id}` */
  getOrder(orderId: string): Observable<OpsOrder> {
    return this.http.get<unknown>(orderUrl(orderId)).pipe(map(normalizeOpsOrder));
  }

  /** `POST /v1/ops/orders/{id}/sub-orders/{subOrderId}/status` */
  setSubOrderStatus(
    orderId: string,
    subOrderId: string,
    change: SubOrderStatusChange,
  ): Observable<OpsOrder> {
    const body: SubOrderStatusChange = { status: change.status };
    const reason = change.reason?.trim() ?? '';
    if (reason) {
      body.reason = reason;
    }
    return this.http
      .post<unknown>(`${orderUrl(orderId)}/sub-orders/${encodeURIComponent(subOrderId)}/status`, body)
      .pipe(map(normalizeOpsOrder));
  }

  /** `PATCH /v1/ops/orders/{id}/items/{itemId}` — send the order `version` you last read. */
  editItem(orderId: string, itemId: string, payload: EditOrderItemPayload): Observable<OpsOrder> {
    return this.http
      .patch<unknown>(`${orderUrl(orderId)}/items/${encodeURIComponent(itemId)}`, payload)
      .pipe(map(normalizeOpsOrder));
  }

  /** `POST /v1/ops/orders/{id}/shops/{shopId}/items` */
  addShopItem(
    orderId: string,
    shopId: string,
    payload: AddOrderShopItemPayload,
  ): Observable<OpsOrder> {
    return this.http
      .post<unknown>(
        `${orderUrl(orderId)}/shops/${encodeURIComponent(shopId)}/items`,
        payload,
      )
      .pipe(map(normalizeOpsOrder));
  }

  /** `POST /v1/ops/orders/{id}/cancel` */
  cancelOrder(orderId: string, payload: CancelOrderPayload): Observable<OpsOrder> {
    return this.http
      .post<unknown>(`${orderUrl(orderId)}/cancel`, {
        reason: payload.reason.trim(),
        chargeFee: payload.chargeFee,
      })
      .pipe(map(normalizeOpsOrder));
  }

  /** `POST /v1/ops/orders/{id}/force-complete` — manual delivery for captains without the app. */
  forceComplete(orderId: string): Observable<OpsOrder> {
    return this.http
      .post<unknown>(`${orderUrl(orderId)}/force-complete`, null, {
        headers: new HttpHeaders({ 'Idempotency-Key': crypto.randomUUID() }),
      })
      .pipe(map(normalizeOpsOrder));
  }
}

export function isStaleVersion(error: unknown): boolean {
  return apiErrorCode(error) === 'STALE_VERSION';
}

/** Arabic toast copy for a failed order mutation. */
export function orderMutationMessage(error: unknown): string {
  const code = apiErrorCode(error);
  if (code === 'STALE_VERSION') {
    return 'تم تعديل الطلب من طرف آخر. تم تحديث البيانات، حاول مرة أخرى.';
  }
  if (code === 'INVALID_STATE') {
    return 'لا يمكن تنفيذ هذا الإجراء في الحالة الحالية.';
  }
  if (code === 'FORBIDDEN') {
    return 'ليست لديك صلاحية هذا الإجراء.';
  }
  const message = apiErrorMessage(error);
  return message || 'تعذر تنفيذ الإجراء. حاول مرة أخرى.';
}

function orderUrl(orderId: string): string {
  return `${ORDERS_URL}/${encodeURIComponent(orderId)}`;
}

function orderIdFromRealtimePayload(payload: unknown): string | null {
  const rec = asRecord(payload);
  const nested = asRecord(rec['data']);
  const id = field(rec['orderId']) || field(nested['orderId']);
  return id || null;
}

const TASK_STATUSES = new Set<TaskStatus>([
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'FAILED',
  'DECLINED',
]);

const MODES = new Set<AssignmentMode>(['COLLECT_ONLY', 'DELIVER_ONLY', 'COLLECT_AND_DELIVER']);

const OFFER_STATUSES = new Set<OfferStatus>(['PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED']);
const OFFERED = 'OFFERED';

interface OfferRecord {
  id?: string | null;
  status?: string | null;
  declineReason?: string | null;
  declinedReason?: string | null;
  reason?: string | null;
}

interface TripRecord {
  id?: string | null;
  orderId?: string | null;
  mode?: string | null;
  status?: string | null;
  isRoleOverride?: boolean | null;
  createdAt?: string | null;
  completedAt?: string | null;
  captain?: { id?: string | null; fullName?: string | null; name?: string | null; phone?: string | null } | null;
  offer?: OfferRecord | null;
  currentOffer?: OfferRecord | null;
  latestOffer?: OfferRecord | null;
  offers?: OfferRecord[] | null;
  declineReason?: string | null;
  declinedReason?: string | null;
}

/** Keeps trip offer, decline reason, and the captain slot aligned with a captain decline. */
function normalizeOpsOrder(body: unknown): OpsOrder {
  const order = (body ?? {}) as OpsOrder;
  const events = Array.isArray(order.events) ? order.events : [];
  const trips = Array.isArray(order.trips)
    ? order.trips.map((trip) => withEventReason(normalizeTrip(trip), events))
    : [];
  return { ...order, trips };
}

const DECLINE_EVENT_TYPES = new Set([
  'dispatch.declined',
  'offer.declined',
  'task.declined',
  'captain.offer_declined',
]);

function withEventReason(trip: OpsTrip, events: OpsOrderEvent[]): OpsTrip {
  if (trip.status !== 'DECLINED' || trip.offer?.declineReason) {
    return trip;
  }
  const note = [...events]
    .reverse()
    .find((event) => DECLINE_EVENT_TYPES.has(event.type))
    ?.note?.trim();
  if (!note) {
    return trip;
  }
  return {
    ...trip,
    offer: {
      id: trip.offer?.id ?? '',
      status: 'DECLINED',
      declineReason: note,
    },
  };
}

function normalizeTrip(raw: unknown): OpsTrip {
  const trip = (raw ?? {}) as TripRecord;
  const offer = readOffer(trip);
  const accepted =
    trip.status === 'ASSIGNED' || trip.status === 'IN_PROGRESS' || trip.status === 'COMPLETED';
  const declined = offer?.status === 'DECLINED' && !accepted;

  return {
    id: trip.id?.trim() || '',
    orderId: trip.orderId?.trim() || '',
    mode: asMode(trip.mode),
    status: declined ? 'DECLINED' : asTaskStatus(trip.status),
    isRoleOverride: trip.isRoleOverride === true,
    createdAt: trip.createdAt ?? '',
    completedAt: trip.completedAt ?? null,
    captain: declined ? null : readCaptain(trip.captain),
    offer,
  };
}

function readOffer(trip: TripRecord): OpsTripOffer | null {
  const listed = trip.offers ?? [];
  const raw = trip.currentOffer ?? trip.offer ?? trip.latestOffer ?? listed[listed.length - 1] ?? null;
  const offerReason = text(raw?.declineReason) || text(raw?.declinedReason) || text(raw?.reason);
  const tripReason = text(trip.declineReason) || text(trip.declinedReason);
  const statusRaw = raw?.status?.trim().toUpperCase() ?? '';
  const tripDeclined = trip.status?.trim().toUpperCase() === 'DECLINED' || trip.status?.trim().toUpperCase() === 'REJECTED';

  if (!raw && !tripReason && !tripDeclined) {
    return null;
  }

  const declined =
    tripDeclined ||
    statusRaw === 'DECLINED' ||
    statusRaw === 'REJECTED' ||
    (Boolean(offerReason) && statusRaw !== 'ACCEPTED' && statusRaw !== 'PENDING' && statusRaw !== 'EXPIRED');

  const reason = offerReason || (declined ? tripReason : '');
  return {
    id: raw?.id?.trim() || '',
    status: declined ? 'DECLINED' : asOfferStatus(statusRaw),
    declineReason: declined ? reason || null : null,
  };
}

function readCaptain(
  captain: TripRecord['captain'],
): OpsTrip['captain'] {
  const id = captain?.id?.trim() ?? '';
  const fullName = captain?.fullName?.trim() || captain?.name?.trim() || '';
  if (!id && !fullName) {
    return null;
  }
  return {
    id,
    fullName,
    phone: captain?.phone?.trim() ?? '',
  };
}

function asOfferStatus(status: string): OfferStatus {
  if (status === OFFERED) {
    return 'PENDING';
  }
  return OFFER_STATUSES.has(status as OfferStatus) ? (status as OfferStatus) : 'PENDING';
}

function asTaskStatus(value: string | null | undefined): TaskStatus {
  const status = value?.trim().toUpperCase() ?? '';
  if (status === 'REJECTED') {
    return 'DECLINED';
  }
  return TASK_STATUSES.has(status as TaskStatus) ? (status as TaskStatus) : 'OPEN';
}

function asMode(value: string | null | undefined): AssignmentMode {
  return value && MODES.has(value as AssignmentMode) ? (value as AssignmentMode) : 'DELIVER_ONLY';
}

function text(value: string | null | undefined): string {
  return value?.trim() ?? '';
}

const ORDER_STATUSES = new Set<OrderStatus>([
  'PLACED',
  'CONSOLIDATING',
  'READY_AT_HUB',
  'ASSIGNED',
  'EN_ROUTE',
  'DELIVERED',
  'CANCELLED',
  'FAILED',
]);

const SUB_ORDER_STATUSES = new Set<SubOrderStatus>([
  'PENDING',
  'PREPARING',
  'READY_FOR_PICKUP',
  'PICKED_UP',
  'AT_HUB',
  'VERIFIED',
  'HANDED_TO_DRIVER',
  'DELIVERED',
  'REJECTED',
  'CANCELLED',
]);

function asCreatedOrderRow(payload: unknown): OpsOrderRow | null {
  const raw = unwrapCreatedOrder(payload);
  if (!raw) {
    return null;
  }
  const rec = asRecord(raw);
  const id = field(rec['id']) || field(rec['orderId']);
  const orderNumber = field(rec['orderNumber']);
  if (!id && !orderNumber) {
    return null;
  }
  const hub = asRecord(rec['hub']);
  const customer = asRecord(rec['customer']);
  const address = asRecord(rec['deliveryAddress']);
  const subOrders = Array.isArray(rec['subOrders']) ? rec['subOrders'] : [];
  const listedStatuses = Array.isArray(rec['shopStatuses']) ? rec['shopStatuses'] : [];
  const finalTotal = rec['finalTotal'];
  return {
    id: id || orderNumber,
    orderNumber: orderNumber || id,
    status: asOrderStatus(rec['status']),
    hubId: field(rec['hubId']) || field(hub['id']),
    hubName: field(rec['hubName']) || field(hub['name']),
    customerName: field(rec['customerName']) || field(customer['name']) || field(customer['fullName']),
    area: field(rec['area']) || field(address['area']),
    estimatedTotal: asNumber(rec['estimatedTotal']),
    finalTotal: finalTotal == null || finalTotal === '' ? null : asNumber(finalTotal),
    placedAt: field(rec['placedAt']) || new Date().toISOString(),
    shopCount: asNumber(rec['shopCount']) || subOrders.length,
    shopStatuses: listedStatuses.length
      ? listedStatuses.map((status) => asSubOrderStatus(status))
      : subOrders.map((sub) => asSubOrderStatus(asRecord(sub)['status'])),
  };
}

function field(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

function unwrapCreatedOrder(payload: unknown): unknown {
  if (payload == null) {
    return null;
  }
  if (typeof payload !== 'object') {
    return null;
  }
  const rec = payload as Record<string, unknown>;
  return rec['order'] ?? rec['data'] ?? rec['payload'] ?? payload;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asOrderStatus(value: unknown): OrderStatus {
  const status = String(value ?? '').trim().toUpperCase();
  return ORDER_STATUSES.has(status as OrderStatus) ? (status as OrderStatus) : 'PLACED';
}

function asSubOrderStatus(value: unknown): SubOrderStatus {
  const status = String(value ?? '').trim().toUpperCase();
  return SUB_ORDER_STATUSES.has(status as SubOrderStatus) ? (status as SubOrderStatus) : 'PENDING';
}

function asNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toPage(body: CursorPage<OpsOrderRow> | null): CursorPage<OpsOrderRow> {
  return {
    items: body?.items ?? [],
    nextCursor: body?.nextCursor == null || body.nextCursor === '' ? null : String(body.nextCursor),
  };
}

function apiErrorCode(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return '';
  }
  const body = (error.error ?? null) as ApiErrorBody | null;
  return body?.error?.code ?? body?.code ?? '';
}

function apiErrorMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return '';
  }
  const body = (error.error ?? null) as ApiErrorBody | null;
  return body?.error?.message?.trim() || body?.message?.trim() || '';
}
