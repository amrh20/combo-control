import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import { ApiErrorBody } from '../models/auth.model';
import { Customer, CustomerPage, CustomerStatus } from '../models/customer.model';

const CUSTOMERS_URL = `${API_BASE_URL}/v1/customers`;
const STATUSES = new Set<CustomerStatus>(['ACTIVE', 'BLOCKED']);

interface CustomerApiRecord {
  id: string;
  phone?: string | null;
  fullName?: string | null;
  status?: string | null;
  createdAt?: string | null;
}

interface CustomerApiPage {
  items?: CustomerApiRecord[];
  nextCursor?: string | null;
}

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly http = inject(HttpClient);

  /** `GET /v1/customers`. `search` is sent only when it has at least 2 characters. */
  getCustomers(
    search?: string,
    status?: string,
    cursor?: string,
    limit = 100,
  ): Observable<CustomerPage> {
    let params = new HttpParams().set('limit', String(limit));
    const query = search?.trim() ?? '';
    if (query.length >= 2) {
      params = params.set('search', query);
    }
    if (status === 'ACTIVE' || status === 'BLOCKED') {
      params = params.set('status', status);
    }
    if (cursor) {
      params = params.set('cursor', cursor);
    }

    return this.http.get<CustomerApiPage>(CUSTOMERS_URL, { params }).pipe(map(toCustomerPage));
  }

  /** `PATCH /v1/customers/{id}/status` */
  updateCustomerStatus(id: string, status: 'BLOCKED' | 'ACTIVE'): Observable<Customer> {
    return this.http
      .patch<CustomerApiRecord>(`${CUSTOMERS_URL}/${id}/status`, { status })
      .pipe(map(toCustomer));
  }
}

export function customerErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }

  const body = error.error as ApiErrorBody | null;
  const message = body?.error?.message?.trim() ?? '';
  if (/[\u0600-\u06FF]/.test(message)) {
    return message;
  }
  if (error.status === 404) {
    return 'العميل غير موجود.';
  }
  if (error.status === 400) {
    return 'تعذر تنفيذ الطلب. راجع البحث أو الحالة وحاول مرة أخرى.';
  }
  return fallback;
}

function toCustomerPage(body: CustomerApiPage): CustomerPage {
  return {
    items: (body.items ?? []).map(toCustomer),
    nextCursor: body.nextCursor ?? null,
  };
}

function toCustomer(row: CustomerApiRecord): Customer {
  return {
    id: row.id,
    phone: row.phone?.trim() ?? '',
    fullName: row.fullName?.trim() ?? '',
    status: asStatus(row.status),
    joinedAt: row.createdAt?.slice(0, 10) ?? '',
  };
}

function asStatus(value: string | null | undefined): CustomerStatus {
  return value && STATUSES.has(value as CustomerStatus) ? (value as CustomerStatus) : 'ACTIVE';
}
