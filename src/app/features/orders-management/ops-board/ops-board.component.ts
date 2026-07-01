import { Component, computed, effect, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ComboInputComponent } from '../../../shared/components/combo-input/combo-input.component';
import { OrderActionPanelComponent } from '../order-action-panel/order-action-panel.component';
import {
  ACTIVE_ORDER_STATUSES,
  calcOrderTotal,
  formatOrderAge,
  getDriversForZone,
  LiveOrder,
  matchesOrderSearch,
  ORDER_CURRENCY,
  ORDER_STATUS_CONFIG,
  ORDERS_DATA,
  OrderStatus,
} from '../data/orders.mock';

interface StatusGroup {
  status: OrderStatus;
  label: string;
  orders: LiveOrder[];
}

@Component({
  selector: 'ctrl-ops-board',
  standalone: true,
  imports: [DecimalPipe, ComboInputComponent, OrderActionPanelComponent],
  templateUrl: './ops-board.component.html',
  styleUrl: './ops-board.component.scss',
})
export class OpsBoardComponent {
  readonly statusConfig = ORDER_STATUS_CONFIG;
  readonly currency = ORDER_CURRENCY;

  private readonly orders = signal<LiveOrder[]>(
    ORDERS_DATA.map(o => structuredClone(o)),
  );

  readonly searchQuery = signal('');
  readonly selectedOrderId = signal<string | null>(ORDERS_DATA[0]?.id ?? null);

  readonly activeOrders = computed(() =>
    this.orders().filter(o => ACTIVE_ORDER_STATUSES.includes(o.status)),
  );

  readonly filteredActiveOrders = computed(() => {
    const query = this.searchQuery();
    return this.activeOrders().filter(o => matchesOrderSearch(o, query));
  });

  readonly groupedOrders = computed((): StatusGroup[] => {
    const active = this.filteredActiveOrders();
    return ACTIVE_ORDER_STATUSES.map(status => ({
      status,
      label: ORDER_STATUS_CONFIG[status].listLabel,
      orders: active.filter(o => o.status === status),
    })).filter(g => g.orders.length > 0);
  });

  readonly selectedOrder = computed(() => {
    const id = this.selectedOrderId();
    return id ? this.orders().find(o => o.id === id) ?? null : null;
  });

  readonly zoneDrivers = computed(() => {
    const order = this.selectedOrder();
    return order ? getDriversForZone(order.zoneId) : [];
  });

  readonly formatAge = formatOrderAge;
  readonly calcTotal = calcOrderTotal;

  constructor() {
    effect(() => {
      const filtered = this.filteredActiveOrders();
      const currentId = this.selectedOrderId();

      if (!filtered.length) {
        this.selectedOrderId.set(null);
        return;
      }

      if (!currentId || !filtered.some(o => o.id === currentId)) {
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

  onItemOutOfStock(event: { orderId: string; itemId: string }): void {
    this.orders.update(list =>
      list.map(order => {
        if (order.id !== event.orderId) return order;
        return {
          ...order,
          shopGroups: order.shopGroups.map(group => ({
            ...group,
            items: group.items.map(item =>
              item.id === event.itemId
                ? { ...item, outOfStock: !item.outOfStock }
                : item,
            ),
          })),
        };
      }),
    );
  }

  onItemUpdate(event: {
    orderId: string;
    itemId: string;
    quantity: number;
    price: number;
  }): void {
    this.orders.update(list =>
      list.map(order => {
        if (order.id !== event.orderId) return order;
        return {
          ...order,
          shopGroups: order.shopGroups.map(group => ({
            ...group,
            items: group.items.map(item =>
              item.id === event.itemId
                ? {
                    ...item,
                    quantity: Math.max(1, Math.round(event.quantity)),
                    price: Math.max(0, event.price),
                  }
                : item,
            ),
          })),
        };
      }),
    );
  }

  onItemDelete(event: { orderId: string; itemId: string }): void {
    this.orders.update(list =>
      list.map(order => {
        if (order.id !== event.orderId) return order;
        return {
          ...order,
          shopGroups: order.shopGroups
            .map(group => ({
              ...group,
              items: group.items.filter(item => item.id !== event.itemId),
            }))
            .filter(group => group.items.length > 0),
        };
      }),
    );
  }

  onAdvanceStatus(event: { orderId: string; nextStatus: OrderStatus }): void {
    this.orders.update(list =>
      list.map(order =>
        order.id === event.orderId ? { ...order, status: event.nextStatus } : order,
      ),
    );
  }

  onDispatch(event: { orderId: string; driverId: string }): void {
    this.orders.update(list =>
      list.map(order =>
        order.id === event.orderId
          ? { ...order, status: 'dispatched', assignedDriverId: event.driverId }
          : order,
      ),
    );
  }
}
