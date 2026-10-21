import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import { ApiErrorBody } from '../models/auth.model';
import { Customer, CustomerPage, CustomerStatus } from '../models/customer.model';

const CUSTOMERS_SEED: Customer[] = [
  {
    id: 'CUS-001',
    fullName: 'أحمد محمود حسن',
    phone: '01012345678',
    totalOrders: 42,
    totalSpent: 8650,
    status: 'ACTIVE',
    joinedAt: '2024-03-12',
  },
  {
    id: 'CUS-002',
    fullName: 'سارة عبد الرحمن',
    phone: '01123456789',
    totalOrders: 18,
    totalSpent: 3120.5,
    status: 'ACTIVE',
    joinedAt: '2024-06-02',
  },
  {
    id: 'CUS-003',
    fullName: 'محمد علي فؤاد',
    phone: '01234567890',
    totalOrders: 7,
    totalSpent: 940,
    status: 'BLOCKED',
    joinedAt: '2024-08-19',
  },
  {
    id: 'CUS-004',
    fullName: 'نورهان خالد إبراهيم',
    phone: '01511223344',
    totalOrders: 63,
    totalSpent: 15480,
    status: 'ACTIVE',
    joinedAt: '2023-11-05',
  },
  {
    id: 'CUS-005',
    fullName: 'يوسف إبراهيم منصور',
    phone: '01098765432',
    totalOrders: 3,
    totalSpent: 275,
    status: 'ACTIVE',
    joinedAt: '2025-01-14',
  },
  {
    id: 'CUS-006',
    fullName: 'مريم حسنين',
    phone: '01155667788',
    totalOrders: 29,
    totalSpent: 6210,
    status: 'BLOCKED',
    joinedAt: '2024-02-28',
  },
  {
    id: 'CUS-007',
    fullName: 'عمر صلاح الدين',
    phone: '01266778899',
    totalOrders: 11,
    totalSpent: 1890.75,
    status: 'ACTIVE',
    joinedAt: '2024-09-30',
  },
  {
    id: 'CUS-008',
    fullName: 'هدى مصطفى عبد العزيز',
    phone: '01544332211',
    totalOrders: 54,
    totalSpent: 11240,
    status: 'ACTIVE',
    joinedAt: '2023-07-21',
  },
  {
    id: 'CUS-009',
    fullName: 'كريم عبد الله',
    phone: '01033445566',
    totalOrders: 1,
    totalSpent: 85,
    status: 'ACTIVE',
    joinedAt: '2025-09-08',
  },
  {
    id: 'CUS-010',
    fullName: 'فاطمة الزهراء محمود',
    phone: '01177889900',
    totalOrders: 36,
    totalSpent: 7435.25,
    status: 'ACTIVE',
    joinedAt: '2024-04-17',
  },
  {
    id: 'CUS-011',
    fullName: 'حسام الدين عادل',
    phone: '01299001122',
    totalOrders: 8,
    totalSpent: 1560,
    status: 'BLOCKED',
    joinedAt: '2024-12-01',
  },
  {
    id: 'CUS-012',
    fullName: 'دينا أشرف سيد',
    phone: '01522110099',
    totalOrders: 22,
    totalSpent: 4980,
    status: 'ACTIVE',
    joinedAt: '2024-05-11',
  },
  {
    id: 'CUS-013',
    fullName: 'طارق جمال الدين',
    phone: '01055664433',
    totalOrders: 15,
    totalSpent: 2675,
    status: 'ACTIVE',
    joinedAt: '2025-02-23',
  },
  {
    id: 'CUS-014',
    fullName: 'ليلى حسين',
    phone: '01100998877',
    totalOrders: 4,
    totalSpent: 610,
    status: 'BLOCKED',
    joinedAt: '2025-06-16',
  },
];

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

  /**
   * Local book for order creation. The customers screen does not read or write this list.
   */
  readonly customers = signal<Customer[]>(structuredClone(CUSTOMERS_SEED)).asReadonly();

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
