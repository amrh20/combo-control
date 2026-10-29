import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import {
  AnalyticsKpis,
  DailyBreakdownPoint,
  StoreReport,
  StoreReportQuery,
} from '../models/analytics.model';
import { piastresToEgp } from '../models/zone.model';

const KPIS_URL = `${API_BASE_URL}/v1/ops/analytics/kpis`;
const STORES_REPORT_URL = `${API_BASE_URL}/v1/ops/analytics/stores-report`;

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly http = inject(HttpClient);

  /** `GET /v1/ops/analytics/kpis` */
  getKpis(): Observable<AnalyticsKpis> {
    return this.http.get<unknown>(KPIS_URL).pipe(map(toKpis));
  }

  /**
   * `GET /v1/ops/analytics/stores-report`.
   * Omit `storeId` for every store. `from` / `to` are `YYYY-MM-DD`.
   */
  getStoresReport(query: StoreReportQuery = {}): Observable<StoreReport> {
    let params = new HttpParams();
    const storeId = query.storeId?.trim() ?? '';
    const from = query.from?.trim() ?? '';
    const to = query.to?.trim() ?? '';
    if (storeId) {
      params = params.set('storeId', storeId);
    }
    if (from) {
      params = params.set('from', from);
    }
    if (to) {
      params = params.set('to', to);
    }
    if (query.period) {
      params = params.set('period', query.period);
    }
    return this.http.get<unknown>(STORES_REPORT_URL, { params }).pipe(map(toStoreReport));
  }
}

function toKpis(body: unknown): AnalyticsKpis {
  const record = asRecord(body);
  const netSales = piastresToEgp(
    numberField(record, 'netSales', 'net_sales', 'totalSales', 'total_sales', 'grossMerchandiseValue'),
  );
  return {
    totalOrders: numberField(record, 'totalOrders', 'total_orders'),
    netSales,
    totalSales: netSales,
    deliveryFees: piastresToEgp(numberField(record, 'deliveryFees', 'delivery_fees')),
    serviceFees: piastresToEgp(numberField(record, 'serviceFees', 'service_fees')),
    activeStores: numberField(record, 'activeStores', 'active_stores', 'activeVendors'),
    avgDeliveryTime: numberField(
      record,
      'avgDeliveryTimeMinutes',
      'avgDeliveryTime',
      'avg_delivery_time',
      'avgDeliveryMinutes',
    ),
  };
}

function toStoreReport(body: unknown): StoreReport {
  const record = asRecord(body);
  const breakdown = toBreakdown(record['dailyBreakdown'] ?? record['daily_breakdown']);
  const totalOrders =
    numberField(
      record,
      'successfulOrdersCount',
      'totalOrders',
      'total_orders',
      'orderCount',
    ) || breakdown.reduce((sum, row) => sum + row.orderCount, 0);
  const rawSales = numberField(record, 'totalStoreSales', 'totalSales', 'total_sales');
  const totalSales =
    rawSales > 0
      ? piastresToEgp(rawSales)
      : breakdown.reduce((sum, row) => sum + row.salesValue, 0);
  const reportedAverage = piastresToEgp(
    numberField(record, 'avgOrderValue', 'averageOrderValue', 'average_order_value'),
  );
  return {
    storeId: stringOrNull(record['storeId'] ?? record['store_id']),
    storeName: stringOrNull(record['storeName'] ?? record['store_name'] ?? record['name']),
    totalSales,
    totalOrders,
    averageOrderValue: reportedAverage || (totalOrders === 0 ? 0 : totalSales / totalOrders),
    dailyBreakdown: breakdown,
  };
}

function toBreakdown(value: unknown): DailyBreakdownPoint[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const row = asRecord(item);
    return {
      date: String(row['date'] ?? row['label'] ?? ''),
      salesValue: piastresToEgp(numberField(row, 'salesValue', 'sales_value', 'sales')),
      orderCount: numberField(row, 'orderCount', 'order_count', 'orders'),
    };
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function numberField(record: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return 0;
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
