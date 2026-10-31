import {
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import {
  OpsCatalogProduct,
  catalogPrimaryVariantSelection,
  catalogUnitPricePiastres,
  catalogVariantFieldLabel,
} from '../../../core/models/ops-create-order.model';
import { AddOrderItemModalSubmit } from '../../../core/models/ops-order.model';
import { egpToPiastres, piastresToEgp } from '../../../core/models/zone.model';
import { OpsCreateOrderService } from '../../../core/services/ops-create-order.service';

@Component({
  selector: 'ctrl-add-order-item-modal',
  standalone: true,
  imports: [FormsModule, AutoCompleteModule, SelectModule, InputNumberModule],
  templateUrl: './add-order-item-modal.component.html',
  styleUrl: './add-order-item-modal.component.scss',
})
export class AddOrderItemModalComponent {
  private readonly catalog = inject(OpsCreateOrderService);
  private readonly destroyRef = inject(DestroyRef);
  private searchGeneration = 0;

  readonly open = input(false);
  readonly shopId = input('');
  readonly shopName = input('');
  readonly submitting = input(false);
  readonly submitError = input<string | null>(null);

  readonly closed = output<void>();
  readonly submitted = output<AddOrderItemModalSubmit>();

  readonly productSuggestions = signal<OpsCatalogProduct[]>([]);
  readonly searchLoading = signal(false);
  selectedProduct: OpsCatalogProduct | null = null;
  quantity = 1;
  priceEgp = 0;
  /** option id per variant group id */
  readonly variantOptionIds = signal<Record<string, string>>({});

  readonly selectedProductVariants = computed(() => this.selectedProduct?.variants ?? []);
  readonly variantFieldLabel = catalogVariantFieldLabel;

  readonly canSubmit = computed(() => {
    const product = this.selectedProduct;
    if (!product) {
      return false;
    }
    const qty = Math.round(Number(this.quantity));
    if (!Number.isFinite(qty) || qty < 1 || qty > 50) {
      return false;
    }
    const price = Number(this.priceEgp);
    if (!Number.isFinite(price) || price < 0) {
      return false;
    }
    return product.variants.every((variant) => {
      if (variant.options.length === 0) {
        return true;
      }
      const picked = this.variantOptionIds()[variant.id];
      return Boolean(picked && variant.options.some((option) => option.id === picked));
    });
  });

  constructor() {
    effect(() => {
      const isOpen = this.open();
      if (!isOpen) {
        return;
      }
      untracked(() => this.resetForm());
    });
  }

  close(): void {
    if (this.submitting()) {
      return;
    }
    this.closed.emit();
  }

  onProductSearch(event: AutoCompleteCompleteEvent): void {
    const shopId = this.shopId().trim();
    if (!shopId) {
      this.productSuggestions.set([]);
      return;
    }
    const query = (event.query ?? '').trim();
    const generation = ++this.searchGeneration;
    this.searchLoading.set(true);
    this.catalog
      .searchShopProducts(shopId, query)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (products) => {
          if (generation !== this.searchGeneration) {
            return;
          }
          this.searchLoading.set(false);
          this.productSuggestions.set(products);
        },
        error: () => {
          if (generation !== this.searchGeneration) {
            return;
          }
          this.searchLoading.set(false);
          this.productSuggestions.set([]);
        },
      });
  }

  onProductSelected(value: OpsCatalogProduct | null): void {
    const product = value && typeof value === 'object' && 'id' in value ? value : null;
    this.selectedProduct = product;
    if (!product) {
      this.variantOptionIds.set({});
      this.priceEgp = 0;
      return;
    }
    const defaults: Record<string, string> = {};
    for (const variant of product.variants) {
      const first = variant.options[0]?.id;
      if (first) {
        defaults[variant.id] = first;
      }
    }
    this.variantOptionIds.set(defaults);
    this.syncPriceFromCatalog(product, defaults);
  }

  optionIdForVariant(variantId: string): string {
    return this.variantOptionIds()[variantId] ?? '';
  }

  setVariantOption(variantId: string, optionId: string): void {
    this.variantOptionIds.update((current) => ({
      ...current,
      [variantId]: optionId,
    }));
    const product = this.selectedProduct;
    if (product) {
      this.syncPriceFromCatalog(product, this.variantOptionIds());
    }
  }

  confirm(): void {
    const product = this.selectedProduct;
    if (!product || !this.canSubmit() || this.submitting()) {
      return;
    }
    const options = product.variants
      .map((variant) => this.variantOptionIds()[variant.id])
      .filter((id): id is string => Boolean(id));
    const primary = catalogPrimaryVariantSelection(product, this.variantOptionIds());
    const payload: AddOrderItemModalSubmit = {
      productId: product.id,
      quantity: Math.round(Number(this.quantity)),
      options,
      customPrice: egpToPiastres(Number(this.priceEgp)),
      variantId: primary?.variantId,
      optionId: primary?.optionId,
    };
    this.submitted.emit(payload);
  }

  private syncPriceFromCatalog(
    product: OpsCatalogProduct,
    optionIdByVariantId: Record<string, string>,
  ): void {
    this.priceEgp = piastresToEgp(catalogUnitPricePiastres(product, optionIdByVariantId));
  }

  private resetForm(): void {
    this.searchGeneration++;
    this.productSuggestions.set([]);
    this.searchLoading.set(false);
    this.selectedProduct = null;
    this.quantity = 1;
    this.priceEgp = 0;
    this.variantOptionIds.set({});
  }
}
