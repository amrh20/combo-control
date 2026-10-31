import type { VendorApiLiveStatus } from './vendor.model';

/** `GET /v1/ops/hubs` — active hubs only. */
export interface OpsOrderingHub {
  id: string;
  name: string;
  servingSubZoneIds: string[];
}

/** `GET /v1/ops/sub-zones` */
export interface OpsOrderingSubZone {
  id: string;
  name: string;
  zoneId: string;
  zoneName: string;
  minOrderPiastres: number;
  hubIds: string[];
  baseDeliveryFeePiastres: number;
  extraShopFeePiastres: number;
  baseServiceFeePiastres: number;
  extraShopServiceFeePiastres: number;
}

/** `GET /v1/ops/vendors?hubId=` */
export interface OpsOrderingVendor {
  id: string;
  name: string;
  hubId: string;
  logoUrl: string | null;
  liveStatus: VendorApiLiveStatus;
  discountBp: number;
  commissionBp: number;
}

export type OpsCustomerAccountStatus = 'ACTIVE' | 'BLOCKED';

/** `GET /v1/ops/customers/search?phone=` */
export interface OpsCustomerSearchResult {
  id: string;
  name: string;
  phone: string;
  status: OpsCustomerAccountStatus;
  addresses: OpsCustomerSavedAddress[];
}

/** Saved address on customer search. `line` fills the drop-off field. */
export interface OpsCustomerSavedAddress {
  id: string;
  label: string | null;
  subZoneId: string | null;
  line: string;
  isDefault: boolean;
}

export interface OpsCatalogOption {
  id: string;
  label: string;
  priceDeltaPiastres: number;
}

export interface OpsCatalogVariant {
  id: string;
  name: string;
  options: OpsCatalogOption[];
}

/** Row from `GET /v1/ops/vendors/{vendorId}/products`. */
export interface OpsCatalogProduct {
  id: string;
  name: string;
  pricePiastres: number;
  variants: OpsCatalogVariant[];
}

/** Base catalog price plus deltas for the chosen option in each variant group. */
export function catalogUnitPricePiastres(
  product: OpsCatalogProduct,
  optionIdByVariantId: Record<string, string>,
): number {
  const optionDelta = product.variants.reduce((sum, variant) => {
    const pickedId = optionIdByVariantId[variant.id];
    const picked = variant.options.find((option) => option.id === pickedId);
    return sum + (picked?.priceDeltaPiastres ?? 0);
  }, 0);
  return product.pricePiastres + optionDelta;
}

/** Label for variant pickers when the product has a single option group. */
export function catalogVariantFieldLabel(
  product: OpsCatalogProduct,
  variant: OpsCatalogVariant,
): string {
  const withOptions = product.variants.filter((row) => row.options.length > 0);
  if (withOptions.length === 1 && withOptions[0].id === variant.id) {
    return 'النوع/الحجم';
  }
  return variant.name;
}

/** Primary variant/option ids when the catalog defines exactly one option group. */
export function catalogPrimaryVariantSelection(
  product: OpsCatalogProduct,
  optionIdByVariantId: Record<string, string>,
): { variantId: string; optionId: string } | null {
  const withOptions = product.variants.filter((row) => row.options.length > 0);
  if (withOptions.length !== 1) {
    return null;
  }
  const variantId = withOptions[0].id;
  const optionId = optionIdByVariantId[variantId];
  if (!optionId) {
    return null;
  }
  return { variantId, optionId };
}

export interface OpsPlaceOrderItem {
  productId: string;
  vendorId: string;
  quantity: number;
  options: string[];
}

export interface OpsPlaceOrderPayload {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  dropOffAddress: string;
  subZoneId: string;
  hubId: string;
  items: OpsPlaceOrderItem[];
}

export interface OpsPlaceOrderResponse {
  id: string;
  orderNumber: string;
}

export type CartProblemCode =
  | 'ADDRESS_NOT_SERVED'
  | 'PRODUCT_NOT_FOUND'
  | 'PRODUCT_UNAVAILABLE'
  | 'INVALID_OPTIONS'
  | 'SHOP_CLOSED'
  | 'SHOP_NOT_SERVING_ADDRESS'
  | 'MULTIPLE_HUBS'
  | 'SHOP_BELOW_MINIMUM'
  | 'BELOW_MINIMUM'
  | 'VENDOR_MISMATCH';

export interface CartProblem {
  code: CartProblemCode | string;
  message?: string;
  vendorId?: string;
  productId?: string;
  itemId?: string;
  missingPiastres?: number;
}
