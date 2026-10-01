import { Injectable, computed, signal } from '@angular/core';
import {
  Customer,
  CustomerStatusFilter,
  isCustomerStatusFilter,
} from '../models/customer.model';
import { matchesSearch } from '../../shared/utils/list-filter';

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

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly customersSignal = signal<Customer[]>(structuredClone(CUSTOMERS_SEED));

  readonly customers = this.customersSignal.asReadonly();
  readonly searchQuery = signal('');
  readonly statusFilter = signal<CustomerStatusFilter>('ALL');

  readonly filteredCustomers = computed(() => {
    const query = this.searchQuery();
    const status = this.statusFilter();
    return this.customersSignal().filter((customer) => {
      const statusMatches = status === 'ALL' || customer.status === status;
      const searchMatches = matchesSearch(query, customer.fullName, customer.phone);
      return statusMatches && searchMatches;
    });
  });

  setSearch(query: string): void {
    this.searchQuery.set(query);
  }

  setStatusFilter(value: string): void {
    this.statusFilter.set(isCustomerStatusFilter(value) ? value : 'ALL');
  }

  toggleStatus(id: string): void {
    this.customersSignal.update((list) =>
      list.map((customer) =>
        customer.id === id
          ? {
              ...customer,
              status: customer.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE',
            }
          : customer,
      ),
    );
  }
}
