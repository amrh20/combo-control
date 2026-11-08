import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CaptainEmploymentType } from '../models/captain.model';
import {
  CaptainSettlement,
  CaptainSettlementEmploymentType,
  CaptainSettlementPending,
  CaptainSettlementRole,
  FinancialsDateRange,
  FinancialsLedgerEntry,
  FinancialsLedgerType,
  FinancialsSummary,
  VendorSettlement,
} from '../models/financials.model';
import { piastresToEgp } from '../models/zone.model';

const BASE = `${environment.apiUrl}/v1/ops/financials`;

const ROLES = new Set<CaptainSettlementRole>(['DELIVERY', 'COLLECTOR', 'BOTH']);
const EMPLOYMENT_TYPES = new Set<CaptainSettlementEmploymentType>(['FIXED', 'FREELANCER']);
const LEDGER_TYPES = new Set<FinancialsLedgerType>(['COLLECTION', 'PAYOUT']);

@Injectable({ providedIn: 'root' })
export class FinancialsService {
  private readonly http = inject(HttpClient);

  /** `GET /v1/ops/financials/summary` */
  getSummary(range: FinancialsDateRange = {}): Observable<FinancialsSummary> {
    return this.http
      .get<unknown>(`${BASE}/summary`, { params: dateParams(range) })
      .pipe(map(toSummary));
  }

  /** `GET /v1/ops/financials/captains` */
  getCaptains(): Observable<CaptainSettlement[]> {
    return this.http.get<unknown>(`${BASE}/captains`).pipe(map(toCaptains));
  }

  /** `GET /v1/ops/financials/vendors` */
  getVendors(): Observable<VendorSettlement[]> {
    return this.http.get<unknown>(`${BASE}/vendors`).pipe(map(toVendors));
  }

  /** `GET /v1/ops/financials/ledger` */
  getLedger(limit = 100, range: FinancialsDateRange = {}): Observable<FinancialsLedgerEntry[]> {
    let params = dateParams(range).set('limit', String(limit));
    return this.http.get<unknown>(`${BASE}/ledger`, { params }).pipe(map(toLedger));
  }

  /** `POST /v1/ops/financials/vendors/{id}/payout` — pays the full outstanding balance. */
  payVendor(vendorId: string): Observable<VendorSettlement> {
    return this.http
      .post<unknown>(
        `${BASE}/vendors/${encodeURIComponent(vendorId)}/payout`,
        {},
        { headers: { 'Idempotency-Key': crypto.randomUUID() } },
      )
      .pipe(
        map((body) => {
          const row = toVendor(body);
          if (!row) {
            throw new Error('Invalid vendor payout response');
          }
          return row;
        }),
      );
  }
}

function dateParams(range: FinancialsDateRange): HttpParams {
  let params = new HttpParams();
  if (range.startDate) {
    params = params.set('startDate', range.startDate);
  }
  if (range.endDate) {
    params = params.set('endDate', range.endDate);
  }
  return params;
}

function toSummary(body: unknown): FinancialsSummary {
  const record = asRecord(body);
  return {
    cashHeldByCaptains: egp(
      numberField(record, 'cashHeldByCaptains', 'cash_held_by_captains', 'cashInTransit'),
    ),
    captainDues: egp(numberField(record, 'captainDues', 'captain_dues', 'captainPayouts')),
    merchantDues: egp(numberField(record, 'merchantDues', 'merchant_dues', 'vendorPayouts')),
    platformProfit: egp(numberField(record, 'platformProfit', 'platform_profit', 'netRevenue')),
  };
}

function toCaptains(body: unknown): CaptainSettlement[] {
  return itemsOf(body).map(toCaptain).filter((row): row is CaptainSettlement => row !== null);
}

function toVendors(body: unknown): VendorSettlement[] {
  return itemsOf(body).map(toVendor).filter((row): row is VendorSettlement => row !== null);
}

function toLedger(body: unknown): FinancialsLedgerEntry[] {
  return itemsOf(body).map(toLedgerEntry).filter((row): row is FinancialsLedgerEntry => row !== null);
}

function toCaptain(row: unknown): CaptainSettlement | null {
  const record = asRecord(row);
  const id = text(record['id']);
  if (!id) {
    return null;
  }
  return {
    id,
    name: text(record['name']) || text(record['fullName']) || id,
    role: asRole(record['role']),
    employmentType: asEmploymentType(record['employmentType'] ?? record['employment_type']),
    hasApp: record['hasApp'] !== false && record['has_app'] !== false,
    cashCollected: egp(
      numberField(record, 'cashCollected', 'cash_collected', 'companyCashBalance'),
    ),
    earningsDue: egp(numberField(record, 'earningsDue', 'earnings_due', 'earnings')),
    pendingSettlement: toPending(record['pendingSettlement'] ?? record['pending_settlement']),
  };
}

function toVendor(row: unknown): VendorSettlement | null {
  const record = asRecord(row);
  const id = text(record['id']);
  if (!id) {
    return null;
  }
  return {
    id,
    name: text(record['name']) || id,
    hubName: text(record['hubName']) || text(record['hub_name']) || '—',
    salesDue: egp(numberField(record, 'salesDue', 'sales_due', 'walletBalance')),
  };
}

function toLedgerEntry(row: unknown): FinancialsLedgerEntry | null {
  const record = asRecord(row);
  const id = text(record['id']);
  if (!id) {
    return null;
  }
  const date =
    text(record['date']) ||
    text(record['createdAt']) ||
    text(record['created_at']) ||
    text(record['occurredAt']);
  return {
    id,
    date: date || new Date(0).toISOString(),
    type: asLedgerType(record['type']),
    amount: egp(numberField(record, 'amount')),
    description: text(record['description']) || '—',
  };
}

function toPending(value: unknown): CaptainSettlementPending | null {
  const record = asRecord(value);
  const id = text(record['id']);
  if (!id) {
    return null;
  }
  const status = text(record['status']).toUpperCase();
  if (status && status !== 'PENDING') {
    return null;
  }
  return {
    id,
    amount: egp(numberField(record, 'amount')),
    status: 'PENDING',
    createdAt:
      text(record['createdAt']) || text(record['created_at']) || new Date(0).toISOString(),
  };
}

function itemsOf(body: unknown): unknown[] {
  if (Array.isArray(body)) {
    return body;
  }
  const record = asRecord(body);
  const raw = record['items'] ?? record['data'];
  return Array.isArray(raw) ? raw : [];
}

function egp(piastres: number): number {
  return piastresToEgp(piastres);
}

function numberField(record: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.trunc(value);
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const amount = Number(value);
      if (Number.isFinite(amount)) {
        return Math.trunc(amount);
      }
    }
  }
  return 0;
}

function asRole(value: unknown): CaptainSettlementRole {
  const role = text(value).toUpperCase();
  return ROLES.has(role as CaptainSettlementRole)
    ? (role as CaptainSettlementRole)
    : 'DELIVERY';
}

function asEmploymentType(value: unknown): CaptainEmploymentType {
  const type = text(value).toUpperCase();
  return EMPLOYMENT_TYPES.has(type as CaptainSettlementEmploymentType)
    ? (type as CaptainSettlementEmploymentType)
    : 'FREELANCER';
}

function asLedgerType(value: unknown): FinancialsLedgerType {
  const type = text(value).toUpperCase();
  return LEDGER_TYPES.has(type as FinancialsLedgerType)
    ? (type as FinancialsLedgerType)
    : 'COLLECTION';
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
