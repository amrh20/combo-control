import { DecimalPipe } from '@angular/common';
import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { merge } from 'rxjs';
import { Customer } from '../../../core/models/customer.model';
import { CustomerService } from '../../../core/services/customer.service';
import { HubService } from '../../../core/services/hub.service';
import { SubZoneService } from '../../../core/services/sub-zone.service';
import {
  LIVE_STATUS_CONFIG,
  LiveStatus,
  VENDORS_DATA,
  VendorProfile,
} from '../../vendors-management/data/vendors.mock';

/** One drop-off fee per order. The pin's sub-zone picks the amount. */
const DROP_OFF_FEES: Readonly<Record<string, number>> = {
  'SZ-001': 25,
  'SZ-002': 35,
  'SZ-003': 30,
  'SZ-004': 45,
};

const FALLBACK_DELIVERY_FEE = 25;

interface SavedAddress {
  id: string;
  customerId: string;
  label: string;
  subZoneId: string;
  details: string;
}

/** Mock book of addresses keyed to seeded customers. Zones match active sub-zones. */
const SAVED_ADDRESSES: readonly SavedAddress[] = [
  {
    id: 'ADR-001',
    customerId: 'CUS-001',
    label: 'المنزل',
    subZoneId: 'SZ-001',
    details: 'عمارة 12، شقة 4، شارع النصر',
  },
  {
    id: 'ADR-002',
    customerId: 'CUS-001',
    label: 'العمل',
    subZoneId: 'SZ-002',
    details: 'برج دجلة، الدور 8، مكتب 802',
  },
  {
    id: 'ADR-003',
    customerId: 'CUS-002',
    label: 'المنزل',
    subZoneId: 'SZ-003',
    details: 'عمارة 5، شقة 2، شارع عباس العقاد',
  },
  {
    id: 'ADR-004',
    customerId: 'CUS-004',
    label: 'المنزل',
    subZoneId: 'SZ-001',
    details: 'فيلا 9، شارع 12، الحي الأول',
  },
  {
    id: 'ADR-005',
    customerId: 'CUS-004',
    label: 'الأهل',
    subZoneId: 'SZ-002',
    details: 'عمارة 3، شقة 11، كورنيش المعادي',
  },
  {
    id: 'ADR-006',
    customerId: 'CUS-005',
    label: 'المنزل',
    subZoneId: 'SZ-003',
    details: 'عمارة 18، شقة 6، الحي السابع',
  },
  {
    id: 'ADR-007',
    customerId: 'CUS-008',
    label: 'العمل',
    subZoneId: 'SZ-001',
    details: 'مبنى 4، الدور الأرضي، شارع 9',
  },
  {
    id: 'ADR-008',
    customerId: 'CUS-010',
    label: 'المنزل',
    subZoneId: 'SZ-002',
    details: 'عمارة 7، شقة 1، شارع النيل',
  },
];

interface ItemControls {
  name: FormControl<string>;
  qty: FormControl<number | null>;
  price: FormControl<number | null>;
}

type ItemGroup = FormGroup<ItemControls>;

interface VendorCartControls {
  vendorId: FormControl<string>;
  items: FormArray<ItemGroup>;
}

type VendorCartGroup = FormGroup<VendorCartControls>;

interface ManualOrderControls {
  phone: FormControl<string>;
  customerName: FormControl<string>;
  customerId: FormControl<string>;
  subZoneId: FormControl<string>;
  addressDetails: FormControl<string>;
  hubId: FormControl<string>;
  vendorCarts: FormArray<VendorCartGroup>;
}

@Component({
  selector: 'ctrl-create-order',
  standalone: true,
  imports: [DecimalPipe, ReactiveFormsModule],
  templateUrl: './create-order.component.html',
})
export class CreateOrderComponent {
  private readonly fb = inject(FormBuilder);
  private readonly customers = inject(CustomerService);
  private readonly hubs = inject(HubService);
  private readonly subZones = inject(SubZoneService);
  private readonly vendorDirectory = new Map(VENDORS_DATA.map((vendor) => [vendor.id, vendor]));
  private readonly destroyRef = inject(DestroyRef);
  private pickingCustomer = false;
  private nextOrderNumber = 2501;
  private lookupTimer: ReturnType<typeof setTimeout> | null = null;

