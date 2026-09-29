import { Component, computed, effect, input, output, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';

import {
  calcOrderSubtotal,
  calcOrderTotal,
  Driver,
  LiveOrder,
  OrderItem,
  ORDER_CURRENCY,
  ORDER_STATUS_CONFIG,
  OrderStatus,
} from '../data/orders.mock';

@Component({
  selector: 'ctrl-order-action-panel',
  standalone: true,
  imports: [DecimalPipe, FormsModule, ButtonModule, SelectModule],
  templateUrl: './order-action-panel.component.html',
  styleUrl: './order-action-panel.component.scss',
})
export class OrderActionPanelComponent {
  order = input.required<LiveOrder>();
  zoneDrivers = input.required<Driver[]>();

  itemOutOfStock = output<{ orderId: string; itemId: string }>();
  itemUpdate = output<{ orderId: string; itemId: string; quantity: number; price: number }>();
  itemDelete = output<{ orderId: string; itemId: string }>();
  advanceStatus = output<{ orderId: string; nextStatus: OrderStatus }>();
  dispatch = output<{ orderId: string; driverId: string }>();

  readonly statusConfig = ORDER_STATUS_CONFIG;
  readonly currency = ORDER_CURRENCY;
  selectedDriverId: string | null = null;

  readonly editingItemId = signal<string | null>(null);
  editQuantity = 1;
  editPrice = 0;

  readonly subtotal = computed(() => calcOrderSubtotal(this.order()));
  readonly finalTotal = computed(() => calcOrderTotal(this.order()));

  constructor() {
    effect(() => {
      this.order();
      this.selectedDriverId = null;
      this.editingItemId.set(null);
    });
  }

  readonly nextAction = computed(() => {
    switch (this.order().status) {
      case 'new':
        return { label: 'تأكيد الطلب', nextStatus: 'reviewing' as OrderStatus, icon: 'pi-check-circle' };
      case 'reviewing':
        return { label: 'تعيين المتاجر كجاهزة', nextStatus: 'ready' as OrderStatus, icon: 'pi-box' };
      default:
        return null;
    }
  });

  get canDispatch(): boolean {
    return this.order().status === 'ready' && this.selectedDriverId !== null;
  }

  isEditing(itemId: string): boolean {
    return this.editingItemId() === itemId;
  }

  startEdit(item: OrderItem): void {
    this.editingItemId.set(item.id);
    this.editQuantity = item.quantity;
    this.editPrice = item.price;
  }

  cancelEdit(): void {
    this.editingItemId.set(null);
  }

  saveEdit(itemId: string): void {
    this.itemUpdate.emit({
      orderId: this.order().id,
      itemId,
      quantity: this.editQuantity,
      price: this.editPrice,
    });
    this.editingItemId.set(null);
  }

  deleteItem(itemId: string): void {
    if (this.editingItemId() === itemId) {
      this.editingItemId.set(null);
    }
    this.itemDelete.emit({ orderId: this.order().id, itemId });
  }

  toggleOutOfStock(itemId: string): void {
    this.itemOutOfStock.emit({ orderId: this.order().id, itemId });
  }

  onAdvanceStatus(): void {
    const action = this.nextAction();
    if (!action) return;
    this.advanceStatus.emit({ orderId: this.order().id, nextStatus: action.nextStatus });
  }

  onDispatch(): void {
    const driverId = this.selectedDriverId;
    if (!driverId || this.order().status !== 'ready') return;
    this.dispatch.emit({ orderId: this.order().id, driverId });
  }

  driverStatusLabel(status: Driver['status']): string {
    return status === 'available' ? 'متاح' : 'مشغول';
  }

  lineTotal(item: OrderItem): number {
    return item.price * item.quantity;
  }
}
