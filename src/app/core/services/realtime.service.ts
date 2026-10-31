import { Injectable, NgZone, effect, inject } from '@angular/core';
import { Observable, Subject, filter, map } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import { AuthService } from './auth.service';

const CLOSE_UNAUTHORIZED = 4401;
const CLOSE_FORBIDDEN = 4403;
const RETRY_START_MS = 1000;
const RETRY_MAX_MS = 30_000;
const MAX_SEEN_EVENTS = 2000;

interface RealtimeEnvelope {
  event?: string;
  id?: string;
  occurredAt?: string;
  data?: unknown;
}

/** Native WebSocket on `/v1/realtime` (not Socket.IO). */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly auth = inject(AuthService);
  private readonly zone = inject(NgZone);

  private socket: WebSocket | null = null;
  private stopped = true;
  private refreshing = false;
  private retryMs = RETRY_START_MS;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly seen = new Set<string>();
  private readonly messages = new Subject<RealtimeEnvelope>();

  constructor() {
    effect(() => {
      if (this.auth.currentUser()) {
        this.connect();
        return;
      }
      this.disconnect();
    });
  }

  /** Events from the API envelope (`order.created`, `order.updated`, …). Payload is `data` when present. */
  on<T>(event: string): Observable<T> {
    return this.messages.pipe(
      filter((message) => message.event === event),
      map((message) => (message.data ?? message) as T),
    );
  }

  private connect(): void {
    this.stopped = false;
    this.open();
  }

  private disconnect(): void {
    this.stopped = true;
    this.refreshing = false;
    this.clearRetry();
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000);
  }

  private open(): void {
    if (this.stopped || this.socket) {
      return;
    }
    const token = this.auth.accessToken();
    if (!token) {
      return;
    }

    const socket = new WebSocket(staffRealtimeUrl(token));
    this.socket = socket;

    socket.onmessage = (raw) => {
      const message = parseEnvelope(raw.data);
      if (!message?.event) {
        return;
      }
      this.zone.run(() => this.handleMessage(message));
    };

    socket.onclose = (closed) => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      this.handleClose(closed.code);
    };
  }

  private handleMessage(message: RealtimeEnvelope): void {
    if (message.event === 'ready') {
      this.retryMs = RETRY_START_MS;
      return;
    }

    if (message.id) {
      if (this.seen.has(message.id)) {
        return;
      }
      this.seen.add(message.id);
      if (this.seen.size > MAX_SEEN_EVENTS) {
        this.seen.clear();
      }
    }

    this.messages.next(message);
  }

  private handleClose(code: number): void {
    if (this.stopped || code === 1000 || code === CLOSE_FORBIDDEN) {
      return;
    }
    if (code === CLOSE_UNAUTHORIZED) {
      this.refreshAndReconnect();
      return;
    }
    this.clearRetry();
    const delay = this.retryMs;
    this.retryMs = Math.min(this.retryMs * 2, RETRY_MAX_MS);
    this.retryTimer = setTimeout(() => this.open(), delay);
  }

  private refreshAndReconnect(): void {
    if (this.refreshing || this.stopped) {
      return;
    }
    this.refreshing = true;
    this.auth.refreshToken().subscribe({
      next: () => {
        this.refreshing = false;
        this.open();
      },
      error: () => {
        this.refreshing = false;
        this.auth.logout();
      },
    });
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}

/** `ws(s)://<host>/v1/realtime?access_token=…` */
export function staffRealtimeUrl(accessToken: string): string {
  const base = API_BASE_URL.replace(/^http/i, 'ws');
  return `${base}/v1/realtime?access_token=${encodeURIComponent(accessToken)}`;
}

function parseEnvelope(data: unknown): RealtimeEnvelope | null {
  if (typeof data !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(data) as RealtimeEnvelope;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}
