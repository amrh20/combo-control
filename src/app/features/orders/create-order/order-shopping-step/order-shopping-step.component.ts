import { DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { SelectButtonModule } from 'primeng/selectbutton';
import { distinctUntilChanged, map } from 'rxjs';
import {
  OpsCatalogProduct,
  OpsOrderingVendor,
  catalogMatchedCombination,
  catalogSelectionLabels,
  catalogUnitPricePiastres,
} from '../../../../core/models/ops-create-order.model';
import { piastresToEgp } from '../../../../core/models/zone.model';
import { OpsCreateOrderService } from '../../../../core/services/ops-create-order.service';
import { OpsOrderWizardService, WizardCartLine } from '../ops-order-wizard.service';

const PAGE_SIZE = 8;

@Component({
  selector: 'ctrl-order-shopping-step',
  standalone: true,
  imports: [DecimalPipe, FormsModule, DialogModule, PaginatorModule, SelectButtonModule],
  templateUrl: './order-shopping-step.component.html',
})
export class OrderShoppingStepComponent {
  private readonly ops = inject(OpsCreateOrderService);
  private readonly wizard = inject(OpsOrderWizardService);
  private readonly messages = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);

  readonly draft = toSignal(this.wizard.draft$, { initialValue: this.wizard.snapshot() });

  readonly vendors = signal<OpsOrderingVendor[]>([]);
  readonly vendorsLoading = signal(false);
  readonly products = signal<OpsCatalogProduct[]>([]);
  readonly productsLoading = signal(false);
  readonly search = signal('');
  readonly pageFirst = signal(0);

  readonly dialogOpen = signal(false);
  readonly dialogProduct = signal<OpsCatalogProduct | null>(null);
  /** Selected option id per variant id. */
  readonly dialogOptions = signal<Record<string, string>>({});
  readonly dialogQty = signal(1);
  readonly brokenImages = signal<ReadonlySet<string>>(new Set());

  /** Human-readable selection: variant name → option label. */
  readonly dialogSelectionLabels = computed(() => {
    const product = this.dialogProduct();
    if (!product) {
      return {} as Record<string, string>;
    }
    return catalogSelectionLabels(product, this.dialogOptions());
  });

  readonly matchedCombination = computed(() => {
    const product = this.dialogProduct();
    if (!product) {
      return null;
    }
    return catalogMatchedCombination(product, this.dialogOptions());
  });

  readonly dialogUnitEgp = computed(() => {
    const product = this.dialogProduct();
    if (!product) {
      return 0;
    }
    return piastresToEgp(catalogUnitPricePiastres(product, this.dialogOptions()));
  });

  readonly dialogSelectionComplete = computed(() => {
    const product = this.dialogProduct();
    if (!product) {
      return false;
    }
    return product.variants
      .filter((variant) => variant.options.length > 0)
      .every((variant) => !!this.dialogOptions()[variant.id]);
  });

  readonly canConfirmAdd = computed(() => {
    const product = this.dialogProduct();
    if (!product || !this.dialogSelectionComplete()) {
      return false;
    }
    const qty = Math.max(1, this.dialogQty());
    if (product.combinations.length === 0) {
      return qty >= 1;
    }
    const matched = this.matchedCombination();
    if (!matched || !matched.isAvailable) {
      return false;
    }
    if (matched.stockQuantity !== null && qty > matched.stockQuantity) {
      return false;
    }
    return true;
  });

  readonly dialogBlockReason = computed(() => {
    const product = this.dialogProduct();
    if (!product) {
      return '';
    }
    if (!this.dialogSelectionComplete()) {
      return 'اختر كل الخيارات.';
    }
    if (product.combinations.length === 0) {
      return '';
    }
    const matched = this.matchedCombination();
    if (!matched) {
      return 'هذا المزيج غير متاح.';
    }
    if (!matched.isAvailable) {
      return 'هذا المزيج غير متوفر حالياً.';
    }
    const qty = Math.max(1, this.dialogQty());
    if (matched.stockQuantity !== null && qty > matched.stockQuantity) {
      return `الكمية المتاحة ${matched.stockQuantity} فقط.`;
    }
    return '';
  });

  readonly shopOptions = computed(() =>
    this.vendors().map((vendor) => ({ label: vendor.name, value: vendor.id })),
  );

  readonly activeVendorId = computed(() => this.draft().activeVendorId);

  readonly filteredProducts = computed(() => {
    const query = this.search().trim().toLowerCase();
    const rows = this.products();
    if (!query) {
      return rows;
    }
    return rows.filter((product) => product.name.toLowerCase().includes(query));
  });

  readonly pageProducts = computed(() => {
    const start = this.pageFirst();
    return this.filteredProducts().slice(start, start + PAGE_SIZE);
  });

  readonly cartGroups = computed(() => Object.values(this.draft().cartByShopId));

  readonly cartCount = computed(() =>
    this.cartGroups().reduce((count, group) => count + group.items.length, 0),
  );

  readonly subtotal = computed(() =>
    piastresToEgp(
      this.cartGroups().reduce(
        (sum, group) => sum + group.items.reduce((lineSum, item) => lineSum + item.unitPricePiastres * item.quantity, 0),
        0,
      ),
    ),
  );

  readonly pageSize = PAGE_SIZE;

  constructor() {
    this.wizard.draft$
      .pipe(
        map((draft) => draft.location.hubId),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((hubId) => this.loadVendors(hubId));

    this.wizard.draft$
      .pipe(
        map((draft) => draft.activeVendorId),
        distinctUntilChanged(),
        takeUntilDestroyed(),
      )
      .subscribe((vendorId) => this.loadProducts(vendorId));
  }

  egp(piastres: number): number {
    return piastresToEgp(piastres);
  }

  lineTotal(item: WizardCartLine): number {
    return piastresToEgp(item.unitPricePiastres * item.quantity);
  }

  onShopChange(vendorId: string | null): void {
    if (vendorId) {
      this.wizard.setActiveVendor(vendorId);
    }
  }

  onSearch(value: string): void {
    this.search.set(value);
    this.pageFirst.set(0);
  }

  onPage(event: PaginatorState): void {
    this.pageFirst.set(event.first ?? 0);
  }

  hasCombinations(product: OpsCatalogProduct): boolean {
    return product.variants.some((variant) => variant.options.length > 0);
  }

  markImageBroken(productId: string): void {
    this.brokenImages.update((current) => {
      if (current.has(productId)) {
        return current;
      }
      const next = new Set(current);
      next.add(productId);
      return next;
    });
  }

  showImage(product: OpsCatalogProduct): boolean {
    return !!product.imageUrl && !this.brokenImages().has(product.id);
  }

  onAddClick(product: OpsCatalogProduct, event: Event): void {
    event.stopPropagation();
    if (this.hasCombinations(product)) {
      this.openProductDialog(product);
      return;
    }
    this.addSimpleProduct(product);
  }

  openProductDialog(product: OpsCatalogProduct): void {
    const options: Record<string, string> = {};
    for (const variant of product.variants) {
      const first = variant.options[0];
      if (first) {
        options[variant.id] = first.id;
      }
    }
    this.dialogProduct.set(product);
    this.dialogOptions.set(options);
    this.dialogQty.set(1);
    this.dialogOpen.set(true);
  }

  private addSimpleProduct(product: OpsCatalogProduct): void {
    const vendorId = this.draft().activeVendorId;
    const vendor = this.vendors().find((row) => row.id === vendorId);
    if (!vendor) {
      return;
    }
    this.wizard.addLine(
      { vendorId: vendor.id, vendorName: vendor.name },
      {
        productId: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        quantity: 1,
        optionIds: [],
        optionSummary: '',
        unitPricePiastres: product.pricePiastres,
      },
    );
  }

  pickOption(variantId: string, optionId: string): void {
    this.dialogOptions.update((current) => ({ ...current, [variantId]: optionId }));
  }

  setQty(value: number | string): void {
    const parsed = typeof value === 'number' ? value : Number(value);
    this.dialogQty.set(Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1);
  }

  bumpQty(delta: number): void {
    this.dialogQty.update((current) => Math.max(1, current + delta));
  }

  confirmAdd(): void {
    if (!this.canConfirmAdd()) {
      const reason = this.dialogBlockReason();
      if (reason) {
        this.messages.add({ severity: 'error', summary: 'تنبيه', detail: reason, life: 4000 });
      }
      return;
    }
    const product = this.dialogProduct();
    const vendorId = this.draft().activeVendorId;
    const vendor = this.vendors().find((row) => row.id === vendorId);
    if (!product || !vendor) {
      return;
    }
    const options = this.dialogOptions();
    const optionIds = product.variants
      .map((variant) => options[variant.id])
      .filter((id): id is string => !!id);
    const labels = Object.values(this.dialogSelectionLabels());
    this.wizard.addLine(
      { vendorId: vendor.id, vendorName: vendor.name },
      {
        productId: product.id,
        name: product.name,
        imageUrl: product.imageUrl,
        quantity: Math.max(1, this.dialogQty()),
        optionIds,
        optionSummary: labels.join(' · '),
        unitPricePiastres: catalogUnitPricePiastres(product, options),
      },
    );
    this.dialogOpen.set(false);
  }

  removeLine(vendorId: string, lineId: string): void {
    this.wizard.removeLine(vendorId, lineId);
  }

  private loadVendors(hubId: string | null): void {
    this.vendors.set([]);
    this.products.set([]);
    this.search.set('');
    this.pageFirst.set(0);
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
          this.vendors.set(vendors);
          const current = this.wizard.snapshot().activeVendorId;
          const stillListed = !!current && vendors.some((vendor) => vendor.id === current);
          if (!stillListed) {
            this.wizard.setActiveVendor(vendors[0]?.id ?? null);
          }
        },
        error: () => {
          this.vendorsLoading.set(false);
          this.messages.add({ severity: 'error', summary: 'تنبيه', detail: 'تعذر تحميل المتاجر.', life: 4000 });
        },
      });
  }

  private loadProducts(vendorId: string | null): void {
    this.products.set([]);
    this.search.set('');
    this.pageFirst.set(0);
    if (!vendorId) {
      return;
    }
    this.productsLoading.set(true);
    this.ops
      .getVendorProducts(vendorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (products) => {
          if (this.wizard.snapshot().activeVendorId !== vendorId) {
            return;
          }
          this.productsLoading.set(false);
          this.products.set(products);
        },
        error: () => {
          this.productsLoading.set(false);
          this.messages.add({ severity: 'error', summary: 'تنبيه', detail: 'تعذر تحميل المنتجات.', life: 4000 });
        },
      });
  }
}
