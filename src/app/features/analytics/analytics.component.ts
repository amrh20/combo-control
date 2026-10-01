import { DecimalPipe } from '@angular/common';
import { Component, computed, signal } from '@angular/core';

export type ReportPeriod = 'daily' | 'monthly' | 'yearly';

export interface BreakdownRow {
  label: string;
  orders: number;
  sales: number;
}

interface VendorProfile {
  id: string;
  name: string;
  /** Typical orders in a busy hour. */
  orderBase: number;
  /** Typical ticket size in EGP. */
  ticket: number;
}

const VENDORS: readonly VendorProfile[] = [
  { id: 'fruit-market', name: 'سوق الفواكه', orderBase: 16, ticket: 155 },
  { id: 'spring-bakery', name: 'مخبز الربيع', orderBase: 24, ticket: 62 },
  { id: 'noor-grocery', name: 'بقالة النور', orderBase: 13, ticket: 220 },
  { id: 'morning-cafe', name: 'كافيه الصباح', orderBase: 11, ticket: 92 },
];

const MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
] as const;

const REPORTS = new Map<string, Record<ReportPeriod, readonly BreakdownRow[]>>(
  VENDORS.map((vendor) => [vendor.id, buildVendorReport(vendor)]),
);

@Component({
  selector: 'ctrl-analytics',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss',
})
export class AnalyticsComponent {
  readonly vendors = VENDORS;
  readonly periods: ReadonlyArray<{ id: ReportPeriod; label: string }> = [
    { id: 'daily', label: 'يومي' },
    { id: 'monthly', label: 'شهري' },
    { id: 'yearly', label: 'سنوي' },
  ];

  readonly totalOrders = 12480;
  readonly grossMerchandiseValue = 1842350;
  readonly activeVendors = 48;
  readonly avgDeliveryMinutes = 28;

  readonly vendorId = signal(VENDORS[0].id);
  readonly period = signal<ReportPeriod>('monthly');

  readonly selectedVendor = computed(
    () => VENDORS.find((vendor) => vendor.id === this.vendorId()) ?? VENDORS[0],
  );

  readonly periodLabel = computed(
    () => this.periods.find((option) => option.id === this.period())?.label ?? '',
  );

  readonly breakdownTitle = computed(() => {
    switch (this.period()) {
      case 'daily':
        return 'تفصيل اليوم حسب الساعة';
      case 'yearly':
        return 'تفصيل السنة حسب الشهر';
      default:
        return 'تفصيل الشهر حسب اليوم';
    }
  });

  readonly breakdown = computed(
    () => REPORTS.get(this.selectedVendor().id)?.[this.period()] ?? [],
  );

  readonly vendorSales = computed(() =>
    this.breakdown().reduce((sum, row) => sum + row.sales, 0),
  );

  readonly completedOrders = computed(() =>
    this.breakdown().reduce((sum, row) => sum + row.orders, 0),
  );

  readonly averageOrderValue = computed(() => {
    const orders = this.completedOrders();
    return orders === 0 ? 0 : this.vendorSales() / orders;
  });

  readonly peakSales = computed(() =>
    this.breakdown().reduce((peak, row) => Math.max(peak, row.sales), 0),
  );

  onVendorChange(event: Event): void {
    this.vendorId.set((event.target as HTMLSelectElement).value);
  }

  onPeriodChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'daily' || value === 'monthly' || value === 'yearly') {
      this.period.set(value);
    }
  }

  barHeight(row: BreakdownRow): number {
    const peak = this.peakSales();
    if (peak <= 0) {
      return 0;
    }
    return Math.max(6, Math.round((row.sales / peak) * 100));
  }

  exportReport(): void {
    const vendor = this.selectedVendor();
    const rows = this.breakdown();
    const lines = [
      ['المتجر', vendor.name],
      ['الفترة', this.periodLabel()],
      ['إجمالي المبيعات (ج.م)', String(this.vendorSales())],
      ['عدد الطلبات الناجحة', String(this.completedOrders())],
      ['متوسط قيمة الطلب (ج.م)', this.averageOrderValue().toFixed(2)],
      [],
      ['التاريخ', 'عدد الطلبات', 'المبيعات (ج.م)'],
      ...rows.map((row) => [row.label, String(row.orders), String(row.sales)]),
    ];
    const csv = `\uFEFF${lines.map((line) => line.join(',')).join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vendor-report-${vendor.id}-${this.period()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
}

function buildVendorReport(vendor: VendorProfile): Record<ReportPeriod, readonly BreakdownRow[]> {
  const rng = createRng(hashSeed(vendor.id));
  const amount = (base: number, spread: number): number => {
    const value = base * (1 - spread + rng() * spread * 2);
    return Math.max(1, Math.round(value));
  };

  const daily: BreakdownRow[] = [];
  for (let hour = 8; hour <= 22; hour++) {
    const busy = hour >= 12 && hour <= 21 ? 1.4 : 0.65;
    const orders = amount(vendor.orderBase * busy, 0.22);
    daily.push({
      label: `${String(hour).padStart(2, '0')}:00`,
      orders,
      sales: Math.round(orders * vendor.ticket * (0.88 + rng() * 0.24)),
    });
  }

  const monthly: BreakdownRow[] = [];
  for (let day = 1; day <= 31; day++) {
    const weekend = day % 7 === 5 || day % 7 === 6 ? 1.25 : 1;
    const orders = amount(vendor.orderBase * 11 * weekend, 0.28);
    monthly.push({
      label: `${day} أكتوبر`,
      orders,
      sales: Math.round(orders * vendor.ticket * (0.9 + rng() * 0.2)),
    });
  }

  const yearly: BreakdownRow[] = MONTHS.map((month, index) => {
    const season = index >= 5 && index <= 8 ? 1.18 : 1;
    const orders = amount(vendor.orderBase * 11 * 30 * season, 0.18);
    return {
      label: month,
      orders,
      sales: Math.round(orders * vendor.ticket * (0.9 + rng() * 0.18)),
    };
  });

  return { daily, monthly, yearly };
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
