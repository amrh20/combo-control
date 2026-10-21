import { piastresToEgp } from './zone.model';

/** Integer piastres from the API. Divide by 100 for EGP. */
export type Piastres = number;

export type OrderStatus =
  | 'PLACED'
  | 'CONSOLIDATING'
  | 'READY_AT_HUB'
  | 'ASSIGNED'
  | 'EN_ROUTE'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'FAILED';

export type SubOrderStatus =
  | 'PENDING'
  | 'PREPARING'
  | 'READY_FOR_PICKUP'
  | 'PICKED_UP'
  | 'AT_HUB'
  | 'VERIFIED'
  | 'HANDED_TO_DRIVER'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED';

/** Statuses staff can send to `POST /v1/orders/{id}/sub-orders/{subOrderId}/status`. */
export type StaffSubOrderStatus =
  | 'PREPARING'
  | 'REJECTED'
  | 'READY_FOR_PICKUP'
  | 'PICKED_UP'
  | 'AT_HUB'
  | 'VERIFIED';

export type PaymentMethod = 'COD' | 'CARD' | 'WALLET';
export type AssignmentMode = 'COLLECT_ONLY' | 'DELIVER_ONLY' | 'COLLECT_AND_DELIVER';
export type TaskStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'FAILED'
  | 'DECLINED';

export type OfferStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface AddressSnapshot {
  label: string | null;
  city: string;
  area: string;
  street: string;
  building: string;
  floor: string | null;
  apartment: string | null;
  landmark: string | null;
  phone: string;
  deliveryInstructions: string | null;
  location: GeoPoint;
}

export interface ChosenOption {
  variantId: string;
  variant: string;
  optionId: string;
  option: string;
  priceDeltaPiastres: Piastres;
}

export interface OpsOrderItem {
  id: string;
  productId: string | null;
  name: string;
  options: ChosenOption[];
  imageUrl: string | null;
  unitPrice: Piastres;
  quantity: number;
  isRemoved: boolean;
}

export interface OpsSubOrder {
  id: string;
  vendorId: string;
  vendorName: string;
  logoUrl: string | null;
  status: SubOrderStatus;
  discountBp: number;
  shopNotes: string | null;
  rejectionReason: string | null;
  statusChangedAt: string;
  items: OpsOrderItem[];
}

/** Latest offer on a trip. Present after a captain is offered the trip. */
export interface OpsTripOffer {
  id: string;
  status: OfferStatus;
  declineReason: string | null;
}

export interface OpsTrip {
  id: string;
  orderId: string;
  mode: AssignmentMode;
  status: TaskStatus;
  isRoleOverride: boolean;
  createdAt: string;
  completedAt: string | null;
  captain: { id: string; fullName: string; phone: string } | null;
  /** `null` when this trip has not been offered yet. */
  offer: OpsTripOffer | null;
}

export interface OpsOrderEvent {
  id: number;
  orderId: string;
  subOrderId: string | null;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorType: 'STAFF' | 'CUSTOMER' | 'CAPTAIN' | null;
  actorId: string | null;
  note: string | null;
  at: string;
}

/** `GET /v1/orders` row. */
export interface OpsOrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  hubId: string;
  hubName: string;
  customerName: string;
  area: string;
  estimatedTotal: Piastres;
  finalTotal: Piastres | null;
  placedAt: string;
  shopCount: number;
  shopStatuses: SubOrderStatus[];
}

/** `GET /v1/orders/{id}`. */
export interface OpsOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  hubId: string;
  subZoneId: string | null;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  deliveryAddress: AddressSnapshot;
  itemsSubtotal: Piastres;
  discount: Piastres;
  deliveryFee: Piastres;
  previousFees: Piastres;
  estimatedTotal: Piastres;
  finalTotal: Piastres | null;
  customerNotes: string | null;
  callBeforeDelivery: boolean;
  cancellationReason: string | null;
  cancellationFee: Piastres | null;
  cancelledAt: string | null;
  /** Send back when editing items. */
  version: number;
  placedAt: string;
  updatedAt: string;
  hub: { id: string; name: string };
  /** Masked (`010•••••678`) without `customers.read`. */
  customer: { id: string; name: string; phone: string };
  subOrders: OpsSubOrder[];
  trips: OpsTrip[];
  events: OpsOrderEvent[];
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface OpsOrderListQuery {
  status?: OrderStatus;
  hubId?: string;
  customerId?: string;
  cursor?: string;
  limit?: number;
}

export interface SubOrderStatusChange {
  status: StaffSubOrderStatus;
  reason?: string;
}

export interface EditOrderItemPayload {
  version: number;
  isRemoved?: boolean;
  quantity?: number;
}

export interface CancelOrderPayload {
  reason: string;
  chargeFee: boolean;
}

export interface StatusDisplay {
  labelAr: string;
  tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'primary';
}