  readonly statusLabels = LIVE_STATUS_CONFIG;
  readonly dropZones = this.subZones.activeSubZones;
  readonly lookupOpen = signal(false);
  readonly activeSuggestion = signal(0);
  readonly submitted = signal(false);
  readonly dispatchedId = signal<string | null>(null);
  readonly mapOpen = signal(false);
  readonly selectedAddressId = signal<string | null>(null);

  readonly form = this.fb.group<ManualOrderControls>({
    phone: this.fb.nonNullable.control('', {
      validators: [Validators.required, Validators.pattern(/^01[0125]\d{8}$/)],
    }),
    customerName: this.fb.nonNullable.control('', Validators.required),
    customerId: this.fb.nonNullable.control(''),
    subZoneId: this.fb.nonNullable.control('', Validators.required),
    addressDetails: this.fb.nonNullable.control('', Validators.required),
    hubId: this.fb.nonNullable.control('', Validators.required),
    vendorCarts: this.fb.array<VendorCartGroup>([], Validators.minLength(1)),
  });

  private readonly revision = signal(0);

  readonly formState = computed(() => {
    this.revision();
    return this.form.getRawValue();
  });

  readonly phoneSuggestions = computed(() => {
    const digits = (this.formState().phone ?? '').replace(/\D/g, '');
    if (digits.length < 2) {
      return [];
    }
    return this.customers
      .customers()
      .filter((customer) => customer.phone.includes(digits))
      .slice(0, 6);
  });

  readonly showLookup = computed(() => {
    const digits = (this.formState().phone ?? '').replace(/\D/g, '');
    return this.lookupOpen() && digits.length >= 2;
  });

  readonly linkedCustomer = computed(() => {
    const id = this.formState().customerId;
    if (!id) {
      return null;
    }
    return this.customers.customers().find((customer) => customer.id === id) ?? null;
  });

  /** Linked profile, or an exact 11-digit phone hit before the link is stored. */
  readonly addressCustomer = computed(() => {
    const linked = this.linkedCustomer();
    if (linked) {
      return linked;
    }
    const digits = (this.formState().phone ?? '').replace(/\D/g, '');
    if (digits.length !== 11) {
      return null;
    }
    return this.customers.customers().find((customer) => customer.phone === digits) ?? null;
  });

  readonly savedAddresses = computed(() => {
    const customer = this.addressCustomer();
    if (!customer || customer.status === 'BLOCKED') {
      return [];
    }
    return SAVED_ADDRESSES.filter((address) => address.customerId === customer.id);
  });

  /** Exact phone match. Clearing the name link does not bypass a blocked account. */
  readonly blockedMatch = computed(() => {
    const digits = (this.formState().phone ?? '').replace(/\D/g, '');
    if (digits.length !== 11) {
      return null;
    }
    return (
      this.customers.customers().find(
        (customer) => customer.phone === digits && customer.status === 'BLOCKED',
      ) ?? null
    );
  });

  readonly customerBlocked = computed(() => this.blockedMatch() !== null);

  readonly selectedSubZoneName = computed(() => {
    const id = this.formState().subZoneId;
    return id ? (this.subZones.getById(id)?.name ?? '') : '';
  });

  readonly eligibleHubs = computed(() => {
    const subZoneId = this.formState().subZoneId;
    if (!subZoneId) {
      return [];
    }
    return this.hubs.activeHubs().filter((hub) => hub.servingSubZoneIds.includes(subZoneId));
  });

  readonly selectedHubName = computed(() => {
    const id = this.formState().hubId;
    return id ? this.hubs.nameOf(id) : '';
  });

  readonly hubVendors = computed(() => {
    const hubId = this.formState().hubId;
    if (!hubId) {
      return [];
    }
    return VENDORS_DATA.filter(
      (vendor) => vendor.hubId === hubId && vendor.systemStatus === 'active',
    );
  });

