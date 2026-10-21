export type CustomerStatus = 'ACTIVE' | 'BLOCKED';

export type CustomerStatusFilter = 'ALL' | CustomerStatus;

export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  /**
   * Not returned by `GET /v1/customers`. Present on the local book used by order creation.
   */
  totalOrders?: number;
  /** Not returned by `GET /v1/customers`. Present on the local book used by order creation. */
  totalSpent?: number;
  status: CustomerStatus;
  joinedAt: string;
}

/** `GET /v1/customers` cursor page. */
export interface CustomerPage {
  items: Customer[];
  nextCursor: string | null;
}

export const CUSTOMER_STATUS_FILTERS: ReadonlyArray<{
  value: CustomerStatusFilter;
  label: string;
}> = [
  { value: 'ALL', label: 'الكل' },
  { value: 'ACTIVE', label: 'نشط' },
  { value: 'BLOCKED', label: 'محظور' },
];

export function customerStatusLabel(status: CustomerStatus): string {
  return status === 'ACTIVE' ? 'نشط' : 'محظور';
}

export function isCustomerStatusFilter(value: string): value is CustomerStatusFilter {
  return value === 'ALL' || value === 'ACTIVE' || value === 'BLOCKED';
}
