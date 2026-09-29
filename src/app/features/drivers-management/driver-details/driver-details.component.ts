import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgClass, DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { DriverService } from '../../../core/services/driver.service';
import {
  AVAILABILITY_CONFIG,
  ACCOUNT_STATUS_CONFIG,
  DRIVER_CURRENCY,
  DriverProfile,
  RESOLUTION_CONFIG,
  SEVERITY_CONFIG,
  ZONE_OPTIONS,
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
  ],
  templateUrl: './driver-details.component.html',
  styleUrl: './driver-details.component.scss',
})
export class DriverDetailsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly driverService = inject(DriverService);

  readonly availabilityConfig = AVAILABILITY_CONFIG;
  readonly accountStatusConfig = ACCOUNT_STATUS_CONFIG;
  readonly severityConfig = SEVERITY_CONFIG;
  readonly resolutionConfig = RESOLUTION_CONFIG;
  readonly currency = DRIVER_CURRENCY;
  readonly zoneOptions = ZONE_OPTIONS;
  readonly vehicleOptions = [
    { label: 'دراجة نارية', value: 'Motorcycle' },
    { label: 'سيارة',       value: 'Car'        },
    { label: 'دراجة',       value: 'Bicycle'    },
  ];

  private readonly driverId = signal<string | null>(null);

  /** Live from DriverService — updates when list/modal edits the same record. */
  readonly driver = computed(() => {
    const id = this.driverId();
    if (!id) return null;
    return this.driverService.drivers().find((d) => d.id === id) ?? null;
  });

  readonly isEditing = signal(false);

  readonly recentOrders = computed(() => {
    const d = this.driver();
    return d ? d.deliveredOrders.slice(0, 10) : [];
  });

  readonly profileForm = this.fb.group({
    name:          ['', Validators.required],
    phone:         ['', Validators.required],
    vehicleType:   ['', Validators.required],
    licenseExpiry: ['', Validators.required],
    zoneId:        ['', Validators.required],
  });

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

  vehicleLabel(type: string): string {
    return this.vehicleOptions.find(v => v.value === type)?.label ?? type;
  }

  startEdit(): void {
    const d = this.driver();
    if (!d) return;
    this.profileForm.patchValue({
      name:          d.name,
      phone:         d.phone,
      vehicleType:   d.vehicleType,
      licenseExpiry: d.licenseExpiry,
      zoneId:        d.zoneId,
    });
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
    const zone = ZONE_OPTIONS.find(z => z.id === v.zoneId);

    const patch: Partial<DriverProfile> = {
      name:          v.name!,
      phone:         v.phone!,
      vehicleType:   v.vehicleType!,
      licenseExpiry: v.licenseExpiry!,
      zoneId:        v.zoneId!,
      zoneName:      zone?.name ?? d.zoneName,
    };

    this.driverService.updateDriver(d.id, patch);
    this.isEditing.set(false);
  }

  goBack(): void {
    this.router.navigate(['/drivers']);
  }
}
