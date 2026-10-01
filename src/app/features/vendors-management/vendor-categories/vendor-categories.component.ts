import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { InputTextModule } from 'primeng/inputtext';
import {
  VendorCategory,
  VendorCategoryService,
  categoryTextColor,
  isCategoryIconImage,
} from '../../../core/services/vendor-category.service';

type ModalMode = 'add' | 'edit';

export const CATEGORY_COLOR_SWATCHES = [
  '#E7F6EE',
  '#E8F5E9',
  '#FFF6D8',
  '#FFE8D2',
  '#FDECEC',
  '#E8F1FE',
  '#F3E8FF',
  '#F6F0E6',
  '#E6F7F4',
  '#FFF1E6',
] as const;

@Component({
  selector: 'ctrl-vendor-categories',
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, ToggleSwitchModule, InputTextModule],
  templateUrl: './vendor-categories.component.html',
  styleUrl: './vendor-categories.component.scss',
})
export class VendorCategoriesComponent {
  private readonly categoryService = inject(VendorCategoryService);
  private readonly fb = inject(FormBuilder);

  readonly swatches = CATEGORY_COLOR_SWATCHES;
  readonly categories = this.categoryService.categories;
  readonly activeCount = computed(
    () => this.categories().filter((category) => category.isActive).length,
  );

  readonly modalOpen = signal(false);
  readonly modalMode = signal<ModalMode>('add');
  private readonly editingId = signal<string | null>(null);

  readonly modalTitle = computed(() =>
    this.modalMode() === 'edit' ? 'تعديل الفئة' : 'إضافة فئة جديدة',
  );

  readonly iconError = signal<string | null>(null);
  private readonly maxIconBytes = 2 * 1024 * 1024;
  private readonly acceptedIconTypes = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/svg+xml',
  ]);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(40)]],
    iconUrl: ['', Validators.required],
    backgroundColor: [
      '#E7F6EE',
      [Validators.required, Validators.pattern(/^#[0-9A-Fa-f]{6}$/)],
    ],
  });

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.modalOpen()) {
      this.closeModal();
    }
  }

  isImageIcon(iconUrl: string): boolean {
    return isCategoryIconImage(iconUrl);
  }

  textColor(hex: string): string {
    return categoryTextColor(hex);
  }

  safeColor(value: string): string {
    return /^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#F4F5F7';
  }

  isSelectedSwatch(hex: string): boolean {
    return this.form.controls.backgroundColor.value.toUpperCase() === hex.toUpperCase();
  }

  onStatusToggle(id: string, isActive: boolean): void {
    this.categoryService.toggleCategoryStatus(id, isActive);
  }

  openAddModal(): void {
    this.modalMode.set('add');
    this.editingId.set(null);
    this.iconError.set(null);
    this.form.reset({
      name: '',
      iconUrl: '',
      backgroundColor: '#E7F6EE',
    });
    this.modalOpen.set(true);
  }

  openEditModal(category: VendorCategory): void {
    this.modalMode.set('edit');
    this.editingId.set(category.id);
    this.iconError.set(null);
    this.form.reset({
      name: category.name,
      iconUrl: category.iconUrl,
      backgroundColor: category.backgroundColor,
    });
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
    this.editingId.set(null);
    this.iconError.set(null);
    this.form.reset();
  }

  onIconSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) {
      return;
    }

    if (!this.acceptedIconTypes.has(file.type)) {
      this.iconError.set('صيغة الصورة غير مدعومة. استخدم PNG أو JPG أو WEBP.');
      this.form.controls.iconUrl.markAsTouched();
      return;
    }

    if (file.size > this.maxIconBytes) {
      this.iconError.set('حجم الصورة أكبر من 2 ميجا.');
      this.form.controls.iconUrl.markAsTouched();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        this.iconError.set('تعذّر قراءة الصورة. حاول مرة أخرى.');
        return;
      }
      this.form.controls.iconUrl.setValue(result);
      this.form.controls.iconUrl.markAsDirty();
      this.iconError.set(null);
    };
    reader.onerror = () => {
      this.iconError.set('تعذّر قراءة الصورة. حاول مرة أخرى.');
    };
    reader.readAsDataURL(file);
  }

  clearIcon(input: HTMLInputElement): void {
    input.value = '';
    this.form.controls.iconUrl.setValue('');
    this.form.controls.iconUrl.markAsTouched();
    this.iconError.set(null);
  }

  selectSwatch(hex: string): void {
    this.form.controls.backgroundColor.setValue(hex);
    this.form.controls.backgroundColor.markAsDirty();
  }

  onColorPicker(event: Event): void {
    const value = (event.target as HTMLInputElement).value.toUpperCase();
    this.form.controls.backgroundColor.setValue(value);
    this.form.controls.backgroundColor.markAsDirty();
  }

  saveCategory(): void {
    if (this.form.invalid || this.iconError()) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const payload = {
      name: value.name.trim(),
      iconUrl: value.iconUrl.trim(),
      backgroundColor: value.backgroundColor.toUpperCase(),
      isActive: true,
    };

    if (this.modalMode() === 'edit') {
      const id = this.editingId();
      if (id) {
        const current = this.categoryService.getById(id);
        this.categoryService.updateCategory(id, {
          name: payload.name,
          iconUrl: payload.iconUrl,
          backgroundColor: payload.backgroundColor,
          isActive: current?.isActive ?? true,
        });
      }
    } else {
      this.categoryService.addCategory(payload);
    }

    this.closeModal();
  }
}
