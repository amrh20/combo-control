import { Injectable, computed, signal } from '@angular/core';
import {
  AssignableDriver,
  CanonicalOrder,
  FinancialBreakdown,
  OrderLineItem,
  ShopSubOrder,
} from '../models/canonical-order.model';
import { CANONICAL_ORDERS_SEED } from '../mocks/canonical-order.mock';

/** Default take-rate when an order has no prior commission ratio to preserve. */
const DEFAULT_PLATFORM_COMMISSION_RATE = 0.15;

@Injectable({ providedIn: 'root' })
export class CanonicalOrderService {
  private readonly ordersSignal = signal<CanonicalOrder[]>(
    CANONICAL_ORDERS_SEED.map((order) => structuredClone(order)),
  );

  /** Live list — Ops Board and details both read from here. */
  readonly orders = this.ordersSignal.asReadonly();

  readonly orderCount = computed(() => this.ordersSignal().length);

  getById(id: string): CanonicalOrder | null {
    return (
      this.ordersSignal().find(
        (order) => order.id === id || order.orderNumber === id,
      ) ?? null
    );
  }

  /**
   * Update quantity for one line item inside a shop sub-order.
   * Recalculates line totals, shop subtotal, and order financials.
   */
  updateItemQuantity(
    orderId: string,
    shopId: string,
    itemId: string,
    newQty: number,
  ): void {
    const qty = Math.max(1, Math.round(newQty));

    this.patchOrder(orderId, (order) => {
      const subOrders = order.subOrders.map((sub) => {
        if (sub.shopId !== shopId) {
          return sub;
        }

        const items = sub.items.map((item) => {
          if (item.id !== itemId) {
            return item;
          }
          return this.withLineTotal({ ...item, quantity: qty });
        });

        return this.withShopSubtotal({ ...sub, items });
      });

      return this.withRecalculatedFinancials({ ...order, subOrders });
    });
  }

  /**
   * Remove a line item. If the shop sub-order becomes empty, returns
   * `true` so the UI can prompt to drop that shop from the order.
   */
  removeItem(orderId: string, shopId: string, itemId: string): boolean {
    let shopBecameEmpty = false;

    this.patchOrder(orderId, (order) => {
      const subOrders = order.subOrders.map((sub) => {
        if (sub.shopId !== shopId) {
          return sub;
        }

        const items = sub.items.filter((item) => item.id !== itemId);
        shopBecameEmpty = items.length === 0;
        return this.withShopSubtotal({ ...sub, items });
      });

      return this.withRecalculatedFinancials({ ...order, subOrders });
    });

    return shopBecameEmpty;
  }

  /** Drop an empty (or cancelled) shop sub-order from the aggregate. */
  removeSubOrder(orderId: string, shopId: string): void {
    this.patchOrder(orderId, (order) => {
      const subOrders = order.subOrders.filter((sub) => sub.shopId !== shopId);
      return this.withRecalculatedFinancials({ ...order, subOrders });
    });
  }

  /**
   * Dispatch: assign a driver to a READY_AT_HUB order.
   * Moves aggregate status to ASSIGNED and records driver on dispatch state.
   */
  assignDriver(orderId: string, driver: AssignableDriver): void {
    const now = new Date().toISOString();

    this.patchOrder(orderId, (order) => ({
      ...order,
      status: 'ASSIGNED',
      dispatch: {
        ...order.dispatch,
        assignedDriverId: driver.id,
        assignedDriverName: driver.name,
        assignedDriverPhone: driver.phone,
        offerStatus: 'ACCEPTED',
        offeredAt: order.dispatch.offeredAt ?? now,
        acceptedAt: now,
      },
      timestamps: {
        ...order.timestamps,
        assignedAt: now,
      },
    }));
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private patchOrder(
    orderId: string,
    updater: (order: CanonicalOrder) => CanonicalOrder,
  ): void {
    this.ordersSignal.update((list) =>
      list.map((order) => {
        if (order.id !== orderId && order.orderNumber !== orderId) {
          return order;
        }
        const next = updater(order);
        return {
          ...next,
          timestamps: {
            ...next.timestamps,
            updatedAt: new Date().toISOString(),
          },
        };
      }),
    );
  }

  private withLineTotal(item: OrderLineItem): OrderLineItem {
    return {
      ...item,
      lineTotal: roundMoney(item.unitPrice * item.quantity),
    };
  }

  private withShopSubtotal(sub: ShopSubOrder): ShopSubOrder {
    const itemsSubtotal = roundMoney(
      sub.items.reduce((sum, item) => sum + item.lineTotal, 0),
    );
    return { ...sub, itemsSubtotal };
  }

  private withRecalculatedFinancials(order: CanonicalOrder): CanonicalOrder {
    return {
      ...order,
      financials: this.recalculateFinancials(order),
    };
  }

  /**
   * Recompute money map from current line items.
   * Preserves deliveryFee, tax, discount (clamped), driverEarnings, paymentMethod.
   * Derives commission rate from the prior split when possible.
   */
  private recalculateFinancials(order: CanonicalOrder): FinancialBreakdown {
    const prev = order.financials;
    const itemsSubtotal = roundMoney(
      order.subOrders.reduce((sum, sub) => sum + sub.itemsSubtotal, 0),
    );

    const commissionRate =
      prev.itemsSubtotal > 0
        ? prev.platformCommission / prev.itemsSubtotal
        : DEFAULT_PLATFORM_COMMISSION_RATE;

    const platformCommission = roundMoney(itemsSubtotal * commissionRate);
    const vendorPayable = roundMoney(itemsSubtotal - platformCommission);

    const discount = Math.min(prev.discount, itemsSubtotal);
    const deliveryFee = itemsSubtotal === 0 && order.subOrders.length === 0
      ? 0
      : prev.deliveryFee;
    const tax = prev.tax;
    const driverEarnings =
      itemsSubtotal === 0 && order.subOrders.length === 0
        ? 0
        : prev.driverEarnings;

    const customerGrandTotal = roundMoney(
      itemsSubtotal + deliveryFee + tax - discount,
    );

    const finalCashToCollect =
      prev.paymentMethod === 'COD' ? customerGrandTotal : 0;

    return {
      currency: prev.currency,
      itemsSubtotal,
      deliveryFee,
      tax,
      discount,
      customerGrandTotal,
      platformCommission,
      vendorPayable,
      driverEarnings,
      finalCashToCollect,
      paymentMethod: prev.paymentMethod,
    };
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
