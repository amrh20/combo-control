import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ComboInputComponent } from '../../../shared/components/combo-input/combo-input.component';
import {
  ACCOUNT_STATUS_CONFIG,
  AVAILABILITY_CONFIG,
  DriverAccountStatus,
  DriverProfile,
  matchesDriverSearch,
  syncDriversFromState,
  updateDriver,
} from '../data/drivers.mock';

@Component({
  selector: 'ctrl-drivers-list',
  standalone: true,
  imports: [RouterLink, FormsModule, TableModule, ToggleSwitchModule, ComboInputComponent],
  templateUrl: './drivers-list.component.html',
  styleUrl: './drivers-list.component.scss',
})
export class DriversListComponent {
  readonly availabilityConfig = AVAILABILITY_CONFIG;
  readonly accountStatusConfig = ACCOUNT_STATUS_CONFIG;

  private readonly drivers = signal<DriverProfile[]>(syncDriversFromState());
  readonly searchQuery = signal('');

  readonly filteredDrivers = computed(() => {
    const query = this.searchQuery();
    return this.drivers().filter(d => matchesDriverSearch(d, query));
  });

  onSearchChange(value: string): void {
    this.searchQuery.set(value);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  isAccountActive(driver: DriverProfile): boolean {
    return driver.accountStatus === 'active';
  }

  onAccountToggle(driverId: string, active: boolean): void {
    const accountStatus: DriverAccountStatus = active ? 'active' : 'inactive';
    updateDriver(driverId, { accountStatus });
    this.drivers.update(list =>
      list.map(d => (d.id === driverId ? { ...d, accountStatus } : d)),
    );
  }
}