/** Live board default: still in progress, newest first. */
export const LIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  'PLACED',
  'CONSOLIDATING',
  'READY_AT_HUB',
  'ASSIGNED',
  'EN_ROUTE',
];

/** Terminal orders shown on the history board. */
export const CLOSED_ORDER_STATUSES: readonly OrderStatus[] = ['DELIVERED', 'CANCELLED', 'FAILED'];

export const ORDER_STATUS_CONFIG: Record<OrderStatus, StatusDisplay> = {
  PLACED: { labelAr: 'تم الطلب', tone: 'info' },
  CONSOLIDATING: { labelAr: 'قيد التجميع', tone: 'warning' },
  READY_AT_HUB: { labelAr: 'جاهز في الهب', tone: 'primary' },
  ASSIGNED: { labelAr: 'تم التعيين', tone: 'info' },
  EN_ROUTE: { labelAr: 'في الطريق', tone: 'warning' },
  DELIVERED: { labelAr: 'تم التسليم', tone: 'success' },
  CANCELLED: { labelAr: 'ملغي', tone: 'danger' },
  FAILED: { labelAr: 'فشل التسليم', tone: 'danger' },
};

export const SUB_ORDER_STATUS_CONFIG: Record<SubOrderStatus, StatusDisplay> = {
  PENDING: { labelAr: 'قيد الانتظار', tone: 'neutral' },
  PREPARING: { labelAr: 'قيد التحضير', tone: 'warning' },
  READY_FOR_PICKUP: { labelAr: 'جاهز للاستلام', tone: 'info' },
  PICKED_UP: { labelAr: 'تم الاستلام', tone: 'primary' },
  AT_HUB: { labelAr: 'وصل الهب', tone: 'info' },
  VERIFIED: { labelAr: 'تم التحقق', tone: 'success' },
  HANDED_TO_DRIVER: { labelAr: 'سُلم للكابتن', tone: 'primary' },
  DELIVERED: { labelAr: 'تم التسليم', tone: 'success' },
  REJECTED: { labelAr: 'مرفوض', tone: 'danger' },
  CANCELLED: { labelAr: 'ملغي', tone: 'danger' },
};

export const TASK_STATUS_CONFIG: Record<TaskStatus, StatusDisplay> = {
  OPEN: { labelAr: 'بانتظار القبول', tone: 'warning' },
  ASSIGNED: { labelAr: 'مقبولة', tone: 'info' },
  IN_PROGRESS: { labelAr: 'جارية', tone: 'primary' },
  COMPLETED: { labelAr: 'مكتملة', tone: 'success' },
  CANCELLED: { labelAr: 'ملغاة', tone: 'danger' },
  FAILED: { labelAr: 'فشلت', tone: 'danger' },
  DECLINED: { labelAr: 'تم رفض العرض', tone: 'danger' },
};

const ASSIGNMENT_MODE_LABELS: Record<AssignmentMode, string> = {
  COLLECT_ONLY: 'تجميع بس',
  DELIVER_ONLY: 'توصيل بس',
  COLLECT_AND_DELIVER: 'تجميع وتوصيل',
};

const EVENT_LABELS: Record<string, string> = {
  'order.placed': 'تم إنشاء الطلب',
  'sub_order.status_changed': 'تغيّرت حالة المتجر',
  'order.item_changed': 'تعديل صنف',
  'order.cancelled': 'تم إلغاء الطلب',
  'offer.declined': 'رفض الكابتن العرض',
};

const ACTOR_LABELS: Record<string, string> = {
  STAFF: 'موظف',
  CUSTOMER: 'عميل',
  CAPTAIN: 'كابتن',
};

/** Staff may cancel until a captain has accepted the order. */
export const CANCELLABLE_ORDER_STATUSES: readonly OrderStatus[] = [
  'PLACED',
  'CONSOLIDATING',
  'READY_AT_HUB',
];

export interface ShopStatusAction {
  status: StaffSubOrderStatus;
  permission: 'orders.update' | 'hub.verify';
  label: string;
  needsReason: boolean;
}

const SHOP_ACTIONS: Partial<Record<SubOrderStatus, readonly ShopStatusAction[]>> = {
  PENDING: [
    { status: 'PREPARING', permission: 'orders.update', label: 'تأكيد التحضير', needsReason: false },
    { status: 'REJECTED', permission: 'orders.update', label: 'رفض المتجر', needsReason: true },
  ],
  PREPARING: [
    {
      status: 'READY_FOR_PICKUP',
      permission: 'orders.update',
      label: 'جاهز للاستلام',
      needsReason: false,
    },
  ],
  READY_FOR_PICKUP: [
    { status: 'PICKED_UP', permission: 'orders.update', label: 'تم الاستلام', needsReason: false },
  ],
  PICKED_UP: [
    { status: 'AT_HUB', permission: 'hub.verify', label: 'وصل الهب', needsReason: false },
  ],
  AT_HUB: [
    { status: 'VERIFIED', permission: 'hub.verify', label: 'تم التحقق', needsReason: false },
  ],
};

