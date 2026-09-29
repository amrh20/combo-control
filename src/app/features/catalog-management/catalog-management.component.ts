import { DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { CatalogService, Product } from '../../core/services/catalog.service';
import { syncVendorsFromState, VendorProfile } from '../vendors-management/data/vendors.mock';

type ModalMode = 'add' | 'edit';

@Component({
  selector: 'ctrl-catalog-management',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    SelectModule,
    ToggleSwitchModule,
    InputTextModule,
    DecimalPipe,
  ],
  templateUrl: './catalog-management.component.html',
  styleUrl: './catalog-management.component.scss',
})
export class CatalogManagementComponent implements OnInit {
  private readonly catalog = inject(CatalogService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  /** Ecosystem standard — Arabic abbreviation for EGP */
  readonly currency = 'ج.م';
  readonly vendors: VendorProfile[] = syncVendorsFromState();

  readonly vendorOptions = this.vendors.map(v => ({
    label: `${v.name} (${v.id})`,
    value: v.id,
  }));

  readonly selectedShopId = signal<string | null>(null);
  readonly modalOpen = signal(false);
  readonly modalMode = signal<ModalMode>('add');
  private readonly editingId = signal<string | null>(null);

  readonly selectedVendor = computed(() => {
    const id = this.selectedShopId();
    return id ? this.vendors.find(v => v.id === id) ?? null : null;
  });

  readonly products = computed(() => {
    const id = this.selectedShopId();
    if (!id) return [];
    return this.catalog.products().filter(p => p.shopId === id);
  });

  readonly availableCount = computed(
    () => this.products().filter(p => p.isAvailable).length,
  );

  readonly modalTitle = computed(() =>
    this.modalMode() === 'edit' ? 'تعديل المنتج' : 'إضافة منتج جديد',
  );

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: [''],
    price: [0, [Validators.required, Validators.min(0)]],
    category: ['', Validators.required],
  });

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(params => {
      const shopId = params.get('shopId');
      const valid =
        shopId && this.vendors.some(v => v.id === shopId) ? shopId : null;
      if (this.selectedShopId() !== valid) {
        this.selectedShopId.set(valid);
      }
    });
  }

  onVendorChange(shopId: string | null): void {
    this.selectedShopId.set(shopId);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: shopId ? { shopId } : {},
      replaceUrl: true,
    });
  }

  onAvailabilityToggle(product: Product, isAvailable: boolean): void {
    this.catalog.setAvailability(product.id, isAvailable);
  }

  onDeleteProduct(product: Product): void {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) {
      return;
    }
    this.catalog.deleteProduct(product.id);
  }

  openAddModal(): void {
    if (!this.selectedShopId()) return;
    this.modalMode.set('add');
    this.editingId.set(null);
    this.form.reset({
      name: '',
      description: '',
      price: 0,
      category: '',
    });
    this.modalOpen.set(true);
  }

  openEditModal(product: Product): void {
    this.modalMode.set('edit');
    this.editingId.set(product.id);
    this.form.reset({
      name: product.name,
      description: product.description,
      price: product.price,
      category: product.category,
    });
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.editingId.set(null);
    this.form.reset();
  }

  saveProduct(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const patch = {
      name: value.name.trim(),
      description: value.description.trim(),
      price: Number(value.price),
      category: value.category.trim(),
    };

    if (this.modalMode() === 'edit') {
      const id = this.editingId();
      if (id) {
        this.catalog.updateProduct(id, patch);
      }
    } else {
      const shopId = this.selectedShopId();
      if (!shopId) return;
      this.catalog.addProduct({
        ...patch,
        shopId,
        imageUrl: 'https://placehold.co/400x300/ECEFF1/37474F?text=%D9%85%D9%86%D8%AA%D8%AC',
        isAvailable: true,
      });
    }

    this.closeModal();
  }
}
