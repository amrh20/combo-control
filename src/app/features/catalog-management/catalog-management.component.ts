import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { EMPTY, catchError, expand, forkJoin, of, reduce } from 'rxjs';
import { PermissionDirective } from '../../core/directives/permission.directive';
import { VendorListItem } from '../../core/models/vendor.model';
import { AuthService } from '../../core/services/auth.service';
import { CatalogSection, VendorCatalogService } from '../../core/services/catalog.service';
import { Product, ProductService } from '../../core/services/product.service';
import { categoryIconSrc } from '../../core/services/vendor-category.service';
import { vendorErrorMessage, VendorService } from '../../core/services/vendor.service';

@Component({
  selector: 'ctrl-catalog-management',
  standalone: true,
  imports: [
    FormsModule,
    SelectModule,
    ToggleSwitchModule,
    DecimalPipe,
    NgTemplateOutlet,
    PermissionDirective,
  ],
  templateUrl: './catalog-management.component.html',
  styleUrl: './catalog-management.component.scss',
})
export class CatalogManagementComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly productsApi = inject(ProductService);
  private readonly catalog = inject(VendorCatalogService);
  private readonly vendorService = inject(VendorService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private loadSeq = 0;

  /** Ecosystem standard — Arabic abbreviation for EGP */
  readonly currency = 'ج.م';

  readonly vendors = signal<VendorListItem[]>([]);
  readonly sections = signal<CatalogSection[]>([]);
  readonly products = signal<Product[]>([]);
  readonly vendorsLoading = signal(true);
  readonly vendorsError = signal<string | null>(null);
  readonly productsLoading = signal(false);
  readonly productsError = signal<string | null>(null);
  readonly selectedShopId = signal<string | null>(null);

  readonly selectedVendor = computed(() => {
    const id = this.selectedShopId();
    return id ? this.vendors().find((vendor) => vendor.id === id) ?? null : null;
  });

  readonly availableCount = computed(
    () => this.products().filter((product) => product.isAvailable).length,
  );

  ngOnInit(): void {
    this.vendorService
      .getVendors({ limit: 100 })
      .pipe(
        expand((page) =>
          page.nextCursor ? this.vendorService.getVendors({ limit: 100, cursor: page.nextCursor }) : EMPTY,
        ),
        reduce((all, page) => [...all, ...page.items], [] as VendorListItem[]),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (items) => {
          this.vendors.set(items.filter((vendor) => vendor.id.trim() && vendor.name.trim()));
          this.vendorsLoading.set(false);
          this.applyShopFromRoute();
        },
        error: (error: unknown) => {
          this.vendorsLoading.set(false);
          this.vendorsError.set(vendorErrorMessage(error, 'تعذر تحميل المتاجر.'));
        },
      });
  }

  logoSrc(url: string): string {
    return categoryIconSrc(url);
  }

  vendorSubtitle(vendor: VendorListItem): string {
    return vendor.hubName.trim() || vendor.categoryName.trim();
  }

  sectionLabel(product: Product): string {
    if (product.sectionName) {
      return product.sectionName;
    }
    return this.sections().find((section) => section.id === product.sectionId)?.name ?? '';
  }

  onVendorChange(shopId: string | null): void {
    this.selectedShopId.set(shopId);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: shopId ? { shopId } : {},
      replaceUrl: true,
    });
    if (shopId) {
      this.loadVendorProducts(shopId);
      return;
    }
    this.loadSeq += 1;
    this.products.set([]);
    this.sections.set([]);
    this.productsError.set(null);
    this.productsLoading.set(false);
  }

  onAvailabilityToggle(product: Product, isAvailable: boolean): void {
    const vendorId = this.selectedShopId();
    if (!vendorId) {
      return;
    }
    this.productsApi
      .updateProduct(product.id, { isAvailable })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loadVendorProducts(vendorId),
        error: (error: unknown) => {
          this.productsError.set(vendorErrorMessage(error, 'تعذر تحديث التوفر.'));
          this.loadVendorProducts(vendorId);
        },
      });
  }

  openAddModal(): void {
    const vendorId = this.selectedShopId();
    if (!vendorId) {
      return;
    }
    void this.router.navigate(['/catalog/create'], { queryParams: { shopId: vendorId } });
  }

  openEditModal(product: Product): void {
    const vendorId = this.selectedShopId();
    if (!vendorId) {
      return;
    }
    void this.router.navigate(['/catalog', product.id, 'edit'], {
      queryParams: { shopId: vendorId },
    });
  }

  private applyShopFromRoute(): void {
    const shopId = this.route.snapshot.queryParamMap.get('shopId');
    const valid = shopId && this.vendors().some((vendor) => vendor.id === shopId) ? shopId : null;
    this.selectedShopId.set(valid);
    if (valid) {
      this.loadVendorProducts(valid);
    }
  }

  private loadVendorProducts(vendorId: string): void {
    const seq = ++this.loadSeq;
    this.productsLoading.set(true);
    this.productsError.set(null);
    forkJoin({
      products: this.productsApi.getProducts({ vendorId }),
      sections: this.catalog.getSections(vendorId).pipe(catchError(() => of([] as CatalogSection[]))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ products, sections }) => {
          if (seq !== this.loadSeq || this.selectedShopId() !== vendorId) {
            return;
          }
          this.products.set(products);
          this.sections.set(sections);
          this.productsLoading.set(false);
        },
        error: (error: unknown) => {
          if (seq !== this.loadSeq || this.selectedShopId() !== vendorId) {
            return;
          }
          this.products.set([]);
          this.sections.set([]);
          this.productsLoading.set(false);
          this.productsError.set(vendorErrorMessage(error, 'تعذر تحميل المنتجات.'));
        },
      });
  }
}
