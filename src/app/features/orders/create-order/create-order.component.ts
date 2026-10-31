import { DecimalPipe } from '@angular/common';
import { Component, DestroyRef, HostListener, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MessageService } from 'primeng/api';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { debounceTime, distinctUntilChanged, map, merge } from 'rxjs';
import {
  CartProblem,
  OpsCatalogProduct,
  OpsCustomerSavedAddress,
  OpsCustomerSearchResult,
  OpsOrderingHub,
  OpsOrderingSubZone,
  OpsOrderingVendor,
} from '../../../core/models/ops-create-order.model';
import { SUB_ZONE_COLOR_PRESETS } from '../../../core/models/sub-zone.model';
import { piastresToEgp } from '../../../core/models/zone.model';
import {
  OpsCreateOrderService,
  createOrderErrorMessage,
  readCartProblemsFromError,
  readConflictCustomerId,
} from '../../../core/services/ops-create-order.service';
import { formatCartProblems } from '../../../core/utils/cart-problem.utils';
import type { VendorApiLiveStatus } from '../../../core/models/vendor.model';

interface CartItemControls {
  productId: FormControl<string | null>;
  quantity: FormControl<number | null>;
  optionIds: FormControl<string[]>;
}

type CartItemGroup = FormGroup<CartItemControls>;

interface VendorCartControls {
  vendorId: FormControl<string>;
  items: FormArray<CartItemGroup>;
  /** UI-only row for adding the next line; not sent on the order payload. */
  draft: CartItemGroup;
}

type VendorCartGroup = FormGroup<VendorCartControls>;

interface ManualOrderControls {
  phone: FormControl<string>;
  customerName: FormControl<string>;
  customerId: FormControl<string>;
  /** UI-only. Not sent on the order payload. */
  parentZoneId: FormControl<string | null>;
  subZoneId: FormControl<string | null>;
  addressDetails: FormControl<string>;
  hubId: FormControl<string | null>;
  /** UI-only picker that resets after each shop is added. */
  shopToAdd: FormControl<string | null>;
  vendorCarts: FormArray<VendorCartGroup>;
}

interface ParentZoneOption {
  id: string;
  name: string;
}

const LIVE_STATUS_LABELS: Record<VendorApiLiveStatus, string> = {
  OPEN: 'مفتوح',
  BUSY: 'مشغول',
  CLOSED: 'مغلق',
};

interface VendorCartAccent {
  section: string;
  chip: string;
  badge: string;
  draft: string;
  preview: string;
  addButton: string;
}

/** Rotating accents so multi-shop carts are easy to scan. */
const VENDOR_CART_ACCENTS: VendorCartAccent[] = [
  {
    section: 'border-[#00846A]/40 bg-[#E6F8F5]/55',
    chip: 'border-[#00846A]/35 bg-[#E6F8F5]',
    badge: 'bg-[#00846A] text-white',
    draft: 'border-[#00846A]/25 border-dashed bg-white/75',
    preview: 'border-[#00846A]/20 bg-white/90',
    addButton: 'text-[#00846A]',
  },
  {
    section: 'border-amber-300/80 bg-amber-50/70',
    chip: 'border-amber-300/60 bg-amber-50',
    badge: 'bg-amber-600 text-white',
    draft: 'border-amber-200 border-dashed bg-white/75',
    preview: 'border-amber-200 bg-amber-50/95',
    addButton: 'text-amber-800',
  },
  {
    section: 'border-violet-300/70 bg-violet-50/60',
    chip: 'border-violet-300/50 bg-violet-50',
    badge: 'bg-violet-600 text-white',
    draft: 'border-violet-200 border-dashed bg-white/75',
    preview: 'border-violet-200 bg-violet-50/95',
    addButton: 'text-violet-700',
  },
  {
    section: 'border-sky-300/70 bg-sky-50/60',
    chip: 'border-sky-300/50 bg-sky-50',
    badge: 'bg-sky-600 text-white',
    draft: 'border-sky-200 border-dashed bg-white/75',
    preview: 'border-sky-200 bg-sky-50/95',
    addButton: 'text-sky-800',
  },
];

