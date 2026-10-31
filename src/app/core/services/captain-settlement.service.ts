import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import { ApiErrorBody } from '../models/auth.model';
import {
  CaptainCashSettlement,
  CaptainSettlementStatus,
} from '../models/captain-settlement.model';

const OPS_CAPTAINS_URL = `${API_BASE_URL}/v1/ops/captains`;

const STATUSES = new Set<CaptainSettlementStatus>(['PENDING', 'CONFIRMED', 'REJECTED']);

@Injectable({ providedIn: 'root' })
export class CaptainSettlementService {
  private readonly http = inject(HttpClient);

  /** `GET /v1/ops/captains/{id}/settlements` */
  listSettlements(
    captainId: string,
    status?: CaptainSettlementStatus | CaptainSettlementStatus[],
  ): Observable<CaptainCashSettlement[]> {
    let params = new HttpParams();
    const statuses = Array.isArray(status) ? status : status ? [status] : [];
    params = params.set('limit', '100');
    if (statuses.length === 1) {
      params = params.set('status', statuses[0]);
    } else if (statuses.length > 1) {
      params = params.set('status', statuses.join(','));
    }

    const url = settlementsUrl(captainId);
    return this.http.get<unknown>(url, { params }).pipe(
      map((body) => unwrapSettlements(body, captainId)),
    );
  }

  /** `POST /v1/ops/captains/{id}/settlements/{settlementId}/confirm` */
  confirmSettlement(captainId: string, settlementId: string): Observable<CaptainCashSettlement | void> {
    return this.http
      .post<unknown>(
        `${settlementsUrl(captainId)}/${encodeURIComponent(settlementId)}/confirm`,
        {},
        { headers: { 'Idempotency-Key': crypto.randomUUID() } },
      )
      .pipe(map((body) => (body == null ? undefined : parseCaptainSettlement(body, captainId))));
  }
}

export function settlementErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }

  const body = error.error as ApiErrorBody | null;
  const message = body?.error?.message?.trim() ?? '';
  if (message && /[\u0600-\u06FF]/.test(message)) {
    return message;
  }

  if (error.status === 409) {
    return 'تعذر تأكيد التسوية. ربما تم التعامل معها مسبقاً.';
  }

  if (error.status === 404) {
    return 'طلب التوريد غير موجود.';
  }

  return fallback;
}

function settlementsUrl(captainId: string): string {
  return `${OPS_CAPTAINS_URL}/${encodeURIComponent(captainId)}/settlements`;
}

function unwrapSettlements(body: unknown, captainId: string): CaptainCashSettlement[] {
  const rec = asRecord(body);
  const raw = Array.isArray(body)
    ? body
    : rec['items'] ?? rec['data'] ?? rec['settlements'];
  const rows = Array.isArray(raw) ? raw : [];
  return rows
    .map((row) => parseCaptainSettlement(row, captainId))
    .filter((row): row is CaptainCashSettlement => row !== undefined);
}

export function parseCaptainSettlement(
  row: unknown,
  captainId: string,
): CaptainCashSettlement | undefined {
  const rec = asRecord(row);
  const id = text(rec['id']);
  if (!id) {
    return undefined;
  }

  return {
    id,
    captainId: text(rec['captainId']) || text(rec['captain_id']) || captainId,
    amountPiastres: asPiastres(
      rec['amountPiastres'] ?? rec['amount_piastres'] ?? rec['amount'] ?? rec['company_cash_balance'],
    ),
    status: asStatus(rec['status']),
    requestedAt:
      text(rec['requestedAt']) ||
      text(rec['requested_at']) ||
      text(rec['createdAt']) ||
      text(rec['created_at']),
    resolvedAt:
      text(rec['resolvedAt']) ||
      text(rec['resolved_at']) ||
      text(rec['confirmedAt']) ||
      text(rec['confirmed_at']) ||
      text(rec['rejectedAt']) ||
      text(rec['rejected_at']) ||
      null,
    note: text(rec['note']) || text(rec['notes']) || text(rec['rejectionReason']),
  };
}

function asStatus(value: unknown): CaptainSettlementStatus {
  const raw = text(value).toUpperCase();
  const status = raw === 'COMPLETED' ? 'CONFIRMED' : raw;
  return STATUSES.has(status as CaptainSettlementStatus)
    ? (status as CaptainSettlementStatus)
    : 'PENDING';
}

function asPiastres(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const amount = Number(value);
    return Number.isFinite(amount) ? Math.trunc(amount) : 0;
  }
  return 0;
}

function text(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
