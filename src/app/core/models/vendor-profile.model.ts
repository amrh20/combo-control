import { VendorDiscountBadge } from './vendor.model';

export type LiveStatus = 'open' | 'busy' | 'closed';
export type LiveStatusOverride = 'auto' | 'force_busy' | 'force_closed';
export type SystemStatus = 'active' | 'inactive';

export interface VendorStats {
  rating: number;
  totalReviews: number;
  totalCompletedOrders: number;
}

export interface VendorSettings {
  openingTime: string;
  closingTime: string;
  autoAccept: boolean;
}

/** WGS84 storefront pin. Must fall inside the assigned hub polygon. */
export interface VendorLocation {
  lat: number;
  lng: number;
}

export interface VendorProfile {
  id: string;
  name: string;
  phone: string;
  contactPerson: string;
  /** Id from VendorCategoryService (e.g. VC-001). */
  category: string;
  /** Display name from `GET /v1/vendors/{id}` when the category list is not loaded yet. */
  categoryName?: string;
  /** Hub this shop is physically assigned to. */
  hubId: string;
  hubName: string;
  /** Storefront coordinate inside `hubId`'s polygon. */
  location: VendorLocation;
  logoUrl?: string;
  systemStatus: SystemStatus;
  liveStatusOverride: LiveStatusOverride;
  liveStatus: LiveStatus;
  /** Shown when closed outside hours — e.g. "17:00" */
  nextOpeningTime?: string;
  settings: VendorSettings;
  /** Cart value floor. Delivery price is calculated separately. */
  minOrder: number;
  discountPercent: number;
  /** Percent derived from `commissionBp` (`commissionBp / 100`). */
  commissionRate: number;
  /** Integer basis points from `GET /v1/vendors/{id}`. `1500` is 15%. */
  commissionBp: number;
  /** Integer piastres from `GET /v1/vendors/{id}`. Divide by 100 for EGP. */
  walletBalance: number;
  /** `null` when the vendor has no ratings yet. */
  ratingsScore: number | null;
  ratingsCount: number;
  completedOrders: number;
  /** `null` hides the storefront discount chip. */
  discountBadge: VendorDiscountBadge | null;
  /** When true, shop staff can sign in to combo-vendor. */
  usesStoreApp: boolean;
  /** When true, shop staff can add and edit products from combo-vendor. */
  canEditCatalog: boolean;
  stats: VendorStats;
}