  readonly itemCount = computed(() =>
    (this.formState().vendorCarts ?? []).reduce(
      (count, cart) => count + (cart.items?.length ?? 0),
      0,
    ),
  );

  readonly subtotal = computed(() =>
    (this.formState().vendorCarts ?? []).reduce((sum, cart) => {
      const items = cart.items ?? [];
      return (
        sum +
        items.reduce((line, item) => {
          const qty = Number(item.qty) || 0;
          const price = Number(item.price) || 0;
          return line + qty * price;
        }, 0)
      );
    }, 0),
  );

  readonly deliveryFee = computed(() => {
    const subZoneId = this.formState().subZoneId;
    if (!subZoneId) {
      return null;
    }
    return DROP_OFF_FEES[subZoneId] ?? FALLBACK_DELIVERY_FEE;
  });

  readonly total = computed(() => {
    const fee = this.deliveryFee();
    if (fee == null) {
      return null;
    }
    return this.subtotal() + fee;
  });

  readonly missingPieces = computed(() => {
    this.formState();
    const missing: string[] = [];
    if (this.form.controls.phone.invalid) {
      missing.push('رقم هاتف صحيح');
    }
    if (this.form.controls.customerName.invalid) {
      missing.push('اسم العميل');
    }
    if (this.form.controls.subZoneId.invalid) {
      missing.push('المنطقة الفرعية');
    }
    if (this.form.controls.addressDetails.invalid) {
      missing.push('تفاصيل العنوان');
    }
    if (this.form.controls.hubId.invalid) {
      missing.push('مركز الانطلاق');
    } else if (this.vendorCarts.length === 0) {
      missing.push('متجر واحد على الأقل');
    } else if (this.vendorCarts.controls.some((cart) => cart.invalid)) {
      missing.push('أصناف مكتملة لكل متجر');
    }
    return missing;
  });

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.lookupTimer !== null) {
        clearTimeout(this.lookupTimer);
      }
    });

    merge(this.form.valueChanges, this.form.statusChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.revision.update((value) => value + 1));

    this.form.controls.phone.valueChanges.pipe(takeUntilDestroyed()).subscribe((phone) => {
      const digits = phone.replace(/\D/g, '').slice(0, 11);
      if (digits !== phone) {
        this.form.controls.phone.setValue(digits);
        return;
      }
      if (this.pickingCustomer) {
        return;
      }
      this.activeSuggestion.set(0);
      const linkedId = this.form.controls.customerId.value;
      if (linkedId) {
        const linked = this.customers.customers().find((customer) => customer.id === linkedId);
        if (linked && linked.phone !== digits) {
          this.form.controls.customerId.setValue('');
          this.selectedAddressId.set(null);
        }
      }
      this.lookupOpen.set(digits.length >= 2);
      if (digits.length === 11) {
        const match = this.customers.customers().find((customer) => customer.phone === digits);
        if (match && this.form.controls.customerId.value !== match.id) {
          this.selectCustomer(match);
        }
      }
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.mapOpen()) {
      this.mapOpen.set(false);
    }
  }

  get vendorCarts(): FormArray<VendorCartGroup> {
    return this.form.controls.vendorCarts;
  }

  vendorProfile(vendorId: string): VendorProfile | undefined {
    return this.vendorDirectory.get(vendorId);
  }

  vendorName(vendorId: string): string {
    return this.vendorDirectory.get(vendorId)?.name ?? vendorId;
  }

  subZoneName(subZoneId: string): string {
    return this.subZones.getById(subZoneId)?.name ?? '';
  }

  isVendorSelected(vendorId: string): boolean {
    return this.vendorCarts.controls.some((cart) => cart.controls.vendorId.value === vendorId);
  }

  statusClass(status: LiveStatus): string {
    if (status === 'open') {
      return 'bg-emerald-50 text-emerald-700';
    }
    if (status === 'busy') {
      return 'bg-amber-50 text-amber-700';
    }
    return 'bg-gray-100 text-gray-500';
  }

  formatPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 11) {
      return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
    }
    return phone;
  }

  lineTotal(item: ItemGroup): number {
    const qty = Number(item.controls.qty.value) || 0;
    const price = Number(item.controls.price.value) || 0;
    return qty * price;
  }

  onPhoneFocus(): void {
    this.clearLookupTimer();
    const digits = this.form.controls.phone.value.replace(/\D/g, '');
    this.lookupOpen.set(digits.length >= 2);
  }

  onPhoneBlur(): void {
    this.clearLookupTimer();
    this.lookupTimer = setTimeout(() => {
      this.lookupOpen.set(false);
      this.lookupTimer = null;
    }, 150);
  }

  onPhoneKeydown(event: KeyboardEvent): void {
    const suggestions = this.phoneSuggestions();
    const open = this.lookupOpen() && suggestions.length > 0;
    if (event.key === 'ArrowDown' && open) {
      event.preventDefault();
      this.activeSuggestion.update((index) => (index + 1) % suggestions.length);
      return;
    }
    if (event.key === 'ArrowUp' && open) {
      event.preventDefault();
      const next = this.activeSuggestion() - 1;
      this.activeSuggestion.set(next < 0 ? suggestions.length - 1 : next);
      return;
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      event.stopPropagation();
      const pick = suggestions[this.activeSuggestion()] ?? suggestions[0];
      if (pick) {
        this.selectCustomer(pick);
      }
      return;
    }
    if (event.key === 'Escape') {
      this.lookupOpen.set(false);
    }
  }

  selectCustomer(customer: Customer): void {
    const previousId = this.form.controls.customerId.value;
    this.pickingCustomer = true;
    this.form.patchValue({
      phone: customer.phone,
      customerName: customer.fullName,
      customerId: customer.id,
    });
    this.pickingCustomer = false;
    this.lookupOpen.set(false);
    this.form.controls.customerName.markAsDirty();
    if (previousId !== customer.id) {
      this.selectedAddressId.set(null);
      this.form.controls.subZoneId.setValue('');
      this.form.controls.addressDetails.setValue('');
      this.form.controls.hubId.setValue('');
      this.vendorCarts.clear();
    }
  }

  clearCustomerLink(): void {
    this.form.controls.customerId.setValue('');
    this.selectedAddressId.set(null);
  }

  selectSavedAddress(address: SavedAddress): void {
    this.selectedAddressId.set(address.id);
    this.form.controls.subZoneId.setValue(address.subZoneId);
    this.form.controls.subZoneId.markAsTouched();
    this.form.controls.addressDetails.setValue(address.details);
    this.form.controls.addressDetails.markAsDirty();
    this.syncHubWithSubZone(address.subZoneId);
  }

  onSubZoneChange(event: Event): void {
    const subZoneId = event.target instanceof HTMLSelectElement ? event.target.value : '';
    if (this.form.controls.subZoneId.value !== subZoneId) {
      this.form.controls.subZoneId.setValue(subZoneId);
    }
    this.form.controls.subZoneId.markAsTouched();
    this.clearSavedAddressIfMismatch();
    this.syncHubWithSubZone(subZoneId);
  }

  onAddressInput(): void {
    this.clearSavedAddressIfMismatch();
  }

  openMap(): void {
    this.mapOpen.set(true);
  }

  closeMap(): void {
    this.mapOpen.set(false);
  }

  applyMapZone(subZoneId: string): void {
    this.form.controls.subZoneId.setValue(subZoneId);
    this.form.controls.subZoneId.markAsTouched();
    this.clearSavedAddressIfMismatch();
    this.syncHubWithSubZone(subZoneId);
    this.mapOpen.set(false);
  }

  onHubChange(): void {
    const hubId = this.form.controls.hubId.value;
    const keepsCurrentHub =
      !!hubId &&
      this.vendorCarts.controls.every((cart) => {
        const vendor = this.vendorDirectory.get(cart.controls.vendorId.value);
        return vendor?.hubId === hubId;
      });
    if (!keepsCurrentHub) {
      this.vendorCarts.clear();
    }
  }

  toggleVendor(vendor: VendorProfile): void {
    const index = this.vendorCarts.controls.findIndex(
      (cart) => cart.controls.vendorId.value === vendor.id,
    );
    if (index >= 0) {
      this.vendorCarts.removeAt(index);
      return;
    }
    this.vendorCarts.push(this.createVendorCart(vendor.id));
  }

  addItem(cart: VendorCartGroup): void {
    cart.controls.items.push(this.createItem());
  }

  removeItem(cart: VendorCartGroup, index: number): void {
    const items = cart.controls.items;
    if (items.length === 1) {
      items.at(0).reset({ name: '', qty: 1, price: null });
      return;
    }
    items.removeAt(index);
  }

  removeVendor(vendorId: string): void {
    const index = this.vendorCarts.controls.findIndex(
      (cart) => cart.controls.vendorId.value === vendorId,
    );
    if (index >= 0) {
      this.vendorCarts.removeAt(index);
    }
  }

  scrollTo(anchor: string): void {
    document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  blockEnter(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.tagName === 'BUTTON' || target.tagName === 'TEXTAREA') {
      return;
    }
    event.preventDefault();
  }

  dismissDispatch(): void {
    this.dispatchedId.set(null);
  }

  dispatch(): void {
    this.submitted.set(true);
    if (this.customerBlocked() || this.form.invalid) {
      this.form.markAllAsTouched();
      this.scrollToFirstGap();
      return;
    }
    this.dispatchedId.set(`ORD-${this.nextOrderNumber++}`);
    this.resetForm();
  }

  private isCustomerStepValid(): boolean {
    return (
      this.form.controls.phone.valid &&
      this.form.controls.customerName.valid &&
      this.form.controls.subZoneId.valid &&
      this.form.controls.addressDetails.valid
    );
  }

  private isHubStepValid(): boolean {
    return this.form.controls.hubId.valid && this.vendorCarts.length > 0;
  }

  private scrollToFirstGap(): void {
    const anchor = !this.isCustomerStepValid()
      ? 'step-customer'
      : !this.isHubStepValid()
        ? 'step-hub'
        : 'step-cart';
    this.scrollTo(anchor);
  }

  private resetForm(): void {
    this.vendorCarts.clear();
    this.form.reset({
      phone: '',
      customerName: '',
      customerId: '',
      subZoneId: '',
      addressDetails: '',
      hubId: '',
    });
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.submitted.set(false);
    this.lookupOpen.set(false);
    this.activeSuggestion.set(0);
    this.selectedAddressId.set(null);
    this.mapOpen.set(false);
  }

  private syncHubWithSubZone(subZoneId: string): void {
    const hubId = this.form.controls.hubId.value;
    if (!hubId) {
      return;
    }
    const hub = this.hubs.getById(hubId);
    if (!hub || !hub.servingSubZoneIds.includes(subZoneId)) {
      this.form.controls.hubId.setValue('');
      this.vendorCarts.clear();
    }
  }

  private clearSavedAddressIfMismatch(): void {
    const id = this.selectedAddressId();
    if (!id) {
      return;
    }
    const address = SAVED_ADDRESSES.find((item) => item.id === id);
    if (
      !address ||
      address.subZoneId !== this.form.controls.subZoneId.value ||
      address.details !== this.form.controls.addressDetails.value
    ) {
      this.selectedAddressId.set(null);
    }
  }

  private clearLookupTimer(): void {
    if (this.lookupTimer !== null) {
      clearTimeout(this.lookupTimer);
      this.lookupTimer = null;
    }
  }

  private createItem(): ItemGroup {
    return this.fb.group({
      name: this.fb.nonNullable.control('', Validators.required),
      qty: this.fb.control<number | null>(1, [Validators.required, Validators.min(1)]),
      price: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    });
  }

  private createVendorCart(vendorId: string): VendorCartGroup {
    return this.fb.group({
      vendorId: this.fb.nonNullable.control(vendorId),
      items: this.fb.array<ItemGroup>([this.createItem()]),
    });
  }
}
