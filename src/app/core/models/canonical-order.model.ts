/**
 * Canonical Order Contract — Phase 0 foundation.
 *
 * Single source of truth shared (eventually) by:
 *   Customer App · Ops Dashboard · Driver App
 *
 * Cross-system concepts captured here (previously missing / fragmented):
 *   - Hub-based consolidation (order aggregates multiple shop sub-orders)
 *   - Per-shop sub-order lifecycle independent of aggregate status
 *   - Structured geo address + hub location
 *   - Full financial split (customer / vendor / driver / platform)
 *   - Explicit dispatch offer state
 */

// ── Primitives ───────────────────────────────────────────────────────────────

/** WGS84 coordinate pair used across Customer, Hub, Shop, and Driver locations. */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/** Structured delivery address — never a free-form blob alone. */
export interface StructuredAddress {
  label: string;
  street: string;
  building: string;
  floor?: string;
  apartment?: string;
  landmark?: string;
  area: string;
  city: string;
  /** Egypt governorate / city secondary label when needed. */
  governorate?: string;
  notes?: string;
  location: GeoPoint;
}

export type CurrencyCode = 'EGP';

// ── Aggregate order status (Ops / Customer / Driver shared) ───────────────────

/**
 * Aggregate lifecycle of a multi-vendor, hub-consolidated order.
 * Sub-orders may lag or lead this; status reflects the *order* as a whole.
 */
export type CanonicalOrderStatus =
  | 'PLACED'          // customer submitted; shops not yet confirmed
  | 'CONSOLIDATING'   // one or more shops preparing / moving to hub
  | 'READY_AT_HUB'    // all sub-orders verified at hub; eligible for dispatch
  | 'ASSIGNED'        // driver accepted; awaiting pickup from hub
  | 'EN_ROUTE'        // driver left hub toward customer
  | 'DELIVERED'       // customer received order
  | 'CANCELLED'       // terminal — cancelled before delivery
  | 'FAILED';         // terminal — delivery attempt failed

// ── Per-shop sub-order status ────────────────────────────────────────────────

/**
 * Independent shop-leg lifecycle inside a CanonicalOrder.
 * Enables Ops to see "Shop A at hub, Shop B still preparing".
 */
export type ShopSubOrderStatus =
  | 'PENDING'           // awaiting shop acceptance
  | 'PREPARING'         // shop confirmed & preparing
  | 'AT_HUB'            // physical package arrived at hub
  | 'VERIFIED'          // hub staff verified contents against ticket
  | 'HANDED_TO_DRIVER'; // driver took this sub-order's bag from hub

// ── Dispatch / offer state ───────────────────────────────────────────────────

export type DispatchOfferStatus =
  | 'NONE'       // not yet offered to any driver
  | 'OFFERED'    // live offer out to a driver
  | 'ACCEPTED'   // driver accepted
  | 'DECLINED'   // driver declined; may re-offer
  | 'EXPIRED'    // offer timed out
  | 'CANCELLED'; // ops cancelled the offer

// ── Line items ───────────────────────────────────────────────────────────────

export interface OrderLineItem {
  id: string;
  sku?: string;
  name: string;
  nameAr?: string;
  unitPrice: number;
  quantity: number;
  /** unitPrice × quantity */
  lineTotal: number;
  notes?: string;
  modifiers?: string[];
}

// ── Nested contract slices ───────────────────────────────────────────────────

export interface CustomerSnapshot {
  customerId: string;
  name: string;
  phone: string;
  address: StructuredAddress;
}

export interface HubAssignment {
  hubId: string;
  name: string;
  nameAr?: string;
  location: GeoPoint;
  /** Zone / catchment this hub serves. */
  zoneId?: string;
  zoneName?: string;
}

export interface ShopSubOrder {
  id: string;
  shopId: string;
  shopName: string;
  shopNameAr?: string;
  status: ShopSubOrderStatus;
  items: OrderLineItem[];
  /** Shop pickup / storefront location (for courier-to-hub legs). */
  location: GeoPoint;
  /** Sum of lineTotals for this shop. */
  itemsSubtotal: number;
  /** When the shop confirmed / started preparing (ISO). */
  acceptedAt?: string;
  /** When package arrived at hub (ISO). */
  arrivedAtHubAt?: string;
  /** When hub verified the bag (ISO). */
  verifiedAt?: string;
  notes?: string;
}

/**
 * Full money map for one CanonicalOrder.
 * All amounts in the declared currency (strictly EGP for Phase 0).
 *
 * Customer-facing:
 *   itemsSubtotal + deliveryFee + tax − discount = customerGrandTotal
 *
 * Payout-facing:
 *   vendorPayable, driverEarnings, platformCommission
 *
 * Cash:
 *   finalCashToCollect — what the driver must collect on COD
 */
