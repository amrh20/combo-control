import { Component, OnInit, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import {
  CATEGORY_CONFIG,
  getVendorById,
  LiveStatusOverride,
  syncVendorsFromState,
  SystemStatus,
  VendorProfile,
  VENDORS_STATE,
  ZONE_OPTIONS,
  dateToTimeString,
  timeStringToDate,
} from '../data/vendors.mock';

@Component({
  selector: 'ctrl-vendor-form',
  standalone: true,
  imports: [
    NgClass,
    FormsModule,
    ReactiveFormsModule,
    InputTextModule,
    SelectModule,
    InputNumberModule,
    DatePickerModule,
    ToggleSwitchModule,
  ],
  templateUrl: './vendor-form.component.html',
  styleUrl: './vendor-form.component.scss',
})
export class VendorFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  isEditMode = false;
  vendorId: string | null = null;

  readonly zoneOptions = ZONE_OPTIONS;
  readonly categoryOptions = Object.entries(CATEGORY_CONFIG).map(([value, cfg]) => ({
    label: cfg.labelAr,
    value,
  }));

  readonly overrideOptions = [
    { label: 'Auto', value: 'auto' as LiveStatusOverride },
    { label: 'Force Busy', value: 'force_busy' as LiveStatusOverride },
    { label: 'Force Closed', value: 'force_closed' as LiveStatusOverride },
  ];

  readonly form = this.fb.group({
    name:          ['', Validators.required],
    phone:         ['', Validators.required],
    contactPerson: ['', Validators.required],
    zoneId:        ['', Validators.required],
    category:      ['', Validators.required],
    openingTime:   [null as Date | null],
    closingTime:   [null as Date | null],
    liveStatusOverride: ['auto' as LiveStatusOverride],
    discountPercent:    [0, [Validators.min(0), Validators.max(100)]],
    systemStatus:       ['active' as SystemStatus],
    autoAccept:           [false],
  });

  ngOnInit(): void {
    this.vendorId   = this.route.snapshot.paramMap.get('id');
    this.isEditMode = !!this.vendorId;

    if (this.isEditMode && this.vendorId) {
      const existing = getVendorById(this.vendorId);
      if (existing) {
        this.patchFromVendor(existing);
      }
    } else {
      this.form.patchValue({
        openingTime: timeStringToDate('09:00'),
        closingTime: timeStringToDate('23:00'),
      });
    }
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const zone = ZONE_OPTIONS.find(z => z.id === raw.zoneId);

    if (this.isEditMode && this.vendorId) {
      const idx = VENDORS_STATE.findIndex(v => v.id === this.vendorId);
      if (idx >= 0) {
        VENDORS_STATE[idx] = {
          ...VENDORS_STATE[idx],
          name:          raw.name!,
          phone:         raw.phone!,
          contactPerson: raw.contactPerson!,
          zoneId:        raw.zoneId!,
          zoneName:      zone?.name ?? VENDORS_STATE[idx].zoneName,
          category:      raw.category as VendorProfile['category'],
          liveStatusOverride: raw.liveStatusOverride!,
          discountPercent:    raw.discountPercent ?? 0,
          systemStatus:       raw.systemStatus!,
          settings: {
            ...VENDORS_STATE[idx].settings,
            openingTime: dateToTimeString(raw.openingTime),
            closingTime: dateToTimeString(raw.closingTime),
            autoAccept:  raw.autoAccept ?? false,
          },
        };
      }
      this.router.navigate(['/vendors', this.vendorId]);
    } else {
      this.router.navigate(['/vendors']);
    }
  }

  cancel(): void {
    this.router.navigate(['/vendors']);
  }

  private patchFromVendor(vendor: VendorProfile): void {
    this.form.patchValue({
      name:          vendor.name,
      phone:         vendor.phone,
      contactPerson: vendor.contactPerson,
      zoneId:        vendor.zoneId,
      category:      vendor.category,
      openingTime:   timeStringToDate(vendor.settings.openingTime),
      closingTime:   timeStringToDate(vendor.settings.closingTime),
      liveStatusOverride: vendor.liveStatusOverride,
      discountPercent:    vendor.discountPercent,
      systemStatus:       vendor.systemStatus,
      autoAccept:         vendor.settings.autoAccept,
    });
  }
}