export function shopStatusActions(status: SubOrderStatus): readonly ShopStatusAction[] {
  return SHOP_ACTIONS[status] ?? [];
}

export function itemsEditable(status: SubOrderStatus): boolean {
  return status === 'PENDING' || status === 'PREPARING';
}

export function isActiveTrip(trip: OpsTrip): boolean {
  return trip.status === 'OPEN' || trip.status === 'ASSIGNED' || trip.status === 'IN_PROGRESS';
}

/** The captain rejected the latest offer and the trip is free to offer again. */
export function tripOfferDeclined(trip: OpsTrip): boolean {
  return trip.status === 'DECLINED' || trip.offer?.status === 'DECLINED';
}

export function tripDeclineReason(trip: OpsTrip): string {
  return trip.offer?.declineReason?.trim() ?? '';
}

/** Active trips can be reassigned, and so can a trip whose offer was just declined. */
export function canReassignTrip(trip: OpsTrip): boolean {
  return isActiveTrip(trip) || tripOfferDeclined(trip);
}

export function tripCaptainLabel(trip: OpsTrip): string {
  if (tripOfferDeclined(trip) && !trip.captain) {
    return 'لا يوجد كابتن';
  }
  return trip.captain?.fullName?.trim() || 'بانتظار القبول';
}

export function isPhoneMasked(phone: string | null | undefined): boolean {
  return (phone ?? '').includes('•');
}

export function egpFromPiastres(piastres: number | null | undefined): number {
  return piastresToEgp(piastres ?? 0);
}

export function lineTotalPiastres(item: OpsOrderItem): number {
  return item.unitPrice * item.quantity;
}

export function shopSubtotalPiastres(sub: OpsSubOrder): number {
  return sub.items.reduce(
    (sum, item) => (item.isRemoved ? sum : sum + lineTotalPiastres(item)),
    0,
  );
}

export function assignmentModeLabel(mode: AssignmentMode | null | undefined): string {
  return mode ? ASSIGNMENT_MODE_LABELS[mode] : '';
}

export function orderStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return '';
  }
  if (status in ORDER_STATUS_CONFIG) {
    return ORDER_STATUS_CONFIG[status as OrderStatus].labelAr;
  }
  if (status in SUB_ORDER_STATUS_CONFIG) {
    return SUB_ORDER_STATUS_CONFIG[status as SubOrderStatus].labelAr;
  }
  return status;
}

export function eventTypeLabel(type: string): string {
  return EVENT_LABELS[type] ?? type;
}

export function actorTypeLabel(actor: OpsOrderEvent['actorType']): string {
  return actor ? (ACTOR_LABELS[actor] ?? actor) : '';
}

export function eventNoteLabel(event: OpsOrderEvent): string {
  const note = event.note?.trim() ?? '';
  if (!note || event.type !== 'order.item_changed') {
    return note;
  }
  try {
    const parsed = JSON.parse(note) as { quantity?: number; isRemoved?: boolean };
    const parts: string[] = [];
    if (typeof parsed.quantity === 'number') {
      parts.push(`الكمية ${parsed.quantity}`);
    }
    if (parsed.isRemoved === true) {
      parts.push('تمت الإزالة');
    }
    if (parsed.isRemoved === false) {
      parts.push('تمت الاستعادة');
    }
    return parts.join(' · ') || note;
  } catch {
    return note;
  }
}

export function paymentMethodLabel(method: PaymentMethod): string {
  switch (method) {
    case 'COD':
      return 'الدفع عند الاستلام';
    case 'CARD':
      return 'بطاقة';
    case 'WALLET':
      return 'محفظة';
  }
}

export function formatOrderAge(iso: string, now = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) {
    return '—';
  }
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) {
    return 'الآن';
  }
  if (minutes < 60) {
    return `منذ ${minutes} د`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `منذ ${hours} س`;
  }
  return `منذ ${Math.floor(hours / 24)} ي`;
}

export function formatAddress(address: AddressSnapshot): string {
  const parts = [
    address.street,
    address.building ? `مبنى ${address.building}` : null,
    address.floor ? `دور ${address.floor}` : null,
    address.apartment ? `شقة ${address.apartment}` : null,
    address.area,
    address.city,
  ].filter((part): part is string => Boolean(part));
  return parts.join('، ');
}

export function byNewestOrder<T extends { placedAt: string; id: string }>(a: T, b: T): number {
  const time = new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime();
  if (time !== 0 && !Number.isNaN(time)) {
    return time;
  }
  return b.id.localeCompare(a.id);
}
