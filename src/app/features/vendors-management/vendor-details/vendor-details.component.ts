import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe, NgClass } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import {
  OpsOrderRow,
  SUB_ORDER_STATUS_CONFIG,
  SubOrderStatus,
  egpFromPiastres,
} from '../../../core/models/ops-order.model';
import { Permission } from '../../../core/models/permission.model';
import { AuthService } from '../../../core/services/auth.service';
import { HubService } from '../../../core/services/hub.service';
import { OpsOrderService } from '../../../core/services/ops-order.service';
import { categoryIconSrc, VendorCategoryService } from '../../../core/services/vendor-category.service';
import { VendorService, vendorErrorMessage } from '../../../core/services/vendor.service';
import {
  getEffectiveLiveStatus,
  getVendorInitials,
  LIVE_OVERRIDE_CONFIG,
  LIVE_STATUS_CONFIG,
  VendorProfile,
} from '../data/vendors.mock';

const ORDERS_PAGE_SIZE = 20;

@Component({
  selector: 'ctrl-vendor-details',
  standalone: true,
  imports: [NgClass, DatePipe, DecimalPipe, RouterLink, TableModule, StatCardComponent],
  templateUrl: './vendor-details.component.html',
  styleUrl: './vendor-details.component.scss',
})
export class VendorDetailsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly categoryService = inject(VendorCategoryService);
  private readonly hubService = inject(HubService);
  private readonly vendorService = inject(VendorService);
  private readonly ordersApi = inject(OpsOrderService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly orders = signal<OpsOrderRow[]>([]);
  readonly ordersLoading = signal(false);
  readonly ordersError = signal<string | null>(null);
  readonly ordersNextCursor = signal<string | null>(null);
  private readonly ordersCursor = signal<string | undefined>(undefined);
  private readonly ordersBackStack = signal<(string | undefined)[]>([]);
  private ordersRequest = 0;

  readonly liveStatusConfig = LIVE_STATUS_CONFIG;
  readonly liveOverrideConfig = LIVE_OVERRIDE_CONFIG;
  readonly subOrderStatusConfig = SUB_ORDER_STATUS_CONFIG;
  readonly currency = 'ج.م';
  readonly canReadOrders = computed(() => this.auth.hasPermission(Permission.OrdersRead));
  readonly ordersPageNumber = computed(() => this.ordersBackStack().length + 1);

  private readonly vendorSignal = signal<VendorProfile | null>(null);
  readonly vendor = this.vendorSignal.asReadonly();

  readonly liveStatus = computed(() => {
    const v = this.vendor();
    return v ? getEffectiveLiveStatus(v) : 'closed';
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/vendors']);
      return;
    }
    this.vendorService
      .getCategories()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
    this.loadVendor(id);
  }

  getInitials(name: string): string {
    return getVendorInitials(name);
  }

  categoryName(categoryId: string): string {
    return (
      this.categoryService.nameOf(categoryId) ||
      this.vendor()?.categoryName ||
      '—'
    );
  }

  hubName(hubId: string): string {
    return this.hubService.nameOf(hubId) || '—';
  }

  logoSrc(url: string): string {
    return categoryIconSrc(url);
  }

  ratingLabel(score: number | null | undefined): string {
    if (score === null || score === undefined || Number.isNaN(score)) {
      return 'لا يوجد';
    }
    return score.toFixed(2);
  }

  goBack(): void {
    this.router.navigate(['/vendors']);
  }

  orderTotal(order: OpsOrderRow): number {
    return egpFromPiastres(order.subOrderTotal ?? 0);
  }

  shopStatusLabel(status: SubOrderStatus | null | undefined): string {
    if (!status || !(status in this.subOrderStatusConfig)) {
      return '—';
    }
    return this.subOrderStatusConfig[status].labelAr;
  }

  shopStatusTone(status: SubOrderStatus | null | undefined): string {
    if (!status || !(status in this.subOrderStatusConfig)) {
      return 'neutral';
    }
    return this.subOrderStatusConfig[status].tone;
  }

  openOrder(orderId: string): void {
    void this.router.navigate(['/orders', orderId]);
  }

  reloadOrders(): void {
    const vendorId = this.vendor()?.id;
    if (!vendorId) {
      return;
    }
    this.loadOrders(vendorId, this.ordersCursor());
  }

  ordersNext(): void {
    const vendorId = this.vendor()?.id;
    const next = this.ordersNextCursor();
    if (!vendorId || !next || this.ordersLoading()) {
      return;
    }
    this.ordersBackStack.update((stack) => [...stack, this.ordersCursor()]);
    this.ordersCursor.set(next);
    this.loadOrders(vendorId, next);
  }

  ordersPrevious(): void {
    const vendorId = this.vendor()?.id;
    const stack = this.ordersBackStack();
    if (!vendorId || stack.length === 0 || this.ordersLoading()) {
      return;
    }
    const previous = stack[stack.length - 1];
    this.ordersBackStack.set(stack.slice(0, -1));
    this.ordersCursor.set(previous);
    this.loadOrders(vendorId, previous);
  }

  private loadVendor(id: string): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.vendorService
      .getVendorById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (found) => {
          this.loading.set(false);
          this.vendorSignal.set(structuredClone(found));
          this.ordersCursor.set(undefined);
          this.ordersBackStack.set([]);
          this.loadOrders(found.id);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.vendorSignal.set(null);
          this.orders.set([]);
          this.loadError.set(vendorErrorMessage(error, 'تعذر تحميل المتجر.'));
        },
      });
  }

  private loadOrders(vendorId: string, cursor?: string): void {
    if (!this.canReadOrders()) {
      return;
    }
    const request = ++this.ordersRequest;
    this.ordersLoading.set(true);
    this.ordersError.set(null);
    this.ordersApi
      .listOrders({ vendorId, cursor, limit: ORDERS_PAGE_SIZE })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          if (request !== this.ordersRequest) {
            return;
          }
          this.orders.set(page.items);
          this.ordersNextCursor.set(page.nextCursor);
          this.ordersLoading.set(false);
        },
        error: () => {
          if (request !== this.ordersRequest) {
            return;
          }
          this.orders.set([]);
          this.ordersNextCursor.set(null);
          this.ordersLoading.set(false);
          this.ordersError.set('تعذر تحميل سجل الطلبات.');
        },
      });
  }
}
