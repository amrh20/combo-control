import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { PermissionDirective } from '../../../core/directives/permission.directive';
import { AuthService } from '../../../core/services/auth.service';
import {
  VendorCategory,
  VendorCategoryService,
  categoryIconSrc,
  isCategoryIconImage,
} from '../../../core/services/vendor-category.service';
import { VendorService, vendorErrorMessage } from '../../../core/services/vendor.service';
import { CategoryFormComponent } from '../category-form/category-form.component';

@Component({
  selector: 'ctrl-vendor-categories',
  standalone: true,
  imports: [FormsModule, ToggleSwitchModule, PermissionDirective, CategoryFormComponent],
  templateUrl: './vendor-categories.component.html',
  styleUrl: './vendor-categories.component.scss',
})
export class VendorCategoriesComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly categoryService = inject(VendorCategoryService);
  private readonly vendorService = inject(VendorService);
  private readonly destroyRef = inject(DestroyRef);

  readonly categories = this.categoryService.categories;
  readonly activeCount = computed(
    () => this.categories().filter((category) => category.isActive).length,
  );

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly statusError = signal<string | null>(null);
  readonly pendingStatusIds = signal<ReadonlySet<string>>(new Set());
  readonly modalOpen = signal(false);
  readonly editingCategory = signal<VendorCategory | null>(null);

  ngOnInit(): void {
    this.vendorService
      .getCategories()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.loadError.set(null);
        },
        error: () => {
          this.loading.set(false);
          this.loadError.set('تعذر تحميل الفئات من الخادم.');
        },
      });
  }

  isImageIcon(iconUrl: string): boolean {
    return isCategoryIconImage(iconUrl);
  }

  iconSrc(iconUrl: string): string {
    return categoryIconSrc(iconUrl);
  }

  isStatusPending(id: string): boolean {
    return this.pendingStatusIds().has(id);
  }

  onStatusToggle(id: string, isActive: boolean): void {
    const current = this.categories().find((category) => category.id === id);
    if (
      !current ||
      current.isActive === isActive ||
      this.isStatusPending(id) ||
      !this.auth.hasPermission('vendors.write')
    ) {
      return;
    }

    const previous = current.isActive;
    this.statusError.set(null);
    this.setStatusPending(id, true);
    this.categoryService.toggleCategoryStatus(id, isActive);
    this.vendorService
      .updateCategoryStatus(id, isActive)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.setStatusPending(id, false),
        error: (error: unknown) => {
          this.categoryService.toggleCategoryStatus(id, previous);
          this.setStatusPending(id, false);
          this.statusError.set(vendorErrorMessage(error, 'تعذر تحديث حالة الفئة.'));
        },
      });
  }

  private setStatusPending(id: string, pending: boolean): void {
    this.pendingStatusIds.update((current) => {
      const next = new Set(current);
      if (pending) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  openAddModal(): void {
    this.editingCategory.set(null);
    this.modalOpen.set(true);
  }

  openEditModal(category: VendorCategory): void {
    this.editingCategory.set(category);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.editingCategory.set(null);
  }
}
