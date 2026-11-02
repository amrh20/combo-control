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

/** Sellable SKU for a specific option permutation (`sku_mapping`: variant name → option label). */
export interface OpsCatalogCombination {
  skuMapping: Record<string, string>;
  pricePiastres: number;
  isAvailable: boolean;
  stockQuantity: number | null;
}

/** Row from `GET /v1/ops/vendors/{vendorId}/products`. */
export interface OpsCatalogProduct {
  id: string;
  name: string;
  pricePiastres: number;
  imageUrl: string | null;
  variants: OpsCatalogVariant[];
  combinations: OpsCatalogCombination[];
}

/** Selection map as variant name → option label for combination matching. */
export function catalogSelectionLabels(
  product: OpsCatalogProduct,
  optionIdByVariantId: Record<string, string>,
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const variant of product.variants) {
    if (variant.options.length === 0) {
      continue;
    }
    const optionId = optionIdByVariantId[variant.id];
    const option = variant.options.find((row) => row.id === optionId);
    if (option) {
      labels[variant.name] = option.label;
    }
  }
  return labels;
}

/** Exact SKU row whose `skuMapping` matches the current option selection. */
export function catalogMatchedCombination(
  product: OpsCatalogProduct,
  optionIdByVariantId: Record<string, string>,
): OpsCatalogCombination | null {
  if (product.combinations.length === 0) {
    return null;
  }
  const required = product.variants.filter((variant) => variant.options.length > 0);
  if (required.some((variant) => !optionIdByVariantId[variant.id])) {
    return null;
  }
  return (
    product.combinations.find((combo) =>
      combinationMatchesSelection(combo.skuMapping, product, optionIdByVariantId),
    ) ?? null
  );
}

function combinationMatchesSelection(
  skuMapping: Record<string, string>,
  product: OpsCatalogProduct,
  optionIdByVariantId: Record<string, string>,
): boolean {
  return product.variants
    .filter((variant) => variant.options.length > 0)
    .every((variant) => {
      const optionId = optionIdByVariantId[variant.id];
      const option = variant.options.find((row) => row.id === optionId);
      if (!option) {
        return false;
      }
      const mapped = skuMapping[variant.name] ?? skuMapping[variant.id];
      if (mapped === undefined) {
        return false;
      }
      return mapped === option.label || mapped === option.id;
    });
}

/** Combination price when matched; otherwise base + option deltas. */
export function catalogUnitPricePiastres(
  product: OpsCatalogProduct,
  optionIdByVariantId: Record<string, string>,
): number {
  const matched = catalogMatchedCombination(product, optionIdByVariantId);
  if (matched) {
    return matched.pricePiastres;
  }
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

/** `POST /v1/ops/orders/calculate` — amounts in piastres. */
export interface OpsOrderCalculateResponse {
  subtotalPiastres: number;
  deliveryFeePiastres: number;
  serviceFeePiastres: number;
  grandTotalPiastres: number;
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
