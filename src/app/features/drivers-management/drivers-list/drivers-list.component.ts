import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { ComboInputComponent } from '../../../shared/components/combo-input/combo-input.component';
import { DriverFormData, DriverService } from '../../../core/services/driver.service';
import { HubService } from '../../../core/services/hub.service';
import {
  ACCOUNT_STATUS_CONFIG,
  AVAILABILITY_CONFIG,
  CaptainProfile,
  CaptainRole,
  CaptainVehicleType,
  ROLE_CONFIG,
  ROLE_OPTIONS,
  VEHICLE_OPTIONS,
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
  private readonly hubService = inject(HubService);
  private readonly fb = inject(FormBuilder);

  readonly availabilityConfig = AVAILABILITY_CONFIG;
  readonly accountStatusConfig = ACCOUNT_STATUS_CONFIG;
  readonly roleConfig = ROLE_CONFIG;
  readonly roleOptions = ROLE_OPTIONS;
  readonly vehicleOptions = VEHICLE_OPTIONS;
  readonly activeHubs = this.hubService.activeHubs;

  readonly searchQuery = signal('');
  readonly modalOpen = signal(false);
  readonly modalMode = signal<ModalMode>('add');
  /** Mirrors role so the vehicle field can show or hide without reading a stale control. */
  readonly showVehicle = signal(true);
  private readonly editingId = signal<string | null>(null);

  readonly filteredDrivers = computed(() => {
    const query = this.searchQuery();
    return this.driverService.drivers().filter((d) => matchesDriverSearch(d, query));
  });

  readonly modalTitle = computed(() =>
    this.modalMode() === 'edit' ? 'تعديل بيانات الكابتن' : 'إضافة كابتن جديد',
  );

  readonly form = this.fb.nonNullable.group({
    role: ['DELIVERY' as CaptainRole, Validators.required],
    name: ['', Validators.required],
    phone: ['', Validators.required],
    password: [''],
    hubId: ['', Validators.required],
    vehicleType: ['' as CaptainVehicleType | ''],
  });

  constructor() {
    this.form.controls.role.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((role) => this.syncVehicleControl(role));
    this.syncVehicleControl(this.form.controls.role.value);
  }

  onSearchChange(value: string): void {
    this.searchQuery.set(value);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  roleLabel(role: CaptainRole): string {
    return this.roleConfig[role].labelAr;
  }

  isAccountActive(captain: CaptainProfile): boolean {
    return captain.accountStatus === 'active';
  }

  onAccountToggle(driverId: string, active: boolean): void {
    // مفعّل ON → unlocked; OFF → locked
    this.driverService.toggleDriverLock(driverId, !active);
  }

  openAddModal(): void {
    this.modalMode.set('add');
    this.editingId.set(null);
    this.applyPasswordValidators('add');
    this.form.reset(
      {
        role: 'DELIVERY',
        name: '',
        phone: '',
        password: '',
        hubId: this.activeHubs()[0]?.id ?? '',
        vehicleType: 'Motorcycle',
      },
      { emitEvent: false },
    );
    this.syncVehicleControl('DELIVERY');
    this.modalOpen.set(true);
  }

  openEditModal(captain: CaptainProfile): void {
    this.modalMode.set('edit');
    this.editingId.set(captain.id);
    this.applyPasswordValidators('edit');
    this.form.reset(
      {
        role: captain.role,
        name: captain.name,
        phone: captain.phone,
        password: '',
        hubId: captain.hubId,
        vehicleType: captain.role === 'DELIVERY' ? captain.vehicleType : '',
      },
      { emitEvent: false },
    );
    this.syncVehicleControl(captain.role);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.editingId.set(null);
    this.form.reset();
  }

  /** Ignore clicks that land on portaled dropdowns inside the backdrop. */
  closeModalOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeModal();
    }
  }

  saveDriver(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const hub = this.hubService.getById(value.hubId);
    const password = value.password.trim();
    const isCollector = value.role === 'COLLECTOR';

    const payload: DriverFormData = {
      name: value.name.trim(),
      phone: value.phone.trim(),
      role: value.role,
      hubId: value.hubId,
      hubName: hub?.name ?? value.hubId,
      vehicleType: isCollector ? '' : value.vehicleType,
    };

    if (password) {
      payload.password = password;
    }

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

  private applyPasswordValidators(mode: ModalMode): void {
    const password = this.form.controls.password;
    if (mode === 'add') {
      password.setValidators(Validators.required);
    } else {
      password.clearValidators();
    }
    password.updateValueAndValidity({ emitEvent: false });
  }

  /** Delivery captains must pick a vehicle. Collectors have the control cleared and optional. */
  private syncVehicleControl(role: CaptainRole): void {
    const vehicle = this.form.controls.vehicleType;
    const isDelivery = role === 'DELIVERY';
    this.showVehicle.set(isDelivery);

    if (isDelivery) {
      vehicle.setValidators(Validators.required);
      if (!vehicle.value) {
        vehicle.markAsTouched();
      }
    } else {
      vehicle.clearValidators();
      vehicle.setValue('', { emitEvent: false });
    }

    vehicle.updateValueAndValidity();
  }
}
