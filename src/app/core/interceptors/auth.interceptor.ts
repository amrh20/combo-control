import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { Injector, inject } from '@angular/core';
import { BehaviorSubject, Observable, catchError, filter, finalize, switchMap, take, throwError } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import { ACCESS_TOKEN_KEY, AuthService } from '../services/auth.service';

const API_ROOT = `${API_BASE_URL}/v1`;
const LOGIN_URL = `${API_ROOT}/auth/staff/login`;
const REFRESH_URL = `${API_ROOT}/auth/refresh`;

/**
 * True while one refresh call is in flight.
 * `false` is the signal that queued requests may read the new access token and continue.
 */
const isRefreshing = new BehaviorSubject(false);

/**
 * Attaches the staff access token to `/v1` calls and, on 401, refreshes once.
 * Further calls wait on `isRefreshing` so a rotating refresh token is never used twice.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(API_ROOT) || isAnonymousAuth(request.url)) {
    return next(request);
  }

  const injector = inject(Injector);

  if (isRefreshing.value) {
    return afterRefresh(request, next, injector);
  }

  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  const outgoing = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(outgoing).pipe(
    catchError((error: unknown) => {
      if (!isUnauthenticated(error)) {
        return throwError(() => error);
      }
      return afterRefresh(request, next, injector);
    }),
  );
};

function isAnonymousAuth(url: string): boolean {
  return isEndpoint(url, LOGIN_URL) || isEndpoint(url, REFRESH_URL);
}

function isEndpoint(url: string, endpoint: string): boolean {
  return url === endpoint || url.startsWith(`${endpoint}?`);
}

function isUnauthenticated(error: unknown): error is HttpErrorResponse {
  return error instanceof HttpErrorResponse && error.status === 401;
}

/**
 * Starts a refresh if one is not already running, then retries `request` with the new access token.
 * The refresh subscription is detached from the caller so a cancelled request cannot abort it.
 */
function afterRefresh(
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
  injector: Injector,
): Observable<HttpEvent<unknown>> {
  if (!isRefreshing.value) {
    isRefreshing.next(true);
    const auth = injector.get(AuthService);
    auth
      .refreshToken()
      .pipe(
        catchError((error: unknown) => {
          auth.logout();
          return throwError(() => error);
        }),
        finalize(() => isRefreshing.next(false)),
      )
      .subscribe({
        error: () => {
          // Callers waiting below surface the failure once the session is cleared.
        },
      });
  }

  return isRefreshing.pipe(
    filter((refreshing) => !refreshing),
    take(1),
    switchMap(() => {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (!token) {
        return throwError(
          () =>
            new HttpErrorResponse({
              status: 401,
              statusText: 'UNAUTHENTICATED',
              url: request.url,
            }),
        );
      }
      return next(request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })).pipe(
        catchError((error: unknown) => {
          if (isUnauthenticated(error)) {
            injector.get(AuthService).logout();
          }
          return throwError(() => error);
        }),
      );
    }),
  );
}
