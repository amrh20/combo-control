import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { OpsNotification } from '../models/ops-notification.model';
import { OpsOrderRow } from '../models/ops-order.model';
import { OpsOrderService } from './ops-order.service';

const NEW_ORDER_SOUND = 'assets/sounds/new-order.mp3';

@Injectable({ providedIn: 'root' })
export class OpsNotificationService {
  private readonly orders = inject(OpsOrderService);
  private readonly items = signal<OpsNotification[]>([]);

  readonly notifications = this.items.asReadonly();
  readonly unreadCount = computed(() => this.items().filter((item) => !item.read).length);

  constructor() {
    this.orders.orderCreated$.pipe(takeUntilDestroyed()).subscribe((order) => {
      this.pushNewOrder(order);
      this.playNewOrderSound();
    });
  }

  markAllRead(): void {
    this.items.update((items) => items.map((item) => (item.read ? item : { ...item, read: true })));
  }

  private pushNewOrder(order: OpsOrderRow): void {
    const orderNumber = order.orderNumber || order.id;
    const notification: OpsNotification = {
      id: `${order.id}-${Date.now()}`,
      orderId: order.id,
      orderNumber,
      message: `تم استلام طلب جديد: ${orderNumber}`,
      createdAt: new Date().toISOString(),
      read: false,
    };
    this.items.update((items) => [notification, ...items].slice(0, 50));
  }

  private playNewOrderSound(): void {
    try {
      const audio = new Audio(NEW_ORDER_SOUND);
      void audio.play().catch(() => undefined);
    } catch {
      // Autoplay or missing file must not interrupt the live board.
    }
  }
}
