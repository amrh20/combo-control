import { Component, DestroyRef, HostListener, OnInit, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MessageService } from 'primeng/api';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { Subject, finalize, takeUntil } from 'rxjs';
import {
  VendorCategory,
  VendorCategoryService,
  categoryIconSrc,
  categoryTextColor,
  isCategoryIconImage,
  isRgbaColor,
  parseRgba,
} from '../../../core/services/vendor-category.service';
import { UploadService } from '../../../core/services/upload.service';
import { VendorService, vendorErrorMessage } from '../../../core/services/vendor.service';

export const CATEGORY_COLOR_SWATCHES: readonly string[] = [
  'rgba(231, 246, 238, 0.5)',
  'rgba(232, 245, 233, 0.5)',
  'rgba(255, 246, 216, 0.5)',
  'rgba(255, 232, 210, 0.5)',
  'rgba(253, 236, 236, 0.5)',
  'rgba(232, 241, 254, 0.5)',
  'rgba(243, 232, 255, 0.5)',
  'rgba(246, 240, 230, 0.5)',
  'rgba(230, 247, 244, 0.5)',
  'rgba(255, 241, 230, 0.5)',
];

const DEFAULT_CATEGORY_COLOR = CATEGORY_COLOR_SWATCHES[0];
const MAX_ICON_BYTES = 2 * 1024 * 1024;

function rgbaBackgroundValidator(control: AbstractControl): ValidationErrors | null {
  return isRgbaColor(String(control.value ?? '')) ? null : { rgba: true };
}

@Component({
  selector: 'ctrl-category-form',
  standalone: true,
  imports: [ReactiveFormsModule, ToggleSwitchModule, InputTextModule, ToastModule],
  providers: [MessageService],
  templateUrl: './category-form.component.html',
  styleUrl: './category-form.component.scss',
})
export class CategoryFormComponent implements OnInit {
  private readonly categoryService = inject(VendorCategoryService);
  private readonly vendorService = inject(VendorService);
  private readonly uploadService = inject(UploadService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly messages = inject(MessageService);
  private readonly uploadStop$ = new Subject<void>();
  private uploadSeq = 0;

  /** Null opens the dialog in create mode. */
  readonly category = input<VendorCategory | null>(null);
  readonly closed = output<void>();

  readonly swatches = CATEGORY_COLOR_SWATCHES;
  readonly iconError = signal<string | null>(null);
  readonly isUploading = signal(false);
  readonly saving = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(40)]],
    icon: ['', Validators.required],
    backgroundColor: [DEFAULT_CATEGORY_COLOR, [Validators.required, rgbaBackgroundValidator]],
    isActive: [true],
  });

  ngOnInit(): void {
    const current = this.category();
    if (!current) {
      return;
    }

    this.form.reset({
      name: current.name,
      icon: current.iconUrl,
      backgroundColor: current.backgroundColor,
      isActive: current.isActive,
    });
  }

  get title(): string {
    return this.category() ? 'تعديل الفئة' : 'إضافة فئة جديدة';
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  isImageIcon(iconUrl: string): boolean {
    return isCategoryIconImage(iconUrl);
  }

  iconSrc(iconUrl: string): string {
    return categoryIconSrc(iconUrl);
  }

  textColor(color: string): string {
    return categoryTextColor(color);
  }

  safeColor(value: string): string {
    return isRgbaColor(value) ? value.trim() : '#F4F5F7';
  }

  isSelectedSwatch(color: string): boolean {
    const current = parseRgba(this.form.controls.backgroundColor.value);
    const swatch = parseRgba(color);
    if (!current || !swatch) {
      return false;
    }
    return (
      current.r === swatch.r &&
      current.g === swatch.g &&
      current.b === swatch.b &&
      current.a === swatch.a
    );
  }

  close(): void {
    if (this.saving()) {
      return;
    }
    this.cancelUpload();
    this.closed.emit();
  }

  closeOnBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file || this.isUploading()) {
      return;
    }

    if (!file.type.startsWith('image/') && !/\.svg$/i.test(file.name)) {
      this.iconError.set('صيغة الصورة غير مدعومة. استخدم ملف صورة.');
      this.form.controls.icon.markAsTouched();
      return;
    }

    if (file.size > MAX_ICON_BYTES) {
      this.iconError.set('حجم الصورة أكبر من 2 ميجا.');
      this.form.controls.icon.markAsTouched();
      return;
    }

    const seq = ++this.uploadSeq;
    this.iconError.set(null);
    this.isUploading.set(true);
    this.uploadService
      .uploadImage(file)
      .pipe(
        takeUntil(this.uploadStop$),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (this.uploadSeq === seq) {
            this.isUploading.set(false);
          }
        }),
      )
      .subscribe({
        next: (response) => {
          this.form.patchValue({ icon: response.url });
          this.form.controls.icon.markAsDirty();
          this.iconError.set(null);
        },
        error: () => {
          this.iconError.set('تعذّر رفع الصورة. حاول مرة أخرى.');
          this.form.controls.icon.markAsTouched();
        },
      });
  }

  clearIcon(input: HTMLInputElement): void {
    input.value = '';
    this.form.controls.icon.setValue('');
    this.form.controls.icon.markAsTouched();
    this.iconError.set(null);
  }

  selectSwatch(color: string): void {
    this.form.controls.backgroundColor.setValue(color);
    this.form.controls.backgroundColor.markAsDirty();
  }

  saveCategory(): void {
    if (this.form.invalid || this.iconError() || this.isUploading() || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const current = this.category();
    const name = value.name.trim();
    const backgroundColor = value.backgroundColor.trim();
    const icon = value.icon.trim();

    this.saving.set(true);
    const request = current
      ? this.vendorService.updateCategory(current.id, { name, backgroundColor, icon })
      : this.vendorService.createCategory({
          name,
          icon,
          backgroundColor,
          sortOrder: this.categoryService.nextSortOrder(),
          isActive: value.isActive,
        });

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.closed.emit();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'تعذر الحفظ',
          detail: vendorErrorMessage(error, current ? 'تعذر تعديل الفئة.' : 'تعذر إضافة الفئة.'),
          life: 6000,
        });
      },
    });
  }

  private cancelUpload(): void {
    this.uploadSeq += 1;
    this.uploadStop$.next();
    this.isUploading.set(false);
  }
}
