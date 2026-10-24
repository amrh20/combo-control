/** Values sent by `POST /v1/vendors` for `liveStatusOverride`. */
export type VendorLiveStatusOverride = 'AUTO' | 'FORCE_BUSY' | 'FORCE_CLOSED';

/** `POST /v1/vendor-categories` */
export interface CreateVendorCategoryPayload {
  name: string;
  icon: string;
  backgroundColor: string;
  sortOrder: number;
  isActive: boolean;
}

/** `PATCH /v1/vendor-categories/{id}` */
export interface UpdateVendorCategoryPayload {
  name: string;
  backgroundColor: string;
  icon: string;
}

/** Category row from `GET` / `POST /v1/vendor-categories`. */
export interface VendorCategoryApiRecord {
  id: string;
  name: string;
  /** Uploaded image URL. Some responses use `iconUrl` instead. */
  icon?: string;
  iconUrl?: string;
  backgroundColor: string;
  sortOrder?: number;
  isActive: boolean;
}

export interface VendorHour {
  weekday: number;
  opens: string;
  closes: string;
}

/** `POST /v1/vendors` */
export interface CreateVendorPayload {
  name: string;
  phone: string;
  contactPerson: string;
  categoryId: string;
  hubId: string;
  location: { lat: number; lng: number };
  /** `null` when the vendor has no logo. */
  logoUrl: string | null;
  isActive: boolean;
  liveStatusOverride: VendorLiveStatusOverride;
  autoAccept: boolean;
  minOrderPiastres: number;
  discountBp: number;
  commissionBp: number;
  hours: VendorHour[];
}

/** `PATCH /v1/vendors/{id}`. Omitted fields are left unchanged. */
export type UpdateVendorPayload = Partial<CreateVendorPayload>;

/** Promo chip returned by `GET /v1/vendors/{id}`. `null` means the badge is hidden. */
export interface VendorDiscountBadge {
  discountBp: number;
  label: string;
}

/** `GET /v1/vendors` live status. */
export type VendorApiLiveStatus = 'OPEN' | 'BUSY' | 'CLOSED';

export function isVendorLiveStatus(value: string | null | undefined): value is VendorApiLiveStatus {
  return value === 'OPEN' || value === 'BUSY' || value === 'CLOSED';
}

/** Query string for `GET /v1/vendors`. Blank values are omitted. */
export interface VendorListFilters {
  categoryId?: string;
  hubId?: string;
  liveStatus?: VendorApiLiveStatus;
  search?: string;
  cursor?: string;
  limit?: number;
}

/** One row from `GET /v1/vendors`. */
export interface VendorListItem {
  id: string;
  name: string;
  categoryName: string;
  /** Category tile color from the list row, when the API sends it. */
  backgroundColor: string | null;
  /** Category icon path or emoji from the list row, when the API sends it. */
  icon: string | null;
  hubName: string;
  liveStatus: VendorApiLiveStatus;
  nextOpenAt: string | null;
  isActive: boolean;
  logoUrl: string | null;
}

/** `GET /v1/vendors` cursor page. */
export interface VendorListPage {
  items: VendorListItem[];
  nextCursor: string | null;
}

/** Created vendor. Fields fall back to the request when the response is partial. */
export interface VendorApiRecord {
  id?: string;
  name?: string;
  phone?: string;
  contactPerson?: string;
  categoryId?: string;
  hubId?: string;
  location?: { lat: number; lng: number };
  logoUrl?: string | null;
  isActive?: boolean;
  liveStatusOverride?: VendorLiveStatusOverride;
  autoAccept?: boolean;
  minOrderPiastres?: number;
  discountBp?: number;
  /** 1% = 100 basis points. `1500` is 15%. */
  commissionBp?: number;
  /** Integer piastres. Divide by 100 for EGP. */
  walletBalance?: number;
  /**
   * Mean score from `GET /v1/vendors/{id}` (`ratingScore`). `null` when `ratingsCount` is 0.
   * `ratingsScore` is accepted only as a fallback if a payload already uses the UI name.
   */
  ratingScore?: number | null;
  ratingsScore?: number | null;
  ratingsCount?: number;
  completedOrders?: number;
  discountBadge?: VendorDiscountBadge | null;
  hours?: VendorHour[];
  liveStatus?: string | null;
  nextOpenAt?: string | null;
  categoryName?: string | null;
  hubName?: string | null;
}

/** 1% = 100 basis points. */
export function percentToBasisPoints(percent: number): number {
  return Math.round(percent * 100);
}

export function basisPointsToPercent(basisPoints: number): number {
  return basisPoints / 100;
}
