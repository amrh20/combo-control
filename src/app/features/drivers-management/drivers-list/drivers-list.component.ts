import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { ComboInputComponent } from '../../../shared/components/combo-input/combo-input.component';
import { DriverService } from '../../../core/services/driver.service';
import {
  ACCOUNT_STATUS_CONFIG,
  AVAILABILITY_CONFIG,
  DriverProfile,
  ZONE_OPTIONS,
  matchesDriverSearch,
} from '../data/drivers.mock';

type ModalMode = 'add' | 'edit';

@Component({
  selector: 'ctrl-drivers-list',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    ReactiveFormsModule,
    TableModule,
    ToggleSwitchModule,
    SelectModule,
    InputTextModule,
    ComboInputComponent,
  ],
  templateUrl: './drivers-list.component.html',
  styleUrl: './drivers-list.component.scss',
})
export class DriversListComponent {
  private readonly driverService = inject(DriverService);
  private readonly fb = inject(FormBuilder);

  readonly availabilityConfig = AVAILABILITY_CONFIG;
  readonly accountStatusConfig = ACCOUNT_STATUS_CONFIG;
  readonly zoneOptions = ZONE_OPTIONS;
  readonly vehicleOptions = [
    { label: 'دراجة نارية', value: 'Motorcycle' },
    { label: 'سيارة', value: 'Car' },
  ];

  readonly searchQuery = signal('');
  readonly modalOpen = signal(false);
  readonly modalMode = signal<ModalMode>('add');
  private readonly editingId = signal<string | null>(null);

  readonly filteredDrivers = computed(() => {
    const query = this.searchQuery();
    return this.driverService.drivers().filter((d) => matchesDriverSearch(d, query));
  });

  readonly modalTitle = computed(() =>
    this.modalMode() === 'edit' ? 'تعديل بيانات السائق' : 'إضافة سائق جديد',
  );

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    phone: ['', Validators.required],
    zoneId: ['', Validators.required],
    vehicleType: ['Motorcycle', Validators.required],
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
    // مفعّل ON → unlocked; OFF → locked
    this.driverService.toggleDriverLock(driverId, !active);
  }

  openAddModal(): void {
    this.modalMode.set('add');
    this.editingId.set(null);
    this.form.reset({
      name: '',
      phone: '',
      zoneId: ZONE_OPTIONS[0]?.id ?? '',
      vehicleType: 'Motorcycle',
    });
    this.modalOpen.set(true);
  }

  openEditModal(driver: DriverProfile): void {
    this.modalMode.set('edit');
    this.editingId.set(driver.id);
    this.form.reset({
      name: driver.name,
      phone: driver.phone,
      zoneId: driver.zoneId,
      vehicleType: driver.vehicleType,
    });
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.editingId.set(null);
    this.form.reset();
  }

  saveDriver(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const zone = ZONE_OPTIONS.find((z) => z.id === value.zoneId);

    const payload: Partial<DriverProfile> = {
      name: value.name.trim(),
      phone: value.phone.trim(),
      zoneId: value.zoneId,
      zoneName: zone?.name ?? value.zoneId,
      vehicleType: value.vehicleType,
    };

    if (this.modalMode() === 'edit') {
      const id = this.editingId();
      if (id) {
        this.driverService.updateDriver(id, payload);
      }
    } else {
      this.driverService.addDriver(payload);
    }

    this.closeModal();
  }
}
