import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgClass, DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import {
  slicePage,
  TablePagerComponent,
} from '../../../shared/components/table-pager/table-pager.component';
import { DriverService } from '../../../core/services/driver.service';
import { HubService } from '../../../core/services/hub.service';
import {
  AVAILABILITY_CONFIG,
  ACCOUNT_STATUS_CONFIG,
  CaptainProfile,
  CaptainRole,
  CaptainVehicleType,
  DRIVER_CURRENCY,
  RESOLUTION_CONFIG,
  ROLE_CONFIG,
  ROLE_OPTIONS,
  SEVERITY_CONFIG,
  VEHICLE_OPTIONS,
  getInitials,
} from '../data/drivers.mock';

@Component({
  selector: 'ctrl-driver-details',
  standalone: true,
  imports: [
    NgClass,
    DecimalPipe,
    ReactiveFormsModule,
    TableModule,
    SelectModule,
    InputTextModule,
    StatCardComponent,
    TablePagerComponent,
  ],
  templateUrl: './driver-details.component.html',
  styleUrl: './driver-details.component.scss',
})
export class DriverDetailsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly driverService = inject(DriverService);
  private readonly hubService = inject(HubService);

  readonly availabilityConfig = AVAILABILITY_CONFIG;
  readonly accountStatusConfig = ACCOUNT_STATUS_CONFIG;
  readonly severityConfig = SEVERITY_CONFIG;
  readonly resolutionConfig = RESOLUTION_CONFIG;
  readonly roleConfig = ROLE_CONFIG;
  readonly currency = DRIVER_CURRENCY;
  readonly roleOptions = ROLE_OPTIONS;
  readonly vehicleOptions = VEHICLE_OPTIONS;
  readonly activeHubs = this.hubService.activeHubs;
  readonly showVehicle = signal(true);

  private readonly driverId = signal<string | null>(null);

  /** Live from DriverService — updates when list/modal edits the same record. */
  readonly driver = computed(() => {
    const id = this.driverId();
    if (!id) return null;
    return this.driverService.drivers().find((d) => d.id === id) ?? null;
  });

  readonly isEditing = signal(false);

  readonly ordersPage = signal(0);
  readonly ordersPageSize = signal(10);
  readonly complaintsPage = signal(0);
  readonly complaintsPageSize = signal(10);

  readonly deliveredOrders = computed(() => this.driver()?.deliveredOrders ?? []);
  readonly complaints = computed(() => this.driver()?.complaints ?? []);
  readonly pagedOrders = computed(() =>
    slicePage(this.deliveredOrders(), this.ordersPage(), this.ordersPageSize()),
  );
  readonly pagedComplaints = computed(() =>
    slicePage(this.complaints(), this.complaintsPage(), this.complaintsPageSize()),
  );

  readonly profileForm = this.fb.nonNullable.group({
    name:          ['', Validators.required],
    phone:         ['', Validators.required],
    role:          ['DELIVERY' as CaptainRole, Validators.required],
    hubId:         ['', Validators.required],
    vehicleType:   ['' as CaptainVehicleType | ''],
    licenseExpiry: ['', Validators.required],
  });

  constructor() {
    this.profileForm.controls.role.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((role) => this.syncVehicleControl(role));
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/drivers']);
      return;
    }
    this.driverId.set(id);
  }

  getInitials(name: string): string {
    return getInitials(name);
  }

  vehicleLabel(type: CaptainVehicleType | ''): string {
    if (!type) return '—';
    return this.vehicleOptions.find(v => v.value === type)?.label ?? type;
  }

  startEdit(): void {
    const d = this.driver();
    if (!d) return;
    this.profileForm.patchValue({
      name:          d.name,
      phone:         d.phone,
      role:          d.role,
      hubId:         d.hubId,
      vehicleType:   d.role === 'DELIVERY' ? d.vehicleType : '',
      licenseExpiry: d.licenseExpiry,
    }, { emitEvent: false });
    this.syncVehicleControl(d.role);
    this.isEditing.set(true);
  }

  cancelEdit(): void {
    this.isEditing.set(false);
    this.profileForm.reset();
  }

  saveProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    const d = this.driver();
    if (!d) return;

    const v = this.profileForm.getRawValue();
    const hub = this.hubService.getById(v.hubId);
    const isCollector = v.role === 'COLLECTOR';

    const patch: Partial<CaptainProfile> = {
      name:          v.name,
      phone:         v.phone,
      role:          v.role,
      hubId:         v.hubId,
      hubName:       hub?.name ?? d.hubName,
      vehicleType:   isCollector ? '' : v.vehicleType,
      licenseExpiry: v.licenseExpiry,
    };

    this.driverService.updateDriver(d.id, patch);
    this.isEditing.set(false);
  }

  private syncVehicleControl(role: CaptainRole): void {
    const vehicle = this.profileForm.controls.vehicleType;
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

  goBack(): void {
    this.router.navigate(['/drivers']);
  }
}
