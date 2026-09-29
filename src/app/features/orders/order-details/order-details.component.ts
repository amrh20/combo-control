import { Component, computed, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import {
  AssignableDriver,
  CANONICAL_ORDER_STATUS_CONFIG,
  DISPATCH_OFFER_STATUS_CONFIG,
  OrderLineItem,
  SHOP_SUB_ORDER_STATUS_CONFIG,
} from '../../../core/models/canonical-order.model';
import { CanonicalOrderService } from '../../../core/services/canonical-order.service';
import { CANONICAL_ORDER_MOCK } from '../../../core/mocks/canonical-order.mock';

/** Mock pool of available captains for Phase-1 dispatch UX. */
const MOCK_AVAILABLE_DRIVERS: AssignableDriver[] = [
  {
    id: 'drv_sayed_ali',
    name: 'كابتن/ سيد علي',
    phone: '+20 100 111 2233',
  },
  {
    id: 'drv_mahmoud_hassan',
    name: 'كابتن/ محمود حسن',
    phone: '+20 122 444 5566',
  },
];

@Component({
  selector: 'ctrl-order-details',
  standalone: true,
  imports: [NgClass, DatePipe, DecimalPipe, FormsModule, RouterLink],
  templateUrl: './order-details.component.html',
  styleUrl: './order-details.component.scss',
  host: {
    class: 'order-details-host',
    '[class.order-details-host--embedded]': 'embedded()',
  },
})
export class OrderDetailsComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly orderService = inject(CanonicalOrderService);

  /**
   * When set (e.g. from Ops Board), resolves the order by id and
   * takes precedence over the route param.
   */
  readonly orderId = input<string | null>(null);

  /** Hide standalone chrome (back link) when nested in the Live Board. */
  readonly embedded = input(false);

  readonly orderStatusConfig = CANONICAL_ORDER_STATUS_CONFIG;
  readonly subOrderStatusConfig = SHOP_SUB_ORDER_STATUS_CONFIG;
  readonly dispatchOfferConfig = DISPATCH_OFFER_STATUS_CONFIG;
  readonly availableDrivers = MOCK_AVAILABLE_DRIVERS;

  /** Phase 0 seed id — used when navigating without a param match. */
  readonly seedOrderId = CANONICAL_ORDER_MOCK.id;

  private readonly routeId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('id'))),
    { initialValue: null as string | null },
  );

  /** Inline qty editor state. */
  readonly editingItemId = signal<string | null>(null);
  editQuantity = 1;

  /** Whether the assign-driver modal is open. */
  readonly isDriverModalOpen = signal(false);

  readonly resolvedOrderId = computed(() => {
    const inputId = this.orderId();
    if (inputId) {
      return inputId;
    }
    const id = this.routeId();
    if (id) {
      return id;
    }
    return this.embedded() ? null : this.seedOrderId;
  });

  /**
   * Reactive order from CanonicalOrderService.
   * Depends on `orders()` so item mutations re-render financials instantly.
   */
  readonly order = computed(() => {
    // Establish signal dependency on the live store.
    this.orderService.orders();
    const id = this.resolvedOrderId();
    return id ? this.orderService.getById(id) : null;
  });

  readonly consolidationProgress = computed(() => {
    const o = this.order();
    if (!o) {
      return { verified: 0, total: 0, percent: 0 };
    }
    const total = o.subOrders.length;
    const verified = o.subOrders.filter(
      (s) => s.status === 'VERIFIED' || s.status === 'HANDED_TO_DRIVER',
    ).length;
    return {
      verified,
      total,
      percent: total === 0 ? 0 : Math.round((verified / total) * 100),
    };
  });

  readonly itemCount = computed(() => {
    const o = this.order();
    if (!o) {
      return 0;
    }
    return o.subOrders.reduce(
      (sum, sub) => sum + sub.items.reduce((n, item) => n + item.quantity, 0),
      0,
    );
  });

  readonly canAssignDriver = computed(
    () => this.order()?.status === 'READY_AT_HUB',
  );

  readonly hasAssignedDriver = computed(() => {
    const dispatch = this.order()?.dispatch;
    return Boolean(dispatch?.assignedDriverId && dispatch?.assignedDriverName);
  });

  goBack(): void {
    void this.router.navigate(['/orders']);
  }

  formatAddress(order = this.order()): string {
    if (!order) {
      return '';
    }
    const a = order.customer.address;
    const parts = [
      a.street,
      `مبنى ${a.building}`,
      a.floor ? `دور ${a.floor}` : null,
      a.apartment ? `شقة ${a.apartment}` : null,
      a.area,
      a.city,
      a.governorate,
    ].filter(Boolean);
    return parts.join('، ');
  }

  isEditing(itemId: string): boolean {
    return this.editingItemId() === itemId;
  }

  startEdit(item: OrderLineItem): void {
    this.editingItemId.set(item.id);
    this.editQuantity = item.quantity;
  }

  cancelEdit(): void {
    this.editingItemId.set(null);
  }

  saveEdit(shopId: string, itemId: string): void {
    const order = this.order();
    if (!order) {
      return;
    }

    this.orderService.updateItemQuantity(
      order.id,
      shopId,
      itemId,
      this.editQuantity,
    );
    this.editingItemId.set(null);
  }

  removeItem(shopId: string, itemId: string): void {
    const order = this.order();
    if (!order) {
      return;
    }

    const shop = order.subOrders.find((s) => s.shopId === shopId);
    const label = shop?.shopNameAr || shop?.shopName || shopId;

    const shopEmpty = this.orderService.removeItem(order.id, shopId, itemId);
    if (this.editingItemId() === itemId) {
      this.editingItemId.set(null);
    }

    if (!shopEmpty) {
      return;
    }

    const drop = window.confirm(
      `لم يتبقَ منتجات في «${label}». هل تريد إزالة طلب هذا المتجر من الطلب؟`,
    );
    if (drop) {
      this.orderService.removeSubOrder(order.id, shopId);
    }
  }

  dropSubOrder(shopId: string): void {
    const order = this.order();
    if (!order) {
      return;
    }
    this.orderService.removeSubOrder(order.id, shopId);
  }

  openDriverModal(): void {
    this.isDriverModalOpen.set(true);
  }

  closeDriverModal(): void {
    this.isDriverModalOpen.set(false);
  }

  selectDriver(driver: AssignableDriver): void {
    const order = this.order();
    if (!order || order.status !== 'READY_AT_HUB') {
      return;
    }

    this.orderService.assignDriver(order.id, driver);
    this.isDriverModalOpen.set(false);
  }

  paymentMethodLabel(method: 'COD' | 'CARD' | 'WALLET'): string {
    switch (method) {
      case 'COD':
        return 'الدفع عند الاستلام';
      case 'CARD':
        return 'بطاقة';
      case 'WALLET':
        return 'محفظة';
    }
  }
}
