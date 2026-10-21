import { DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  EMPTY,
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  expand,
  map,
  reduce,
  switchMap,
} from 'rxjs';
import { CustomerService, customerErrorMessage } from '../../../core/services/customer.service';
import {
  slicePage,
  TablePagerComponent,
} from '../../../shared/components/table-pager/table-pager.component';
import {
  CUSTOMER_STATUS_FILTERS,
  Customer,
  CustomerStatusFilter,
  customerStatusLabel,
  isCustomerStatusFilter,
} from '../../../core/models/customer.model';
import { PermissionDirective } from '../../../core/directives/permission.directive';
import { readControlValue } from '../../../shared/utils/list-filter';

@Component({
  selector: 'ctrl-customer-list',
  standalone: true,
  imports: [DecimalPipe, PermissionDirective, TablePagerComponent],
  templateUrl: './customer-list.component.html',
})
export class CustomerListComponent {
  private readonly customerService = inject(CustomerService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchInput = new Subject<string>();
  private readonly loadRequests = new Subject<void>();

  readonly statusFilters = CUSTOMER_STATUS_FILTERS;
  readonly searchQuery = signal('');
  readonly statusFilter = signal<CustomerStatusFilter>('ALL');
  readonly customers = signal<Customer[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly pendingId = signal<string | null>(null);
  /** The customers API rejects a search shorter than 2 characters. */
  readonly searchTooShort = signal(false);
  readonly page = signal(0);
  readonly pageSize = signal(10);
  readonly pagedCustomers = computed(() =>
    slicePage(this.customers(), this.page(), this.pageSize()),
  );

  constructor() {
    this.loadRequests
      .pipe(
        switchMap(() => {
          this.loading.set(true);
          this.loadError.set(null);
          const search = this.searchParam();
          const status = this.statusParam();
          return this.customerService.getCustomers(search, status).pipe(
            expand((page) =>
              page.nextCursor
                ? this.customerService.getCustomers(search, status, page.nextCursor)
                : EMPTY,
            ),
            reduce((all, page) => [...all, ...page.items], [] as Customer[]),
            catchError((error: unknown) => {
              this.loading.set(false);
              this.loadError.set(customerErrorMessage(error, 'تعذر تحميل العملاء.'));
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => {
        this.customers.set(items);
        this.loading.set(false);
      });

    this.searchInput
      .pipe(
        debounceTime(300),
        map((value) => value.trim()),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((value) => {
        this.page.set(0);
        if (value.length === 1) {
          this.searchTooShort.set(true);
          return;
        }
        this.searchTooShort.set(false);
        this.loadRequests.next();
      });

    this.loadRequests.next();
  }

  reload(): void {
    this.loadRequests.next();
  }

  onSearch(event: Event): void {
    const value = readControlValue(event);
    this.searchQuery.set(value);
    this.searchInput.next(value);
  }

  onStatusChange(event: Event): void {
    const value = readControlValue(event);
    this.statusFilter.set(isCustomerStatusFilter(value) ? value : 'ALL');
    this.page.set(0);
    this.loadRequests.next();
  }

  statusLabel(customer: Customer): string {
    return customerStatusLabel(customer.status);
  }

  formatPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 11) {
      return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
    }
    return phone;
  }

  toggleBlock(customer: Customer): void {
    if (this.pendingId()) {
      return;
    }
    const status = customer.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
    this.pendingId.set(customer.id);
    this.actionError.set(null);
    this.customerService
      .updateCustomerStatus(customer.id, status)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.pendingId.set(null);
          this.customers.update((list) => {
            if (this.statusFilter() !== 'ALL' && updated.status !== this.statusFilter()) {
              return list.filter((item) => item.id !== updated.id);
            }
            return list.map((item) =>
              item.id === updated.id ? { ...item, status: updated.status } : item,
            );
          });
        },
        error: (error: unknown) => {
          this.pendingId.set(null);
          this.actionError.set(customerErrorMessage(error, 'تعذر تحديث حالة العميل.'));
        },
      });
  }

  private searchParam(): string | undefined {
    const query = this.searchQuery().trim();
    return query.length >= 2 ? query : undefined;
  }

  private statusParam(): CustomerStatusFilter | undefined {
    const status = this.statusFilter();
    return status === 'ALL' ? undefined : status;
  }
}
