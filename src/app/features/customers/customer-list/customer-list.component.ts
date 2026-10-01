import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { CustomerService } from '../../../core/services/customer.service';
import {
  slicePage,
  TablePagerComponent,
} from '../../../shared/components/table-pager/table-pager.component';
import {
  CUSTOMER_STATUS_FILTERS,
  Customer,
  customerStatusLabel,
} from '../../../core/models/customer.model';
import { readControlValue } from '../../../shared/utils/list-filter';

@Component({
  selector: 'ctrl-customer-list',
  standalone: true,
  imports: [DecimalPipe, TablePagerComponent],
  templateUrl: './customer-list.component.html',
})
export class CustomerListComponent {
  private readonly customerService = inject(CustomerService);

  readonly statusFilters = CUSTOMER_STATUS_FILTERS;
  readonly searchQuery = this.customerService.searchQuery;
  readonly statusFilter = this.customerService.statusFilter;
  readonly filteredCustomers = this.customerService.filteredCustomers;
  readonly page = signal(0);
  readonly pageSize = signal(10);
  readonly pagedCustomers = computed(() =>
    slicePage(this.filteredCustomers(), this.page(), this.pageSize()),
  );

  onSearch(event: Event): void {
    this.customerService.setSearch(readControlValue(event));
    this.page.set(0);
  }

  onStatusChange(event: Event): void {
    this.customerService.setStatusFilter(readControlValue(event));
    this.page.set(0);
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
    this.customerService.toggleStatus(customer.id);
  }
}
