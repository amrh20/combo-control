/** Discount coupon returned by `GET /v1/coupons`. */
export interface Coupon {
  id: string;
  code: string;
  /** Percentage off the order, from 1 to 100. */
  discountPercent: number;
  /** Cap on the discount, in EGP. */
  maxDiscountAmount: number;
  /** Smallest order total the coupon applies to, in EGP. */
  minOrderValue: number;
  /** Calendar date `YYYY-MM-DD`, or null when the coupon does not expire. */
  expiresAt: string | null;
  usageLimit: number;
  usedCount: number;
  isActive: boolean;
}

/** Body for `POST /v1/coupons` and `PATCH /v1/coupons/{id}`. */
export interface CouponInput {
  code: string;
  discountPercent: number;
  maxDiscountAmount: number;
  minOrderValue: number;
  expiresAt: string | null;
  usageLimit: number;
  isActive: boolean;
}

/** Loose API row. The service accepts camelCase and snake_case fields. */
export interface CouponApiRecord {
  id?: string;
  code?: string;
  discountPercent?: number | string | null;
  discount_percent?: number | string | null;
  discountPercentage?: number | string | null;
  maxDiscountAmount?: number | string | null;
  max_discount_amount?: number | string | null;
  minOrderValue?: number | string | null;
  min_order_value?: number | string | null;
  expiresAt?: string | null;
  expires_at?: string | null;
  expiryDate?: string | null;
  expiry_date?: string | null;
  usageLimit?: number | string | null;
  usage_limit?: number | string | null;
  usedCount?: number | string | null;
  used_count?: number | string | null;
  timesUsed?: number | string | null;
  isActive?: boolean | number | string | null;
  is_active?: boolean | number | string | null;
}
