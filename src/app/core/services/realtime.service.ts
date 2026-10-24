import { Injectable, NgZone, effect, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { io } from 'socket.io-client';
import { API_BASE_URL } from '../api-config';
import { AuthService } from './auth.service';

/** Staff dashboard socket. Connects while a session is present. */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly auth = inject(AuthService);
  private readonly zone = inject(NgZone);
  private readonly socket = io(API_BASE_URL, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    auth: (cb) => {
      cb({ token: this.auth.accessToken() ?? '' });
    },
  });

  constructor() {
    effect(() => {
      if (this.auth.currentUser()) {
        this.socket.connect();
        return;
      }
      this.socket.disconnect();
    });
  }

  on<T>(event: string): Observable<T> {
    return new Observable<T>((subscriber) => {
      const handler = (payload: T) => this.zone.run(() => subscriber.next(payload));
      this.socket.on(event, handler);
      return () => this.socket.off(event, handler);
    });
  }
}
