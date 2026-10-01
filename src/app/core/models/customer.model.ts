export type CustomerStatus = 'ACTIVE' | 'BLOCKED';

export type CustomerStatusFilter = 'ALL' | CustomerStatus;

export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  totalOrders: number;
  totalSpent: number;
  status: CustomerStatus;
  joinedAt: string;
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