export interface FinancialBreakdown {
  currency: CurrencyCode;
  itemsSubtotal: number;
  deliveryFee: number;
  tax: number;
  discount: number;
  /** What the customer pays in total. */
  customerGrandTotal: number;
  platformCommission: number;
  /** Net amount owed to shops (after commission). */
  vendorPayable: number;
  driverEarnings: number;
  /** COD amount the driver collects; 0 if prepaid. */
  finalCashToCollect: number;
  paymentMethod: 'COD' | 'CARD' | 'WALLET';
}

export interface DispatchState {
  assignedDriverId: string | null;
  assignedDriverName?: string | null;
  assignedDriverPhone?: string | null;
  offerStatus: DispatchOfferStatus;
  /** When the current/last offer was sent (ISO). */
  offeredAt?: string | null;
  /** When the driver accepted (ISO). */
  acceptedAt?: string | null;
  /** When the driver picked up from hub (ISO). */
  pickedUpAt?: string | null;
  /** Offer TTL / expiry (ISO). */
  offerExpiresAt?: string | null;
}

/** Driver payload used when Ops assigns a courier to a ready-at-hub order. */
export interface AssignableDriver {
  id: string;
  name: string;
  phone: string;
}

export interface CanonicalOrderTimestamps {
  placedAt: string;
  consolidatingAt?: string;
  readyAtHubAt?: string;
  assignedAt?: string;
  enRouteAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  failedAt?: string;
  updatedAt: string;
}

// ── Root aggregate ───────────────────────────────────────────────────────────

export interface CanonicalOrder {
  id: string;
  orderNumber: string;
  status: CanonicalOrderStatus;
  customer: CustomerSnapshot;
  hub: HubAssignment;
  subOrders: ShopSubOrder[];
  financials: FinancialBreakdown;
  dispatch: DispatchState;
  timestamps: CanonicalOrderTimestamps;
  /** Free-text ops / call-center notes (read model). */
  notes?: string;
  zoneId?: string;
  zoneName?: string;
}

// ── Display helpers (shared label maps — not part of wire contract) ──────────

export interface StatusDisplayConfig {
  label: string;
  labelAr: string;
  tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'primary';
}

export const CANONICAL_ORDER_STATUS_CONFIG: Record<
  CanonicalOrderStatus,
  StatusDisplayConfig
> = {
  PLACED:        { label: 'Placed',         labelAr: 'تم الطلب',      tone: 'info' },
  CONSOLIDATING: { label: 'Consolidating',  labelAr: 'قيد التجميع',   tone: 'warning' },
  READY_AT_HUB:  { label: 'Ready at Hub',   labelAr: 'جاهز في الهب',  tone: 'primary' },
  ASSIGNED:      { label: 'Assigned',       labelAr: 'تم التعيين',    tone: 'info' },
  EN_ROUTE:      { label: 'En Route',       labelAr: 'في الطريق',     tone: 'warning' },
  DELIVERED:     { label: 'Delivered',      labelAr: 'تم التسليم',    tone: 'success' },
  CANCELLED:     { label: 'Cancelled',      labelAr: 'ملغي',          tone: 'danger' },
  FAILED:        { label: 'Failed',         labelAr: 'فشل التسليم',   tone: 'danger' },
};

export const SHOP_SUB_ORDER_STATUS_CONFIG: Record<
  ShopSubOrderStatus,
  StatusDisplayConfig
> = {
  PENDING:           { label: 'Pending',           labelAr: 'قيد الانتظار', tone: 'neutral' },
  PREPARING:         { label: 'Preparing',         labelAr: 'قيد التحضير',  tone: 'warning' },
  AT_HUB:            { label: 'At Hub',            labelAr: 'وصل الهب',     tone: 'info' },
  VERIFIED:          { label: 'Verified',          labelAr: 'تم التحقق',    tone: 'success' },
  HANDED_TO_DRIVER:  { label: 'Handed to Driver',  labelAr: 'سُلم للسائق',  tone: 'primary' },
};

export const DISPATCH_OFFER_STATUS_CONFIG: Record<
  DispatchOfferStatus,
  StatusDisplayConfig
> = {
  NONE:      { label: 'Not Offered', labelAr: 'لم يُعرض',     tone: 'neutral' },
  OFFERED:   { label: 'Offered',     labelAr: 'معروض',        tone: 'warning' },
  ACCEPTED:  { label: 'Accepted',    labelAr: 'مقبول',        tone: 'success' },
  DECLINED:  { label: 'Declined',    labelAr: 'مرفوض',        tone: 'danger' },
  EXPIRED:   { label: 'Expired',     labelAr: 'منتهي',        tone: 'neutral' },
  CANCELLED: { label: 'Cancelled',   labelAr: 'ملغي',         tone: 'danger' },
};