/** UI-only platform estimates; backend recalculates on submit. */
const ESTIMATE_BASE_DELIVERY_PIASTRES = 2000;
const ESTIMATE_EXTRA_SHOP_DELIVERY_PIASTRES = 500;
const ESTIMATE_BASE_SERVICE_FEE_PIASTRES = 500;
const ESTIMATE_EXTRA_SHOP_SERVICE_FEE_PIASTRES = 200;

/** Matches POST /v1/ops/orders `dropOffAddress` (trim then length). */
const DROP_OFF_ADDRESS_MIN = 3;
const DROP_OFF_ADDRESS_MAX = 300;

function dropOffAddressValidator(control: AbstractControl<string>): ValidationErrors | null {
  const len = (control.value ?? '').trim().length;
  if (len === 0) {
    return { required: true };
  }
  if (len < DROP_OFF_ADDRESS_MIN) {
    return { minlength: { requiredLength: DROP_OFF_ADDRESS_MIN, actualLength: len } };
  }
  if (len > DROP_OFF_ADDRESS_MAX) {
    return { maxlength: { requiredLength: DROP_OFF_ADDRESS_MAX, actualLength: len } };
  }
  return null;
}

@Component({
  selector: 'ctrl-create-order',
  standalone: true,
  imports: [DecimalPipe, ReactiveFormsModule, SelectModule, ToastModule],
  providers: [MessageService],
  templateUrl: './create-order.component.html',
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
      :host ::ng-deep .order-field--invalid .order-select {
        border-color: #f87171;
      }
      :host ::ng-deep .order-product-select.p-select {
        width: 100%;
        min-height: 2rem;
        align-items: center;
        border-radius: 0.375rem;
        border-color: #e5e7eb;
        background: #fff;
      }
      :host ::ng-deep .order-product-select .p-select-label {
        font-size: 0.75rem;
        padding-block: 0.25rem;
        padding-inline: 0.5rem;
      }
      :host ::ng-deep .order-field--invalid .order-product-select {
        border-color: #f87171;
      }
    `,
  ],
})
export class CreateOrderComponent {
  private readonly fb = inject(FormBuilder);
  private readonly ops = inject(OpsCreateOrderService);
  private readonly messages = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);
  private phoneSearchGeneration = 0;
  private ignoreParentChange = false;

  readonly hubs = signal<OpsOrderingHub[]>([]);
  readonly orderingSubZones = signal<OpsOrderingSubZone[]>([]);
  readonly hubVendorsList = signal<OpsOrderingVendor[]>([]);
  readonly vendorProducts = signal<Readonly<Record<string, OpsCatalogProduct[]>>>({});
  readonly productsLoading = signal<Readonly<Record<string, boolean>>>({});

  readonly lookupsLoading = signal(true);
  readonly vendorsLoading = signal(false);
  readonly customerSearchLoading = signal(false);
  readonly submitting = signal(false);
  readonly submitted = signal(false);
  readonly cartProblems = signal<CartProblem[]>([]);

  readonly searchedCustomer = signal<OpsCustomerSearchResult | null>(null);
  readonly selectedAddressId = signal<string | null>(null);
  readonly mapOpen = signal(false);

  readonly form = this.fb.group<ManualOrderControls>({
    phone: this.fb.nonNullable.control('', {
      validators: [Validators.required, Validators.pattern(/^01[0125]\d{8}$/)],
    }),
    customerName: this.fb.nonNullable.control('', Validators.required),
    customerId: this.fb.nonNullable.control(''),
    parentZoneId: this.fb.control<string | null>(null),
    subZoneId: this.fb.control<string | null>(null, Validators.required),
    addressDetails: this.fb.nonNullable.control('', dropOffAddressValidator),
    hubId: this.fb.control<string | null>(null, Validators.required),
    shopToAdd: this.fb.control<string | null>(null),
    vendorCarts: this.fb.array<VendorCartGroup>([], Validators.minLength(1)),
  });

  private readonly revision = signal(0);

  readonly formState = computed(() => {
    this.revision();
    return this.form.getRawValue();
  });

  readonly parentZones = computed((): ParentZoneOption[] => {
    const seen = new Map<string, ParentZoneOption>();
    let hasOrphans = false;
    for (const zone of this.orderingSubZones()) {
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
    const parentId = this.formState().parentZoneId;
    if (!parentId) {
      return [] as OpsOrderingSubZone[];
    }
    if (parentId === '__none__') {
      return this.orderingSubZones().filter((zone) => !zone.zoneId);
    }
    return this.orderingSubZones().filter((zone) => zone.zoneId === parentId);
  });

  readonly savedAddresses = computed(() => {
    const customer = this.searchedCustomer();
    if (!customer || customer.status === 'BLOCKED') {
      return [] as OpsCustomerSavedAddress[];
    }
    return customer.addresses;
  });

  readonly customerBlocked = computed(() => this.searchedCustomer()?.status === 'BLOCKED');

  readonly selectedOrderingSubZone = computed(() => {
    const id = this.formState().subZoneId;
    return id ? (this.orderingSubZones().find((zone) => zone.id === id) ?? null) : null;
  });

  readonly selectedSubZoneName = computed(() => this.selectedOrderingSubZone()?.name ?? '');

  readonly selectedParentZoneName = computed(() => {
    const id = this.formState().parentZoneId;
    if (!id) {
      return '';
    }
    return this.parentZones().find((zone) => zone.id === id)?.name ?? '';
  });

  readonly eligibleHubs = computed(() => {
    const subZone = this.selectedOrderingSubZone();
    if (!subZone) {
      return [] as OpsOrderingHub[];
    }
    const hubIds = new Set(subZone.hubIds);
    return this.hubs().filter((hub) => hubIds.has(hub.id));
  });

  readonly selectedHubName = computed(() => {
    const id = this.formState().hubId;
    return id ? (this.hubs().find((hub) => hub.id === id)?.name ?? '') : '';
  });

  readonly hubVendors = computed(() => this.hubVendorsList());

  readonly shopOptions = computed(() => {
    const selected = new Set((this.formState().vendorCarts ?? []).map((cart) => cart.vendorId));
    return this.hubVendorsList()
      .filter((vendor) => !selected.has(vendor.id))
      .map((vendor) => ({
        ...vendor,
        disabled: vendor.liveStatus !== 'OPEN',
      }))
      .sort((a, b) => Number(a.disabled) - Number(b.disabled));
  });

  readonly itemCount = computed(() =>
    (this.formState().vendorCarts ?? []).reduce(
      (count, cart) => count + (cart.items?.length ?? 0),
      0,
    ),
  );

  readonly subtotalPiastres = computed(() => {
    this.formState();
    return this.vendorCarts.controls.reduce((sum, cart) => {
      const vendorId = cart.controls.vendorId.value;
      return (
        sum +
        cart.controls.items.controls.reduce(
          (lineSum, item) => lineSum + this.lineTotalPiastres(vendorId, item),
          0,
        )
      );
    }, 0);
  });

  readonly subtotal = computed(() => piastresToEgp(this.subtotalPiastres()));

  readonly uniqueShopCount = computed(() => {
    this.formState();
    return this.vendorCarts.controls.filter((cart) => cart.controls.items.length > 0).length;
  });

  readonly deliveryFeePiastres = computed(() => {
    const shops = this.uniqueShopCount();
    if (shops === 0) {
      return 0;
    }
    return (
      ESTIMATE_BASE_DELIVERY_PIASTRES + (shops - 1) * ESTIMATE_EXTRA_SHOP_DELIVERY_PIASTRES
    );
  });

  readonly serviceFeePiastres = computed(() => {
    const shops = this.uniqueShopCount();
    if (shops === 0) {
      return 0;
    }
    return ESTIMATE_BASE_SERVICE_FEE_PIASTRES + (shops - 1) * ESTIMATE_EXTRA_SHOP_SERVICE_FEE_PIASTRES;
  });

  readonly deliveryFee = computed(() => piastresToEgp(this.deliveryFeePiastres()));

  readonly serviceFee = computed(() => piastresToEgp(this.serviceFeePiastres()));

  readonly total = computed(() =>
    piastresToEgp(this.subtotalPiastres() + this.deliveryFeePiastres() + this.serviceFeePiastres()),
  );

  readonly cartProblemMessage = computed(() => formatCartProblems(this.cartProblems()));

  readonly phoneDigitsLength = computed(() =>
    (this.formState().phone ?? '').replace(/\D/g, '').length,
  );

  readonly missingPieces = computed(() => {
    this.formState();
    const missing: string[] = [];
    if (this.form.controls.phone.invalid) {
      missing.push('رقم هاتف صحيح');
    }
    if (this.form.controls.customerName.invalid) {
      missing.push('اسم العميل');
    }
    if (!this.form.controls.parentZoneId.value) {
      missing.push('المنطقة');
    }
    if (this.form.controls.subZoneId.invalid) {
      missing.push('المنطقة الفرعية');
    }
    if (this.form.controls.addressDetails.invalid) {
      missing.push('تفاصيل العنوان');
    }
    if (this.form.controls.hubId.invalid) {
      missing.push('الشارع');
    } else if (this.vendorCarts.length === 0) {
      missing.push('متجر واحد على الأقل');
    } else if (this.vendorCarts.controls.some((cart) => cart.invalid || cart.controls.items.invalid)) {
      missing.push('أصناف مكتملة لكل متجر');
    }
    return missing;
  });

  constructor() {
    this.loadLookups();

    merge(this.form.valueChanges, this.form.statusChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.revision.update((value) => value + 1));

    this.form.controls.phone.valueChanges.pipe(takeUntilDestroyed()).subscribe((phone) => {
      const digits = phone.replace(/\D/g, '').slice(0, 11);
      if (digits !== phone) {
        this.form.controls.phone.setValue(digits, { emitEvent: false });
      }
    });

    this.form.controls.phone.valueChanges
      .pipe(
        debounceTime(500),
        map((phone) => phone.replace(/\D/g, '').slice(0, 11)),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((digits) => this.onPhoneDebounced(digits));

    this.form.controls.hubId.valueChanges.pipe(takeUntilDestroyed()).subscribe((hubId) => {
      this.onHubIdChanged(hubId);
    });

    this.form.controls.parentZoneId.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((zoneId) => this.onParentZoneChanged(zoneId));

    this.form.controls.subZoneId.valueChanges
      .pipe(distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((subZoneId) => this.onSubZoneChanged(subZoneId));

    this.form.controls.shopToAdd.valueChanges.pipe(takeUntilDestroyed()).subscribe((vendorId) => {
      if (!vendorId) {
        return;
      }
      queueMicrotask(() => {
        if (this.form.controls.shopToAdd.value === vendorId) {
          this.form.controls.shopToAdd.setValue(null, { emitEvent: false });
        }
        this.addShop(vendorId);
      });
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

  zoneColor(index: number): string {
    return SUB_ZONE_COLOR_PRESETS[index % SUB_ZONE_COLOR_PRESETS.length];
  }

  vendorCartAccent(index: number): VendorCartAccent {
    return VENDOR_CART_ACCENTS[index % VENDOR_CART_ACCENTS.length];
  }

  vendorName(vendorId: string): string {
    return this.hubVendorsList().find((vendor) => vendor.id === vendorId)?.name ?? vendorId;
  }

  vendorById(vendorId: string): OpsOrderingVendor | undefined {
    return this.hubVendorsList().find((vendor) => vendor.id === vendorId);
  }

  subZonesOf(parentId: string): OpsOrderingSubZone[] {
    if (parentId === '__none__') {
      return this.orderingSubZones().filter((zone) => !zone.zoneId);
    }
    return this.orderingSubZones().filter((zone) => zone.zoneId === parentId);
  }

  optionIdForVariant(item: CartItemGroup, variant: OpsCatalogProduct['variants'][number]): string {
    const picked = new Set(item.controls.optionIds.value ?? []);
    return variant.options.find((option) => picked.has(option.id))?.id ?? '';
  }

  setVariantOption(
    item: CartItemGroup,
    variant: OpsCatalogProduct['variants'][number],
    event: Event,
  ): void {
    const optionId = event.target instanceof HTMLSelectElement ? event.target.value : '';
    const variantOptionIds = new Set(variant.options.map((option) => option.id));
    const kept = (item.controls.optionIds.value ?? []).filter((id) => !variantOptionIds.has(id));
    if (optionId) {
      item.controls.optionIds.setValue([...kept, optionId]);
    } else {
      item.controls.optionIds.setValue(kept);
    }
    this.onOptionChange(item);
  }

  subZoneName(subZoneId: string): string {
    return this.orderingSubZones().find((zone) => zone.id === subZoneId)?.name ?? '';
  }

  productsForVendor(vendorId: string): OpsCatalogProduct[] {
    return this.vendorProducts()[vendorId] ?? [];
  }

  isProductsLoading(vendorId: string): boolean {
    return !!this.productsLoading()[vendorId];
  }

  productForLine(vendorId: string, productId: string | null): OpsCatalogProduct | undefined {
    if (!productId) {
      return undefined;
    }
    return this.productsForVendor(vendorId).find((product) => product.id === productId);
  }

  isVendorSelected(vendorId: string): boolean {
    return this.vendorCarts.controls.some((cart) => cart.controls.vendorId.value === vendorId);
  }

  canSelectVendor(vendor: OpsOrderingVendor): boolean {
    return vendor.liveStatus === 'OPEN';
  }

  statusLabel(status: VendorApiLiveStatus): string {
    return LIVE_STATUS_LABELS[status];
  }

  statusClass(status: VendorApiLiveStatus): string {
    if (status === 'OPEN') {
      return 'bg-emerald-50 text-emerald-700';
    }
    if (status === 'BUSY') {
      return 'bg-amber-50 text-amber-700';
    }
    return 'bg-gray-100 text-gray-500';
  }

  lineTotalPiastres(vendorId: string, item: CartItemGroup): number {
    const qty = Number(item.controls.quantity.value) || 0;
    if (qty <= 0) {
      return 0;
    }
    const unit = this.unitPricePiastres(vendorId, item);
    return unit * qty;
  }

  lineTotalEgp(vendorId: string, item: CartItemGroup): number {
    return piastresToEgp(this.lineTotalPiastres(vendorId, item));
  }

  /** "{qty} {name} {variant} …" (space-separated) for preview and confirmed lines. */
  draftPreviewText(vendorId: string, item: CartItemGroup): string {
    const productId = item.controls.productId.value;
    if (!productId) {
      return '';
    }
    const qty = Number(item.controls.quantity.value) || 0;
    const product = this.productForLine(vendorId, productId);
    const parts = [String(qty), product?.name ?? '', ...this.selectedOptionLabels(vendorId, item)];
    return parts.filter((part) => part.length > 0).join(' ');
  }

  selectedOptionLabels(vendorId: string, item: CartItemGroup): string[] {
    const product = this.productForLine(vendorId, item.controls.productId.value);
    if (!product) {
      return [];
    }
    const optionIds = new Set(item.controls.optionIds.value ?? []);
    const labels: string[] = [];
    for (const variant of product.variants) {
      const picked = variant.options.find((option) => optionIds.has(option.id));
      if (picked) {
        labels.push(picked.label);
      }
    }
    return labels;
  }

  unitPricePiastres(vendorId: string, item: CartItemGroup): number {
    const product = this.productForLine(vendorId, item.controls.productId.value);
    if (!product) {
      return 0;
    }
    const optionIds = new Set(item.controls.optionIds.value ?? []);
    const optionDelta = product.variants.reduce((sum, variant) => {
      const picked = variant.options.find((option) => optionIds.has(option.id));
      return sum + (picked?.priceDeltaPiastres ?? 0);
    }, 0);
    return product.pricePiastres + optionDelta;
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
    this.mapOpen.set(false);
  }

  clearCustomerLink(): void {
    this.form.controls.customerId.setValue('');
    this.searchedCustomer.set(null);
    this.selectedAddressId.set(null);
  }

  selectSavedAddress(address: OpsCustomerSavedAddress): void {
    this.selectedAddressId.set(address.id);
    this.form.controls.addressDetails.setValue(address.line);
    this.form.controls.addressDetails.markAsDirty();
    if (address.subZoneId) {
      this.form.controls.subZoneId.setValue(address.subZoneId);
      this.form.controls.subZoneId.markAsTouched();
    }
  }

  addShop(vendorId: string): void {
    const vendor = this.hubVendorsList().find((row) => row.id === vendorId);
    if (!vendor || !this.canSelectVendor(vendor) || this.isVendorSelected(vendor.id)) {
      return;
    }
    this.vendorCarts.push(this.createVendorCart(vendor.id));
    this.loadVendorProducts(vendor.id);
    this.cartProblems.set([]);
  }

  onProductPicked(vendorId: string, item: CartItemGroup, productId: string | null): void {
    const next = productId || null;
    if (item.controls.productId.value !== next) {
      item.controls.productId.setValue(next);
    }
    const product = this.productForLine(vendorId, next);
    item.controls.optionIds.setValue(product ? this.defaultOptionIds(product) : []);
    this.cartProblems.set([]);
  }

  onOptionChange(item: CartItemGroup): void {
    this.cartProblems.set([]);
  }

  confirmAddItem(cart: VendorCartGroup): void {
    const draft = cart.controls.draft;
    const vendorId = cart.controls.vendorId.value;
    if (!this.isCartLineComplete(vendorId, draft)) {
      draft.markAllAsTouched();
      this.toast('error', 'اختر المنتج والخيارات قبل الإضافة.');
      return;
    }
    const line = this.createItem();
    line.setValue({
      productId: draft.controls.productId.value,
      quantity: Number(draft.controls.quantity.value) || 1,
      optionIds: [...(draft.controls.optionIds.value ?? [])],
    });
    cart.controls.items.push(line);
    this.resetDraftItem(draft);
    this.cartProblems.set([]);
  }

  removeItem(cart: VendorCartGroup, index: number): void {
    cart.controls.items.removeAt(index);
    this.cartProblems.set([]);
  }

  removeVendor(vendorId: string): void {
    const index = this.vendorCarts.controls.findIndex(
      (cart) => cart.controls.vendorId.value === vendorId,
    );
    if (index >= 0) {
      this.vendorCarts.removeAt(index);
      this.cartProblems.set([]);
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
    if (target.closest('.p-select, .p-select-overlay, .p-select-list')) {
      return;
    }
    if (target.tagName === 'BUTTON' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
      return;
    }
    event.preventDefault();
  }

  dispatch(): void {
    this.submitted.set(true);
    this.cartProblems.set([]);
    if (this.customerBlocked() || this.form.invalid || !this.cartLinesValid()) {
      this.form.markAllAsTouched();
      if (!this.cartLinesValid()) {
        this.toast('error', 'اختر المنتج والخيارات لكل صنف.');
      }
      this.scrollToFirstGap();
      return;
    }

    const raw = this.form.getRawValue();
    const customerId = raw.customerId?.trim() ?? '';
    const payload = {
      dropOffAddress: raw.addressDetails.trim(),
      subZoneId: raw.subZoneId ?? '',
      hubId: raw.hubId ?? '',
      items: this.vendorCarts.controls.flatMap((cart) =>
        cart.controls.items.controls.map((item) => ({
          productId: item.controls.productId.value ?? '',
          vendorId: cart.controls.vendorId.value,
          quantity: Number(item.controls.quantity.value) || 0,
          options: [...(item.controls.optionIds.value ?? [])],
        })),
      ),
      ...(customerId
        ? { customerId }
        : {
            customerName: raw.customerName.trim(),
            customerPhone: raw.phone.trim(),
          }),
    };

    this.submitting.set(true);
    this.ops
      .placeOrder(payload, crypto.randomUUID())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (order) => {
          this.submitting.set(false);
          this.toast('success', `تم إرسال الطلب ${order.orderNumber} إلى التشغيل.`);
          this.resetForm();
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          const conflictId = readConflictCustomerId(error);
          if (conflictId) {
            this.form.controls.customerId.setValue(conflictId);
          }
          const problems = readCartProblemsFromError(error);
          if (problems.length > 0) {
            this.cartProblems.set(problems);
          }
          this.toast('error', createOrderErrorMessage(error));
        },
      });
  }

  private loadLookups(): void {
    this.lookupsLoading.set(true);
    let hubsLoaded = false;
    let zonesLoaded = false;
    const finish = () => {
      if (hubsLoaded && zonesLoaded) {
        this.lookupsLoading.set(false);
      }
    };

    this.ops
      .getHubs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (hubs) => {
          this.hubs.set(hubs);
          hubsLoaded = true;
          finish();
        },
        error: () => {
          hubsLoaded = true;
          finish();
          this.toast('error', 'تعذر تحميل مراكز الانطلاق.');
        },
      });

    this.ops
      .getSubZones()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (zones) => {
          this.orderingSubZones.set(zones);
          this.syncParentFromSubZone(this.form.controls.subZoneId.value);
          zonesLoaded = true;
          finish();
        },
        error: () => {
          zonesLoaded = true;
          finish();
          this.toast('error', 'تعذر تحميل مناطق التوصيل.');
        },
      });
  }

  private cartLinesValid(): boolean {
    if (this.vendorCarts.length === 0) {
      return false;
    }
    return this.vendorCarts.controls.every(
      (cart) =>
        cart.controls.items.length > 0 &&
        cart.controls.items.controls.every((item) =>
          this.isCartLineComplete(cart.controls.vendorId.value, item),
        ),
    );
  }

  private isCartLineComplete(vendorId: string, item: CartItemGroup): boolean {
    const product = this.productForLine(vendorId, item.controls.productId.value);
    if (!product || !item.valid) {
      return false;
    }
    const qty = Number(item.controls.quantity.value);
    if (!Number.isFinite(qty) || qty < 1) {
      return false;
    }
    return product.variants.every((variant) => {
      if (variant.options.length === 0) {
        return true;
      }
      const picked = new Set(item.controls.optionIds.value ?? []);
      return variant.options.some((option) => picked.has(option.id));
    });
  }

  private resetDraftItem(draft: CartItemGroup): void {
    draft.reset({ productId: null, quantity: 1, optionIds: [] });
    draft.markAsPristine();
    draft.markAsUntouched();
  }

  private onPhoneDebounced(digits: string): void {
    const linkedId = this.form.controls.customerId.value;
    if (digits.length !== 11) {
      if (linkedId) {
        this.form.controls.customerId.setValue('');
      }
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
            this.searchedCustomer.set(null);
            this.selectedAddressId.set(null);
            return;
          }
          this.applyCustomerSearch(customer);
        },
        error: () => {
          if (generation !== this.phoneSearchGeneration) {
            return;
          }
          this.customerSearchLoading.set(false);
          this.toast('error', 'تعذر البحث عن العميل.');
        },
      });
  }

  private applyCustomerSearch(customer: OpsCustomerSearchResult): void {
    this.searchedCustomer.set(customer);
    this.form.patchValue({
      customerName: customer.name,
      customerId: customer.id,
      phone: customer.phone,
    });
    this.form.controls.customerName.markAsDirty();

    const defaultAddress =
      customer.addresses.find((address) => address.isDefault) ?? customer.addresses[0];
    if (defaultAddress) {
      this.selectSavedAddress(defaultAddress);
    } else {
      this.selectedAddressId.set(null);
    }
  }

  private onHubIdChanged(hubId: string | null): void {
    const keepsCurrentHub =
      !!hubId &&
      this.vendorCarts.controls.every((cart) => {
        const vendor = this.hubVendorsList().find((row) => row.id === cart.controls.vendorId.value);
        return vendor?.hubId === hubId;
      });
    if (!keepsCurrentHub) {
      this.vendorCarts.clear();
    }
    this.hubVendorsList.set([]);
    this.form.controls.shopToAdd.setValue(null, { emitEvent: false });
    this.cartProblems.set([]);
    if (!hubId) {
      return;
    }
    this.vendorsLoading.set(true);
    this.ops
      .getVendors(hubId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (vendors) => {
          this.vendorsLoading.set(false);
          this.hubVendorsList.set(vendors);
        },
        error: () => {
          this.vendorsLoading.set(false);
          this.toast('error', 'تعذر تحميل المتاجر.');
        },
      });
  }

  private loadVendorProducts(vendorId: string): void {
    if (this.vendorProducts()[vendorId] || this.productsLoading()[vendorId]) {
      return;
    }
    this.productsLoading.update((current) => ({ ...current, [vendorId]: true }));
    this.ops
      .getVendorProducts(vendorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (products) => {
          this.productsLoading.update((current) => ({ ...current, [vendorId]: false }));
          this.vendorProducts.update((current) => ({ ...current, [vendorId]: products }));
        },
        error: () => {
          this.productsLoading.update((current) => ({ ...current, [vendorId]: false }));
          this.toast('error', 'تعذر تحميل منتجات المتجر.');
        },
      });
  }

  private isCustomerStepValid(): boolean {
    return this.form.controls.phone.valid && this.form.controls.customerName.valid;
  }

  private isDeliveryStepValid(): boolean {
    return (
      !!this.form.controls.parentZoneId.value &&
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
      : !this.isDeliveryStepValid()
        ? 'step-delivery'
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
      parentZoneId: null,
      subZoneId: null,
      addressDetails: '',
      hubId: null,
      shopToAdd: null,
    });
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.submitted.set(false);
    this.searchedCustomer.set(null);
    this.selectedAddressId.set(null);
    this.mapOpen.set(false);
    this.cartProblems.set([]);
    this.hubVendorsList.set([]);
  }

  private onParentZoneChanged(zoneId: string | null): void {
    if (this.ignoreParentChange) {
      return;
    }
    const current = this.orderingSubZones().find((zone) => zone.id === this.form.controls.subZoneId.value);
    if (current && this.parentIdOf(current) === zoneId) {
      return;
    }
    if (this.form.controls.subZoneId.value) {
      this.form.controls.subZoneId.setValue(null);
    }
    if (this.form.controls.hubId.value) {
      this.form.controls.hubId.setValue(null);
    }
    this.selectedAddressId.set(null);
    this.cartProblems.set([]);
  }

  private onSubZoneChanged(subZoneId: string | null): void {
    this.syncParentFromSubZone(subZoneId);
    this.clearSavedAddressIfMismatch();
    this.syncHubWithSubZone(subZoneId);
    this.cartProblems.set([]);
  }

  private syncParentFromSubZone(subZoneId: string | null): void {
    if (!subZoneId) {
      return;
    }
    const zone = this.orderingSubZones().find((item) => item.id === subZoneId);
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
  }

  private parentIdOf(zone: OpsOrderingSubZone): string {
    return zone.zoneId || '__none__';
  }

  private syncHubWithSubZone(subZoneId: string | null): void {
    const hubId = this.form.controls.hubId.value;
    if (!hubId) {
      return;
    }
    const subZone = subZoneId
      ? this.orderingSubZones().find((zone) => zone.id === subZoneId)
      : undefined;
    if (!subZone || !subZone.hubIds.includes(hubId)) {
      this.form.controls.hubId.setValue(null);
      this.vendorCarts.clear();
      this.hubVendorsList.set([]);
    }
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

  private createItem(): CartItemGroup {
    return this.fb.group({
      productId: this.fb.control<string | null>(null, Validators.required),
      quantity: this.fb.control<number | null>(1, [Validators.required, Validators.min(1)]),
      optionIds: this.fb.nonNullable.control<string[]>([]),
    });
  }

  private createDraftItem(): CartItemGroup {
    return this.fb.group({
      productId: this.fb.control<string | null>(null),
      quantity: this.fb.control<number | null>(1, [Validators.required, Validators.min(1)]),
      optionIds: this.fb.nonNullable.control<string[]>([]),
    });
  }

  private createVendorCart(vendorId: string): VendorCartGroup {
    return this.fb.group({
      vendorId: this.fb.nonNullable.control(vendorId),
      items: this.fb.array<CartItemGroup>([], Validators.minLength(1)),
      draft: this.createDraftItem(),
    });
  }

  private defaultOptionIds(product: OpsCatalogProduct): string[] {
    return product.variants
      .map((variant) => variant.options[0]?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
  }

  private toast(severity: 'success' | 'error', detail: string): void {
    this.messages.add({ severity, summary: severity === 'success' ? 'تم' : 'تنبيه', detail, life: 5000 });
  }
}
