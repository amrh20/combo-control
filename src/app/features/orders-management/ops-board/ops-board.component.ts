import { Component, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ComboInputComponent } from '../../../shared/components/combo-input/combo-input.component';
import { OrderDetailsComponent } from '../../orders/order-details/order-details.component';
import {
  CanonicalOrder,
  CanonicalOrderStatus,
  CANONICAL_ORDER_STATUS_CONFIG,
} from '../../../core/models/canonical-order.model';
import { CanonicalOrderService } from '../../../core/services/canonical-order.service';
import {
  ACTIVE_CANONICAL_STATUSES,
  formatCanonicalOrderAge,
  matchesCanonicalOrderSearch,
} from '../../../core/mocks/canonical-order.mock';

interface StatusGroup {
  status: CanonicalOrderStatus;
  label: string;
  orders: CanonicalOrder[];
}

@Component({
  selector: 'ctrl-ops-board',
  standalone: true,
  imports: [DecimalPipe, ComboInputComponent, OrderDetailsComponent],
  templateUrl: './ops-board.component.html',
  styleUrl: './ops-board.component.scss',
})
export class OpsBoardComponent {
  private readonly orderService = inject(CanonicalOrderService);

  readonly statusConfig = CANONICAL_ORDER_STATUS_CONFIG;
  readonly currency = 'EGP';

  readonly searchQuery = signal('');
  readonly selectedOrderId = signal<string | null>(null);

  readonly activeOrders = computed(() =>
    this.orderService
      .orders()
      .filter((o) => ACTIVE_CANONICAL_STATUSES.includes(o.status)),
  );

  readonly filteredActiveOrders = computed(() => {
    const query = this.searchQuery();
    return this.activeOrders().filter((o) =>
      matchesCanonicalOrderSearch(o, query),
    );
  });

  readonly groupedOrders = computed((): StatusGroup[] => {
    const active = this.filteredActiveOrders();
    return ACTIVE_CANONICAL_STATUSES.map((status) => ({
      status,
      label: CANONICAL_ORDER_STATUS_CONFIG[status].labelAr,
      orders: active.filter((o) => o.status === status),
    })).filter((g) => g.orders.length > 0);
  });

  readonly selectedOrder = computed(() => {
    const id = this.selectedOrderId();
    return id ? this.orderService.getById(id) : null;
  });

  readonly formatAge = formatCanonicalOrderAge;

  constructor() {
    effect(() => {
      const filtered = this.filteredActiveOrders();
      const currentId = this.selectedOrderId();

      if (!filtered.length) {
        this.selectedOrderId.set(null);
        return;
      }

      if (!currentId || !filtered.some((o) => o.id === currentId)) {
        this.selectedOrderId.set(filtered[0].id);
      }
    });
  }

  onSearchChange(value: string): void {
    this.searchQuery.set(value);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  selectOrder(orderId: string): void {
    this.selectedOrderId.set(orderId);
  }
}
