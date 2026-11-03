import { Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { debounceTime, distinctUntilChanged, map } from 'rxjs';
import {
  OpsCustomerSavedAddress,
  OpsCustomerSearchResult,
  OpsOrderingHub,
  OpsOrderingSubZone,
} from '../../../../core/models/ops-create-order.model';
import { OpsCreateOrderService } from '../../../../core/services/ops-create-order.service';
import { OpsOrderWizardService } from '../ops-order-wizard.service';

interface ParentZoneOption {
  id: string;
  name: string;
}

@Component({
  selector: 'ctrl-order-setup-step',
  standalone: true,
  imports: [ReactiveFormsModule, SelectModule],
  templateUrl: './order-setup-step.component.html',
  styles: [
    `
      :host ::ng-deep .order-select.p-select {
        width: 100%;
        min-height: 2.5rem;
        align-items: center;
        border-radius: 0.375rem;
        border-color: #e5e7eb;
        background: #fff;
      }
      :host ::ng-deep .order-select .p-select-label {
        font-size: 0.875rem;
        padding-inline: 0.625rem;
      }
    `,
  ],
})
export class OrderSetupStepComponent {
  readonly hubs = input.required<OpsOrderingHub[]>();
  readonly subZones = input.required<OpsOrderingSubZone[]>();
  readonly lookupsLoading = input(false);
  readonly showErrors = input(false);

  private readonly fb = inject(FormBuilder);
  private readonly ops = inject(OpsCreateOrderService);
  private readonly wizard = inject(OpsOrderWizardService);
  private readonly destroyRef = inject(DestroyRef);
  private phoneSearchGeneration = 0;
  private ignoreParentChange = false;

  readonly customerSearchLoading = signal(false);
  readonly searchedCustomer = signal<OpsCustomerSearchResult | null>(null);
  readonly selectedAddressId = signal<string | null>(null);
  private readonly formRevision = signal(0);

  readonly form = this.fb.nonNullable.group({
    phone: ['', [Validators.required, Validators.pattern(/^01[0125]\d{8}$/)]],
    customerName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    customerId: [''],
    parentZoneId: this.fb.control<string | null>(null, Validators.required),
    subZoneId: this.fb.control<string | null>(null, Validators.required),
    addressDetails: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(300)]],
    hubId: this.fb.control<string | null>(null, Validators.required),
  });

  readonly parentZones = computed((): ParentZoneOption[] => {
    const seen = new Map<string, ParentZoneOption>();
    let hasOrphans = false;
    for (const zone of this.subZones()) {
      if (!zone.zoneId) {
        hasOrphans = true;
        continue;
      }
      if (!seen.has(zone.zoneId)) {
        seen.set(zone.zoneId, { id: zone.zoneId, name: zone.zoneName || 'منطقة' });
      }
    }
    const zones = [...seen.values()];
    if (hasOrphans) {
      zones.push({ id: '__none__', name: 'بدون منطقة أساسية' });
    }
    return zones;
  });

  readonly childSubZones = computed(() => {
    this.formRevision();
    const parentId = this.form.controls.parentZoneId.value;
    if (!parentId) {
      return [] as OpsOrderingSubZone[];
    }
    if (parentId === '__none__') {
      return this.subZones().filter((zone) => !zone.zoneId);
    }
    return this.subZones().filter((zone) => zone.zoneId === parentId);
  });

  readonly eligibleHubs = computed(() => {
    this.formRevision();
    const subZoneId = this.form.controls.subZoneId.value;
    const subZone = subZoneId ? this.subZones().find((zone) => zone.id === subZoneId) : undefined;
    if (!subZone) {
      return [] as OpsOrderingHub[];
    }
    const hubIds = new Set(subZone.hubIds);
    return this.hubs().filter((hub) => hubIds.has(hub.id));
  });

  readonly savedAddresses = computed(() => {
    const customer = this.searchedCustomer();
    if (!customer || customer.status === 'BLOCKED') {
      return [] as OpsCustomerSavedAddress[];
    }
    return customer.addresses;
  });

  readonly customerBlocked = computed(() => this.searchedCustomer()?.status === 'BLOCKED');

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.formRevision.update((value) => value + 1);
    });

    const draft = this.wizard.snapshot();
    this.form.patchValue(
      {
        phone: draft.customer.phone,
        customerName: draft.customer.name,
        customerId: draft.customer.customerId,
        parentZoneId: draft.location.parentZoneId,
        subZoneId: draft.location.subZoneId,
        addressDetails: draft.location.addressDetails,
        hubId: draft.location.hubId,
      },
      { emitEvent: false },
    );

    this.form.controls.phone.valueChanges.pipe(takeUntilDestroyed()).subscribe((phone) => {
      const digits = phone.replace(/\D/g, '').slice(0, 11);
      if (digits !== phone) {
        this.form.controls.phone.setValue(digits, { emitEvent: false });
      }
      this.wizard.patchCustomer({ phone: digits });
    });

    this.form.controls.phone.valueChanges
      .pipe(
        debounceTime(500),
        map((phone) => phone.replace(/\D/g, '').slice(0, 11)),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((digits) => this.onPhoneDebounced(digits));

    this.form.controls.customerName.valueChanges.pipe(takeUntilDestroyed()).subscribe((name) => {
      this.wizard.patchCustomer({ name });
    });

    this.form.controls.parentZoneId.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((zoneId) => this.onParentZoneChanged(zoneId));

    this.form.controls.subZoneId.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((subZoneId) => this.onSubZoneChanged(subZoneId));

    this.form.controls.addressDetails.valueChanges.pipe(takeUntilDestroyed()).subscribe((addressDetails) => {
      this.wizard.patchLocation({ addressDetails });
      this.clearSavedAddressIfMismatch();
    });

    this.form.controls.hubId.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((hubId) => this.wizard.patchLocation({ hubId }));
  }

  valid(): boolean {
    return this.form.valid && !this.customerBlocked();
  }

  markTouched(): void {
    this.form.markAllAsTouched();
  }

  selectSavedAddress(address: OpsCustomerSavedAddress): void {
    this.selectedAddressId.set(address.id);
    this.form.controls.addressDetails.setValue(address.line);
    if (address.subZoneId) {
      this.form.controls.subZoneId.setValue(address.subZoneId);
    }
  }

  clearCustomerLink(): void {
    this.form.controls.customerId.setValue('');
    this.wizard.patchCustomer({ customerId: '' });
    this.searchedCustomer.set(null);
    this.selectedAddressId.set(null);
  }

  private onPhoneDebounced(digits: string): void {
    if (digits.length !== 11) {
      this.form.controls.customerId.setValue('');
      this.wizard.patchCustomer({ customerId: '' });
      this.searchedCustomer.set(null);
      this.selectedAddressId.set(null);
      return;
    }
    const generation = ++this.phoneSearchGeneration;
    this.customerSearchLoading.set(true);
    this.ops
      .searchCustomerByPhone(digits)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (customer) => {
          if (generation !== this.phoneSearchGeneration) {
            return;
          }
          this.customerSearchLoading.set(false);
          if (!customer) {
            this.form.controls.customerId.setValue('');
            this.wizard.patchCustomer({ customerId: '' });
            this.searchedCustomer.set(null);
            this.selectedAddressId.set(null);
            return;
          }
          this.searchedCustomer.set(customer);
          this.form.patchValue({
            customerName: customer.name,
            customerId: customer.id,
            phone: customer.phone,
          });
          this.wizard.patchCustomer({
            name: customer.name,
            customerId: customer.id,
            phone: customer.phone,
          });
          const address = customer.addresses.find((row) => row.isDefault) ?? customer.addresses[0];
          if (address && customer.status !== 'BLOCKED') {
            this.selectSavedAddress(address);
          }
        },
        error: () => {
          if (generation !== this.phoneSearchGeneration) {
            return;
          }
          this.customerSearchLoading.set(false);
        },
      });
  }

  private onParentZoneChanged(zoneId: string | null): void {
    if (this.ignoreParentChange) {
      this.wizard.patchLocation({ parentZoneId: zoneId });
      return;
    }
    const current = this.subZones().find((zone) => zone.id === this.form.controls.subZoneId.value);
    if (current && this.parentIdOf(current) === zoneId) {
      this.wizard.patchLocation({ parentZoneId: zoneId });
      return;
    }
    this.form.controls.subZoneId.setValue(null);
    this.form.controls.hubId.setValue(null);
    this.wizard.patchLocation({ parentZoneId: zoneId, subZoneId: null, hubId: null });
  }

  private onSubZoneChanged(subZoneId: string | null): void {
    this.syncParentFromSubZone(subZoneId);
    const hubId = this.form.controls.hubId.value;
    const subZone = subZoneId ? this.subZones().find((zone) => zone.id === subZoneId) : undefined;
    if (hubId && (!subZone || !subZone.hubIds.includes(hubId))) {
      this.form.controls.hubId.setValue(null, { emitEvent: false });
      this.wizard.patchLocation({ subZoneId, hubId: null });
    } else {
      this.wizard.patchLocation({ subZoneId });
    }
    this.clearSavedAddressIfMismatch();
  }

  private syncParentFromSubZone(subZoneId: string | null): void {
    if (!subZoneId) {
      return;
    }
    const zone = this.subZones().find((item) => item.id === subZoneId);
    if (!zone) {
      return;
    }
    const parentId = this.parentIdOf(zone);
    if (this.form.controls.parentZoneId.value === parentId) {
      return;
    }
    this.ignoreParentChange = true;
    this.form.controls.parentZoneId.setValue(parentId);
    this.ignoreParentChange = false;
    this.wizard.patchLocation({ parentZoneId: parentId });
  }

  private parentIdOf(zone: OpsOrderingSubZone): string {
    return zone.zoneId || '__none__';
  }

  private clearSavedAddressIfMismatch(): void {
    const id = this.selectedAddressId();
    if (!id) {
      return;
    }
    const address = this.savedAddresses().find((item) => item.id === id);
    if (
      !address ||
      (address.subZoneId && address.subZoneId !== this.form.controls.subZoneId.value) ||
      address.line !== this.form.controls.addressDetails.value
    ) {
      this.selectedAddressId.set(null);
    }
  }
}
