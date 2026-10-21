import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, ReplaySubject, catchError, switchMap, take, tap, throwError } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import {
  ApiErrorBody,
  StaffLoginResponse,
  StaffProfile,
  StaffTokenPair,
  isMfaChallenge,
} from '../models/auth.model';

export const ACCESS_TOKEN_KEY = 'combo.accessToken';
export const REFRESH_TOKEN_KEY = 'combo.refreshToken';
export const MFA_SETUP_REQUIRED_KEY = 'combo.mfaSetupRequired';

/** Password was accepted, but the account still needs the authenticator step. */
export class MfaRequiredError extends Error {
  constructor(readonly mfaToken: string) {
    super('MFA_REQUIRED');
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly injector = inject(Injector);
  private readonly ready = new ReplaySubject<true>(1);

  readonly currentUser = signal<StaffProfile | null>(null);
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  /** Grants from `GET /v1/auth/staff/me`, refreshed after login and on reload. */
  readonly permissions = computed(() => this.currentUser()?.permissions ?? []);

  constructor() {
    if (!this.accessToken()) {
      this.ready.next(true);
      return;
    }
    this.loadUserProfile().subscribe({
      next: () => this.ready.next(true),
      error: () => {
        this.clearSession();
        this.ready.next(true);
      },
    });
  }

  /** Resolves after the stored token, if any, has been checked against `/me`. */
  whenReady(): Observable<true> {
    return this.ready.pipe(take(1));
  }

  login(email: string, password: string): Observable<StaffProfile> {
    return this.http
      .post<StaffLoginResponse>(`${API_BASE_URL}/v1/auth/staff/login`, {
        email: email.trim().toLowerCase(),
        password,
      })
      .pipe(
        switchMap((response) => {
          if (isMfaChallenge(response)) {
            return throwError(() => new MfaRequiredError(response.mfaToken));
          }
          this.persistSession(response);
          return this.loadUserProfile().pipe(
            catchError((error: unknown) => {
              this.clearSession();
              return throwError(() => error);
            }),
          );
        }),
      );
  }

  loadUserProfile(): Observable<StaffProfile> {
    const token = this.accessToken();
    return this.http
      .get<StaffProfile>(`${API_BASE_URL}/v1/auth/staff/me`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      .pipe(tap((profile) => this.currentUser.set(profile)));
  }

  /**
   * Rotates the session via `POST /v1/auth/refresh`.
   * The backend invalidates the presented refresh token, so callers must share one in-flight call.
   */
  refreshToken(): Observable<StaffTokenPair> {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      return throwError(() => new Error('Missing refresh token'));
    }
    return this.http
      .post<StaffTokenPair>(`${API_BASE_URL}/v1/auth/refresh`, { refreshToken })
      .pipe(tap((tokens) => this.persistSession(tokens)));
  }

  accessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  hasPermission(permission: string): boolean {
    return this.permissions().includes(permission);
  }

  hasAnyPermission(permissions: readonly string[]): boolean {
    const held = this.permissions();
    return permissions.some((permission) => held.includes(permission));
  }

  /** One permission, or any permission in a list. */
  allows(required: string | string[]): boolean {
    return typeof required === 'string'
      ? this.hasPermission(required)
      : this.hasAnyPermission(required);
  }

  mfaSetupRequired(): boolean {
    return localStorage.getItem(MFA_SETUP_REQUIRED_KEY) === '1';
  }

  /** Ends the staff session and returns the user to the login screen. */
  logout(): void {
    this.clearSession();
    const router = this.injector.get(Router);
    if (router.url === '/login' || router.url.startsWith('/login?')) {
      return;
    }
    void router.navigateByUrl('/login', { replaceUrl: true });
  }

  clearSession(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(MFA_SETUP_REQUIRED_KEY);
    this.currentUser.set(null);
  }

  private persistSession(tokens: StaffTokenPair): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    if (tokens.mfaSetupRequired) {
      localStorage.setItem(MFA_SETUP_REQUIRED_KEY, '1');
    } else {
      localStorage.removeItem(MFA_SETUP_REQUIRED_KEY);
    }
  }
}

export function isInvalidCredentials(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
    return false;
  }
  const body = error.error as ApiErrorBody | null;
  return body?.error?.code === 'INVALID_CREDENTIALS';
}
