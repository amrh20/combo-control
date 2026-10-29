import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ChartModule } from 'primeng/chart';
import { take } from 'rxjs';
import { AnalyticsKpis, DailyBreakdownPoint } from '../../core/models/analytics.model';
import { AnalyticsService } from '../../core/services/analytics.service';
import { VendorService } from '../../core/services/vendor.service';

export type ReportPeriod = 'daily' | 'monthly' | 'yearly';

interface StoreOption {
  id: string;
  name: string;
}

@Component({
  selector: 'ctrl-analytics',
  standalone: true,
  imports: [DecimalPipe, ChartModule],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss',
})
export class AnalyticsComponent implements OnInit {
  private readonly analytics = inject(AnalyticsService);
  private readonly vendorsApi = inject(VendorService);

  readonly periods: ReadonlyArray<{ id: ReportPeriod; label: string }> = [
    { id: 'daily', label: 'يومي' },
    { id: 'monthly', label: 'شهري' },
    { id: 'yearly', label: 'سنوي' },
  ];

  readonly chartOptions = {
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: {
        ticks: { maxRotation: 0, autoSkip: true, color: '#6b7280' },
        grid: { display: false },
      },
      y: {
        beginAtZero: true,
        ticks: { color: '#6b7280' },
        grid: { color: '#f3f4f6' },
      },
    },
  };

  readonly stores = signal<StoreOption[]>([]);
  readonly vendorId = signal('');
  readonly period = signal<ReportPeriod>('monthly');
  readonly kpis = signal<AnalyticsKpis>({
    totalOrders: 0,
    netSales: 0,
    totalSales: 0,
    deliveryFees: 0,
    serviceFees: 0,
    activeStores: 0,
    avgDeliveryTime: 0,
  });
  readonly breakdown = signal<DailyBreakdownPoint[]>([]);
  readonly reportSales = signal(0);
  readonly reportOrders = signal(0);
  readonly reportAverage = signal(0);
  readonly reportStoreName = signal<string | null>(null);
  readonly loadingReport = signal(false);
  readonly reportError = signal('');

  readonly periodLabel = computed(
    () => this.periods.find((option) => option.id === this.period())?.label ?? '',
  );

  readonly selectedStoreName = computed(() => {
    const id = this.vendorId();
    if (!id) {
      return this.reportStoreName() ?? 'كل المتاجر';
    }
    return this.stores().find((store) => store.id === id)?.name ?? this.reportStoreName() ?? '';
  });

  readonly breakdownTitle = computed(() => {
    switch (this.period()) {
      case 'daily':
        return 'تفصيل اليوم';
      case 'yearly':
        return 'تفصيل السنة حسب اليوم';
      default:
        return 'تفصيل الشهر حسب اليوم';
    }
  });

  readonly chartData = computed(() => {
    const rows = this.breakdown();
    return {
      labels: rows.map((row) => formatBreakdownDate(row.date)),
      datasets: [
        {
          label: 'المبيعات',
          data: rows.map((row) => row.salesValue),
          backgroundColor: '#111827',
          borderRadius: 4,
          maxBarThickness: 28,
        },
      ],
    };
  });

  ngOnInit(): void {
    this.analytics.getKpis().pipe(take(1)).subscribe({
      next: (kpis) => this.kpis.set(kpis),
    });
    this.vendorsApi.getVendors({ limit: 100 }).pipe(take(1)).subscribe({
      next: (page) => {
        this.stores.set(page.items.map((item) => ({ id: item.id, name: item.name })));
      },
    });
    this.loadReport();
  }

  onVendorChange(event: Event): void {
    this.vendorId.set((event.target as HTMLSelectElement).value);
    this.loadReport();
  }

  onPeriodChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'daily' || value === 'monthly' || value === 'yearly') {
      this.period.set(value);
      this.loadReport();
    }
  }

  exportReport(): void {
    const rows = this.breakdown();
    const lines = [
      ['المتجر', this.selectedStoreName()],
      ['الفترة', this.periodLabel()],
      ['إجمالي المبيعات (ج.م)', String(this.reportSales())],
      ['عدد الطلبات الناجحة', String(this.reportOrders())],
      ['متوسط قيمة الطلب (ج.م)', this.reportAverage().toFixed(2)],
      [],
      ['التاريخ', 'عدد الطلبات', 'المبيعات (ج.م)'],
      ...rows.map((row) => [row.date, String(row.orderCount), String(row.salesValue)]),
    ];
    const csv = `\uFEFF${lines.map((line) => line.join(',')).join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vendor-report-${this.vendorId() || 'all'}-${this.period()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  private loadReport(): void {
    const range = rangeForPeriod(this.period());
    const storeId = this.vendorId().trim();
    this.loadingReport.set(true);
    this.reportError.set('');
    this.analytics
      .getStoresReport({
        storeId: storeId || undefined,
        period: this.period(),
        from: range.from,
        to: range.to,
      })
      .pipe(take(1))
      .subscribe({
        next: (report) => {
          this.breakdown.set(report.dailyBreakdown);
          this.reportSales.set(report.totalSales);
          this.reportOrders.set(report.totalOrders);
          this.reportAverage.set(report.averageOrderValue);
          this.reportStoreName.set(report.storeName);
          this.loadingReport.set(false);
        },
        error: () => {
          this.breakdown.set([]);
          this.reportSales.set(0);
          this.reportOrders.set(0);
          this.reportAverage.set(0);
          this.loadingReport.set(false);
          this.reportError.set('تعذر تحميل تقرير المتاجر.');
        },
      });
  }
}

function rangeForPeriod(period: ReportPeriod): { from: string; to: string } {
  const now = new Date();
  if (period === 'daily') {
    const day = isoDate(now);
    return { from: day, to: day };
  }
  if (period === 'yearly') {
    return {
      from: isoDate(new Date(now.getFullYear(), 0, 1)),
      to: isoDate(new Date(now.getFullYear(), 11, 31)),
    };
  }
  return {
    from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatBreakdownDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    return value;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short' }).format(date);
}
