import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import {
  OpsNotification,
  OpsNotificationList,
  OpsNotificationNewPayload,
} from '../models/ops-notification.model';
import { AuthService } from './auth.service';
import { RealtimeService } from './realtime.service';

const NOTIFICATIONS_URL = `${API_BASE_URL}/v1/ops/notifications`;
const NEW_ORDER_SOUND = 'assets/sounds/new-order.mp3';
const TOAST_KEY = 'ops';

@Injectable({ providedIn: 'root' })
export class OpsNotificationService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly realtime = inject(RealtimeService);
  private readonly router = inject(Router);
  private readonly messages = inject(MessageService);

  private readonly items = signal<OpsNotification[]>([]);

  readonly notifications = this.items.asReadonly();
  readonly unreadCount = computed(
    () => this.items().filter((item) => item.readAt === null).length,
  );

  constructor() {
    effect(() => {
      if (this.auth.currentUser()) {
        void this.refresh();
      } else {
        this.items.set([]);
      }
    });

    this.realtime.on<OpsNotificationNewPayload>('ops.notification.new').subscribe((payload) => {
      this.onRealtime(payload);
    });
  }

  async refresh(): Promise<void> {
    const list = await firstValueFrom(this.http.get<OpsNotificationList>(NOTIFICATIONS_URL));
    this.items.set(list.items);
  }

  /** Toast tap: same path as choosing a row in the bell menu. */
  handleToastClick(message: {
    data?: { notificationId?: string; orderId?: string };
  }): void {
    const notificationId = message.data?.notificationId;
    const orderId = message.data?.orderId;
    if (!notificationId || !orderId) {
      return;
    }
    const item = this.items().find((row) => row.id === notificationId);
    void this.open(item ?? this.stub(notificationId, orderId));
  }

  async open(item: OpsNotification): Promise<void> {
    const orderId = item.orderId;
    if (!orderId) {
      return;
    }
    if (item.readAt === null) {
      await this.markRead(item.id);
    }
    await this.router.navigate(['/orders', orderId]);
  }

  private onRealtime(payload: OpsNotificationNewPayload): void {
    const row = this.fromPayload(payload);
    this.items.update((items) => {
      if (items.some((item) => item.id === row.id)) {
        return items;
      }
      return [row, ...items].slice(0, 50);
    });
    this.playNewOrderSound();
    this.messages.add({
      key: TOAST_KEY,
      severity: 'info',
      summary: row.title,
      detail: row.body,
      life: 12_000,
      data: { notificationId: row.id, orderId: row.orderId },
    });
  }

  private async markRead(id: string): Promise<void> {
    await firstValueFrom(this.http.patch<{ unreadCount: number }>(`${NOTIFICATIONS_URL}/${id}/read`, {}));
    this.items.update((items) =>
      items.map((item) =>
        item.id === id && item.readAt === null
          ? { ...item, readAt: new Date().toISOString() }
          : item,
      ),
    );
  }

  private fromPayload(payload: OpsNotificationNewPayload): OpsNotification {
    const orderId = payload.orderId ?? payload.referenceId ?? null;
    return {
      id: payload.id,
      orderId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      readAt: null,
      createdAt: new Date().toISOString(),
    };
  }

  private stub(id: string, orderId: string): OpsNotification {
    return {
      id,
      orderId,
      type: 'NEW_ORDER',
      title: 'طلب جديد',
      body: '',
      readAt: null,
      createdAt: new Date().toISOString(),
    };
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
