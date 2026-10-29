/** `GET /v1/ops/analytics/kpis` — money fields are EGP after mapping. */
export interface AnalyticsKpis {
  totalOrders: number;
  /** Shop merchandise on delivered orders. */
  netSales: number;
  /** Same as `netSales`. */
  totalSales: number;
  deliveryFees: number;
  serviceFees: number;
  activeStores: number;
  /** Minutes from order confirmation until delivery. */
  avgDeliveryTime: number;
}

export interface DailyBreakdownPoint {
  date: string;
  salesValue: number;
  orderCount: number;
}

/** `GET /v1/ops/analytics/stores-report` */
export interface StoreReport {
  storeId: string | null;
  storeName: string | null;
  totalSales: number;
  totalOrders: number;
  averageOrderValue: number;
  dailyBreakdown: DailyBreakdownPoint[];
}

export interface StoreReportQuery {
  /** Omit to aggregate every store. */
  storeId?: string;
  period?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** Inclusive range start, `YYYY-MM-DD`. */
  from?: string;
  /** Inclusive range end, `YYYY-MM-DD`. */
  to?: string;
}
