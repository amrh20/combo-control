import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgClass, DecimalPipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import {
  CATEGORY_CONFIG,
  getEffectiveLiveStatus,
  getVendorById,
  getVendorInitials,
  LIVE_OVERRIDE_CONFIG,
  LIVE_STATUS_CONFIG,
  LiveStatusOverride,
  SystemStatus,
  updateVendor,
  VendorProfile,
  ZONE_OPTIONS,
  dateToTimeString,
  timeStringToDate,
} from '../data/vendors.mock';

@Component({
  selector: 'ctrl-vendor-details',
  standalone: true,
  imports: [
    NgClass,
    DecimalPipe,
    FormsModule,
    ReactiveFormsModule,
    SelectModule,
    InputTextModule,
    InputNumberModule,
    DatePickerModule,
    ToggleSwitchModule,
    StatCardComponent,
  ],
  templateUrl: './vendor-details.component.html',
  styleUrl: './vendor-details.component.scss',
})
export class VendorDetailsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly categoryConfig = CATEGORY_CONFIG;
  readonly liveStatusConfig = LIVE_STATUS_CONFIG;
  readonly liveOverrideConfig = LIVE_OVERRIDE_CONFIG;
  readonly zoneOptions = ZONE_OPTIONS;

  readonly categoryOptions = Object.entries(CATEGORY_CONFIG).map(([value, cfg]) => ({
    label: cfg.labelAr,
    value,
  }));

  readonly overrideOptions: { value: LiveStatusOverride; label: string; hint: string }[] = [
    { value: 'auto',         label: LIVE_OVERRIDE_CONFIG.auto.label,         hint: LIVE_OVERRIDE_CONFIG.auto.description },
    { value: 'force_busy',   label: LIVE_OVERRIDE_CONFIG.force_busy.label,   hint: LIVE_OVERRIDE_CONFIG.force_busy.description },
    { value: 'force_closed', label: LIVE_OVERRIDE_CONFIG.force_closed.label, hint: LIVE_OVERRIDE_CONFIG.force_closed.description },
  ];

  private readonly vendorSignal = signal<VendorProfile | null>(null);
  readonly vendor = this.vendorSignal.asReadonly();

  readonly liveStatus = computed(() => {
    const v = this.vendor();
    return v ? getEffectiveLiveStatus(v) : 'closed';
  });

  readonly vendorForm = this.fb.group({
    name:          ['', Validators.required],
    phone:         ['', Validators.required],
    contactPerson: ['', Validators.required],
    zoneId:        ['', Validators.required],
    category:      ['', Validators.required],
    openingTime:   [null as Date | null],
    closingTime:   [null as Date | null],
    liveStatusOverride: ['auto' as LiveStatusOverride],
    discountPercent:    [0, [Validators.min(0), Validators.max(100)]],
    commissionRate:     [{ value: 0, disabled: true }],
    systemStatus:       ['active' as SystemStatus],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/vendors']);
      return;
    }
    this.loadVendor(id);
  }

  getInitials(name: string): string {
    return getVendorInitials(name);
  }

  goBack(): void {
    this.router.navigate(['/vendors']);
  }

  saveChanges(): void {
    if (this.vendorForm.invalid) {
      this.vendorForm.markAllAsTouched();
      return;
    }

    const current = this.vendor();
    if (!current) return;

    const raw = this.vendorForm.getRawValue();
    const zone = ZONE_OPTIONS.find(z => z.id === raw.zoneId);

    const patch: Partial<VendorProfile> = {
      name:          raw.name!,
      phone:         raw.phone!,
      contactPerson: raw.contactPerson!,
      zoneId:        raw.zoneId!,
      zoneName:      zone?.name ?? current.zoneName,
      category:      raw.category as VendorProfile['category'],
      liveStatusOverride: raw.liveStatusOverride!,
      discountPercent:    raw.discountPercent ?? 0,
      systemStatus:       raw.systemStatus!,
      settings: {
        ...current.settings,
        openingTime: dateToTimeString(raw.openingTime),
        closingTime: dateToTimeString(raw.closingTime),
      },
    };

    if (raw.liveStatusOverride === 'force_busy') {
      patch.liveStatus = 'busy';
      patch.nextOpeningTime = undefined;
    } else if (raw.liveStatusOverride === 'force_closed') {
      patch.liveStatus = 'closed';
      patch.nextOpeningTime = undefined;
    } else {
      patch.liveStatus = current.liveStatus;
    }

    updateVendor(current.id, patch);
    this.vendorSignal.set({ ...current, ...patch });
  }

  onSystemToggle(active: boolean): void {
    const systemStatus: SystemStatus = active ? 'active' : 'inactive';
    this.vendorForm.patchValue({ systemStatus });
    const current = this.vendor();
    if (!current) return;
    updateVendor(current.id, { systemStatus });
    this.vendorSignal.set({ ...current, systemStatus });
  }

  isSystemActive(): boolean {
    return this.vendorForm.get('systemStatus')?.value === 'active';
  }

  private loadVendor(id: string): void {
    const found = getVendorById(id);
    if (!found) {
      this.vendorSignal.set(null);
      return;
    }

    const vendor = structuredClone(found);
    this.vendorSignal.set(vendor);

    this.vendorForm.patchValue({
      name:          vendor.name,
      phone:         vendor.phone,
      contactPerson: vendor.contactPerson,
      zoneId:        vendor.zoneId,
      category:      vendor.category,
      openingTime:   timeStringToDate(vendor.settings.openingTime),
      closingTime:   timeStringToDate(vendor.settings.closingTime),
      liveStatusOverride: vendor.liveStatusOverride,
      discountPercent:    vendor.discountPercent,
      commissionRate:     vendor.commissionRate,
      systemStatus:       vendor.systemStatus,
    });
  }
}
