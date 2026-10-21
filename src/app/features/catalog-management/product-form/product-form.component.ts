import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AutoCompleteCompleteEvent, AutoCompleteModule } from 'primeng/autocomplete';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { Subject, catchError, finalize, map, of, takeUntil, tap } from 'rxjs';
import { egpToPiastres, piastresToEgp } from '../../../core/models/zone.model';
import { Attribute, AttributeService } from '../../../core/services/attribute.service';
import { CatalogSection, VendorCatalogService } from '../../../core/services/catalog.service';
import {
  Product,
  ProductOption,
  ProductService,
  ProductSpecification,
  ProductVariant,
  ProductWritePayload,
  displayImage,
} from '../../../core/services/product.service';
import { UploadService } from '../../../core/services/upload.service';
import { vendorErrorMessage } from '../../../core/services/vendor.service';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_IMAGES = 10;
const MAX_VARIANTS = 10;
const MAX_OPTIONS = 30;
const MAX_SPECS = 30;

function optionalNonNegative(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? null : { min: true };
}

@Component({
  selector: 'ctrl-product-form',
  standalone: true,
  imports: [ReactiveFormsModule, InputTextModule, SelectModule, ToggleSwitchModule, AutoCompleteModule],
  templateUrl: './product-form.component.html',
  styleUrl: './product-form.component.scss',
})
export class ProductFormComponent implements OnInit {
  private readonly products = inject(ProductService);
  private readonly catalog = inject(VendorCatalogService);
  private readonly attributes = inject(AttributeService);
  private readonly uploadService = inject(UploadService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly uploadStop$ = new Subject<void>();
  private readonly pendingAttributeNames = new Set<string>();
  private readonly attributeCommitTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private uploadSeq = 0;
  /** New option rows track the main price until the admin types a different final price. */
  private readonly optionPriceFollowsBase = new WeakMap<FormGroup, boolean>();
  private applyingBasePrice = false;

  private vendorId = '';
  private productId: string | null = null;
  private fromVendorCatalog = false;

  readonly maxImages = MAX_IMAGES;
  readonly sections = signal<CatalogSection[]>([]);
  readonly sectionsLoading = signal(true);
  readonly sectionsError = signal<string | null>(null);
  readonly imageError = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly loading = signal(false);
  readonly isUploading = signal(false);
  readonly saving = signal(false);
  readonly imageDragOver = signal(false);
  readonly sectionLocked = signal(false);
  readonly isEditMode = signal(false);
  readonly availableAttributes = signal<Attribute[]>([]);
  attributeNameSuggestions: string[] = [];
  optionValueSuggestions: string[] = [];

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    sectionId: this.fb.control<string | null>(null),
    price: [0, [Validators.required, Validators.min(0)]],
    oldPrice: [null as number | null, optionalNonNegative],
    description: ['', Validators.maxLength(5000)],
    isAvailable: [true],
    isNew: [false],
    images: this.fb.nonNullable.array<string>([]),
    variants: this.fb.array<FormGroup>([]),
    specifications: this.fb.array<FormGroup>([]),
  });

  ngOnInit(): void {
    const vendorFromPath = this.route.snapshot.paramMap.get('id')?.trim() ?? '';
    const shopId = this.route.snapshot.queryParamMap.get('shopId')?.trim() ?? '';
    this.fromVendorCatalog = !!vendorFromPath;
    this.vendorId = vendorFromPath || shopId;
    this.productId = this.route.snapshot.paramMap.get('productId')?.trim() || null;
    this.isEditMode.set(!!this.productId);

    if (!this.vendorId) {
      void this.router.navigate(this.fromVendorCatalog ? ['/vendors'] : ['/catalog']);
      return;
    }

    const prefilledSectionId = this.route.snapshot.queryParamMap.get('sectionId')?.trim() ?? '';
    if (prefilledSectionId) {
      this.sectionLocked.set(true);
      this.form.controls.sectionId.disable();
      this.form.controls.sectionId.setValue(prefilledSectionId);
    }

    this.destroyRef.onDestroy(() => this.clearAttributeCommits());
    this.form.controls.price.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncOptionPricesToBase());
    this.loadSections(this.vendorId);
    this.loadAttributes(this.vendorId);
    if (this.productId) {
      this.loadProduct(this.productId, prefilledSectionId);
    }
  }

  get title(): string {
    return this.isEditMode() ? 'تعديل المنتج' : 'إضافة منتج جديد';
  }

  get backLabel(): string {
    return this.fromVendorCatalog ? 'العودة إلى التصنيفات' : 'العودة إلى المنتجات';
  }

  get images(): FormArray {
    return this.form.controls.images;
  }

  get variants(): FormArray<FormGroup> {
    return this.form.controls.variants;
  }

  get specifications(): FormArray<FormGroup> {
    return this.form.controls.specifications;
  }

  imageSrc(url: string): string {
    return displayImage(url);
  }

  variantOptions(index: number): FormArray<FormGroup> {
    return this.variants.at(index).controls['options'] as FormArray<FormGroup>;
  }

  sectionOptions(): { label: string; value: string }[] {
    return this.sections().map((section) => ({
      label: this.sectionLabel(section),
      value: section.id,
    }));
  }

  sectionLabel(section: CatalogSection): string {
    if (!section.parentId) {
      return section.name;
    }
    const parent = this.sections().find((item) => item.id === section.parentId);
    return parent ? `${parent.name} / ${section.name}` : section.name;
  }

  addVariant(): void {
    if (this.variants.length >= MAX_VARIANTS) {
      return;
    }
    this.variants.push(this.variantGroup(undefined, egpToPiastres(this.currentBasePriceEgp())));
  }

  removeVariant(index: number): void {
    this.clearAttributeCommits();
    this.variants.removeAt(index);
  }

  addOption(variantIndex: number): void {
    const options = this.variantOptions(variantIndex);
    if (options.length >= MAX_OPTIONS) {
      return;
    }
    options.push(this.optionGroup(undefined, egpToPiastres(this.currentBasePriceEgp())));
  }

  removeOption(variantIndex: number, optionIndex: number): void {
    const options = this.variantOptions(variantIndex);
    if (options.length <= 1) {
      return;
    }
    options.removeAt(optionIndex);
  }

  addSpecification(): void {
    if (this.specifications.length >= MAX_SPECS) {
      return;
    }
    this.specifications.push(this.specificationGroup());
  }

  removeSpecification(index: number): void {
    this.specifications.removeAt(index);
  }

  filterAttributeNames(event: AutoCompleteCompleteEvent): void {
    const query = suggestionQuery(event);
    this.attributeNameSuggestions = this.availableAttributes()
      .map((attribute) => attribute.name)
      .filter((name) => includesQuery(name, query));
  }

  filterOptionValues(variantIndex: number, event: AutoCompleteCompleteEvent): void {
    const query = suggestionQuery(event);
    this.optionValueSuggestions = this.suggestedValuesFor(variantIndex).filter((value) =>
      includesQuery(value, query),
    );
  }

  onAttributeNameBlur(variantIndex: number): void {
    const control = this.variants.at(variantIndex)?.get('name');
    if (!control) {
      return;
    }
    const pending = this.attributeCommitTimers.get(variantIndex);
    if (pending) {
      clearTimeout(pending);
    }
    // Wait out the suggestion click, which blurs the input before it writes the chosen name.
    const timer = setTimeout(() => {
      this.attributeCommitTimers.delete(variantIndex);
      const name = String(control.value ?? '').trim();
      if (!name) {
        return;
      }
      if (control.value !== name) {
        control.setValue(name);
      }
      this.ensureAttribute(name);
    }, 200);
    this.attributeCommitTimers.set(variantIndex, timer);
  }

  cancel(): void {
    if (this.saving()) {
      return;
    }
    this.cancelUpload();
    this.goBack();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (file) {
      this.uploadImageFile(file);
    }
  }

  onImageDragOver(event: DragEvent): void {
    event.preventDefault();
    if (this.isUploading() || this.images.length >= MAX_IMAGES) {
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'none';
      }
      return;
    }
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
    this.imageDragOver.set(true);
  }

  onImageDragLeave(event: DragEvent): void {
    const next = event.relatedTarget;
    if (next instanceof Node && (event.currentTarget as Node).contains(next)) {
      return;
    }
    this.imageDragOver.set(false);
  }

  onImageDrop(event: DragEvent): void {
    event.preventDefault();
    this.imageDragOver.set(false);
    const file = event.dataTransfer?.files?.[0] ?? null;
    if (file) {
      this.uploadImageFile(file);
    }
  }

  private uploadImageFile(file: File): void {
    if (this.isUploading()) {
      return;
    }
    if (this.images.length >= MAX_IMAGES) {
      this.imageError.set('الحد الأقصى 10 صور.');
      return;
    }
    if (!file.type.startsWith('image/') && !/\.svg$/i.test(file.name)) {
      this.imageError.set('صيغة الصورة غير مدعومة. استخدم ملف صورة.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      this.imageError.set('حجم الصورة أكبر من 2 ميجا.');
      return;
    }

    const seq = ++this.uploadSeq;
    this.imageError.set(null);
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
          this.images.push(this.fb.nonNullable.control(response.url));
          this.imageError.set(null);
        },
        error: () => {
          this.imageError.set('تعذّر رفع الصورة. حاول مرة أخرى.');
        },
      });
  }

  removeImage(index: number): void {
    this.images.removeAt(index);
    this.imageError.set(null);
  }

  saveProduct(): void {
    if (this.form.invalid || this.imageError() || this.isUploading() || this.saving() || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const price = Number(raw.price);
    if (!Number.isFinite(price) || price < 0) {
      this.form.controls.price.markAsTouched();
      return;
    }
    const oldPrice = readOptionalEgp(raw.oldPrice);
    if (raw.oldPrice !== null && raw.oldPrice !== undefined && String(raw.oldPrice) !== '' && oldPrice === null) {
      this.form.controls.oldPrice.markAsTouched();
      return;
    }

    const payload: ProductWritePayload = {
      vendorId: this.vendorId,
      sectionId: raw.sectionId?.trim() || null,
      name: raw.name.trim(),
      description: raw.description.trim(),
      images: raw.images.map((image) => image.trim()).filter(Boolean),
      isAvailable: raw.isAvailable,
      isNew: raw.isNew,
      pricePiastres: egpToPiastres(price),
      oldPricePiastres: oldPrice === null ? null : egpToPiastres(oldPrice),
      variants: this.variantsPayload(),
      specifications: this.specificationsPayload(),
    };

    this.saving.set(true);
    this.saveError.set(null);
    const request = this.productId
      ? this.products.updateProduct(this.productId, payload)
      : this.products.createProduct(payload);

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        this.goBack();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(
          vendorErrorMessage(error, this.productId ? 'تعذر تعديل المنتج.' : 'تعذر إضافة المنتج.'),
        );
      },
    });
  }

  private variantsPayload(): ProductVariant[] {
    const basePrice = this.currentBasePriceEgp();
    const basePiastres = egpToPiastres(basePrice);
    return this.variants.getRawValue().map((variant) => {
      const id = String(variant['id'] ?? '').trim();
      const options = (variant['options'] as Array<Record<string, unknown>>).map((option) => {
        const optionId = String(option['id'] ?? '').trim();
        const parsedPrice = readOptionalEgp(option['price']);
        const optionPrice = parsedPrice === null ? basePrice : parsedPrice;
        let priceDeltaPiastres = egpToPiastres(optionPrice) - basePiastres;
        if (basePiastres + priceDeltaPiastres <= 0) {
          priceDeltaPiastres = 0;
        }
        const mapped: ProductOption = {
          label: String(option['label'] ?? '').trim(),
          priceDeltaPiastres,
        };
        if (optionId) {
          mapped.id = optionId;
        }
        return mapped;
      });
      const mapped: ProductVariant = {
        name: String(variant['name'] ?? '').trim(),
        options,
      };
      if (id) {
        mapped.id = id;
      }
      return mapped;
    });
  }

  private specificationsPayload(): ProductSpecification[] {
    return this.specifications
      .getRawValue()
      .map((item) => ({
        label: String(item['label'] ?? '').trim(),
        value: String(item['value'] ?? '').trim(),
      }))
      .filter((item) => item.label.length > 0 || item.value.length > 0);
  }

  private loadProduct(productId: string, prefilledSectionId: string): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.products
      .getProduct(productId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (product) => {
          if (product.vendorId && product.vendorId !== this.vendorId) {
            this.loading.set(false);
            this.loadError.set('هذا المنتج لا يتبع المتجر الحالي.');
            return;
          }
          this.fillForm(product, prefilledSectionId);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.loadError.set(vendorErrorMessage(error, 'تعذر تحميل المنتج.'));
        },
      });
  }

  private fillForm(product: Product, prefilledSectionId: string): void {
    this.form.reset({
      name: product.name,
      sectionId: prefilledSectionId || product.sectionId || null,
      price: piastresToEgp(product.pricePiastres),
      oldPrice: product.oldPricePiastres === null ? null : piastresToEgp(product.oldPricePiastres),
      description: product.description,
      isAvailable: product.isAvailable,
      isNew: product.isNew,
    });
    this.images.clear();
    for (const image of product.images) {
      this.images.push(this.fb.nonNullable.control(image));
    }
    this.variants.clear();
    for (const variant of product.variants) {
      this.variants.push(this.variantGroup(variant, product.pricePiastres));
    }
    this.specifications.clear();
    for (const spec of product.specifications) {
      this.specifications.push(this.specificationGroup(spec));
    }
    if (this.sectionLocked()) {
      this.form.controls.sectionId.disable();
    }
  }

  private variantGroup(variant?: ProductVariant, basePricePiastres?: number): FormGroup {
    const options = variant?.options.length ? variant.options : [undefined];
    return this.fb.nonNullable.group({
      id: [variant?.id ?? ''],
      name: [variant?.name ?? '', [Validators.required, Validators.maxLength(60)]],
      options: this.fb.array(options.map((option) => this.optionGroup(option, basePricePiastres))),
    });
  }

  /**
   * The option control stores the final price in EGP. A loaded choice is
   * `(basePricePiastres + priceDeltaPiastres) / 100`. A new choice starts at the
   * current base price, so its delta stays 0 until the admin types another price.
   */
  private optionGroup(option?: ProductOption, basePricePiastres?: number): FormGroup {
    const group = this.fb.nonNullable.group({
      id: [option?.id ?? ''],
      label: [option?.label ?? '', [Validators.required, Validators.maxLength(60)]],
      price: [this.absoluteOptionPrice(option, basePricePiastres), [Validators.required, Validators.min(0)]],
    });
    this.optionPriceFollowsBase.set(group, !option);
    group.controls['price'].valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (!this.applyingBasePrice) {
        this.optionPriceFollowsBase.set(group, false);
      }
    });
    return group;
  }

  /** Keep untouched option rows equal to the main product price while the admin is typing it. */
  private syncOptionPricesToBase(): void {
    const base = this.currentBasePriceEgp();
    this.applyingBasePrice = true;
    for (const variant of this.variants.controls) {
      const options = variant.controls['options'] as FormArray<FormGroup>;
      for (const option of options.controls) {
        if (!this.optionPriceFollowsBase.get(option)) {
          continue;
        }
        option.controls['price'].setValue(base);
      }
    }
    this.applyingBasePrice = false;
  }

  private absoluteOptionPrice(option: ProductOption | undefined, basePricePiastres?: number): number {
    if (option) {
      const absolute = piastresToEgp((basePricePiastres ?? 0) + option.priceDeltaPiastres);
      if (absolute <= 0 && (basePricePiastres ?? 0) > 0) {
        return piastresToEgp(basePricePiastres ?? 0);
      }
      return Math.max(0, absolute);
    }
    if (basePricePiastres !== undefined) {
      return piastresToEgp(basePricePiastres);
    }
    return this.currentBasePriceEgp();
  }

  private currentBasePriceEgp(): number {
    const amount = readOptionalEgp(this.form.controls.price.value);
    return amount !== null && amount >= 0 ? amount : 0;
  }

  private specificationGroup(spec?: ProductSpecification): FormGroup {
    // Hidden in the template. No required validators, so an unseen row cannot block save.
    return this.fb.nonNullable.group({
      label: [spec?.label ?? ''],
      value: [spec?.value ?? ''],
    });
  }

  private suggestedValuesFor(variantIndex: number): string[] {
    const name = String(this.variants.at(variantIndex)?.get('name')?.value ?? '');
    return this.findAttribute(name)?.suggestedValues ?? [];
  }

  private findAttribute(name: string): Attribute | undefined {
    const key = attributeKey(name);
    if (!key) {
      return undefined;
    }
    return this.availableAttributes().find((attribute) => attributeKey(attribute.name) === key);
  }

  private loadAttributes(vendorId: string): void {
    this.attributes
      .getAttributes(vendorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (attributes) => this.mergeAttributes(attributes),
        error: () => {
          // Suggestions stay empty. Typed names are still saved with the product.
        },
      });
  }

  private ensureAttribute(name: string): void {
    const key = attributeKey(name);
    if (!key || this.findAttribute(name) || this.pendingAttributeNames.has(key) || !this.vendorId) {
      return;
    }

    this.pendingAttributeNames.add(key);
    this.attributes
      .createAttribute(this.vendorId, { name })
      .pipe(
        catchError((error: unknown) => {
          if (!isConflict(error)) {
            return of(null);
          }
          return this.attributes.getAttributes(this.vendorId).pipe(
            tap((attributes) => this.mergeAttributes(attributes)),
            map(
              (attributes) =>
                attributes.find((attribute) => attributeKey(attribute.name) === key) ??
                emptyAttribute(name),
            ),
            catchError(() => of(emptyAttribute(name))),
          );
        }),
        finalize(() => this.pendingAttributeNames.delete(key)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((created) => {
        if (created) {
          this.rememberAttribute(created);
        }
      });
  }

  private mergeAttributes(incoming: Attribute[]): void {
    this.availableAttributes.update((current) => {
      const incomingKeys = new Set(incoming.map((attribute) => attributeKey(attribute.name)));
      const localOnly = current.filter((attribute) => !incomingKeys.has(attributeKey(attribute.name)));
      return [...incoming, ...localOnly];
    });
  }

  private rememberAttribute(attribute: Attribute): void {
    const key = attributeKey(attribute.name);
    this.availableAttributes.update((list) => {
      const index = list.findIndex((item) => attributeKey(item.name) === key);
      if (index === -1) {
        return [...list, attribute];
      }
      const next = list.slice();
      next[index] = attribute;
      return next;
    });
  }

  private clearAttributeCommits(): void {
    for (const timer of this.attributeCommitTimers.values()) {
      clearTimeout(timer);
    }
    this.attributeCommitTimers.clear();
  }

  private loadSections(vendorId: string): void {
    this.sectionsLoading.set(true);
    this.sectionsError.set(null);
    this.catalog
      .getSections(vendorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sections) => {
          this.sections.set(sections);
          this.sectionsLoading.set(false);
        },
        error: (error: unknown) => {
          this.sectionsLoading.set(false);
          this.sectionsError.set(vendorErrorMessage(error, 'تعذر تحميل الفئات.'));
        },
      });
  }

  private goBack(): void {
    if (this.fromVendorCatalog) {
      const sectionId = this.route.snapshot.queryParamMap.get('sectionId')?.trim() ?? '';
      void this.router.navigate(['/vendors', this.vendorId, 'catalog'], {
        queryParams: sectionId ? { sectionId } : {},
      });
      return;
    }
    void this.router.navigate(['/catalog'], {
      queryParams: { shopId: this.vendorId },
    });
  }

  private cancelUpload(): void {
    this.uploadSeq += 1;
    this.uploadStop$.next();
    this.isUploading.set(false);
  }
}

function attributeKey(name: string): string {
  return name.trim().toLocaleLowerCase('ar');
}

/** Focusing the field shows the full list. Typing narrows it. */
function suggestionQuery(event: AutoCompleteCompleteEvent): string {
  if (event.originalEvent?.type === 'focus') {
    return '';
  }
  return event.query ?? '';
}

function includesQuery(value: string, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase('ar');
  if (!needle) {
    return true;
  }
  return value.toLocaleLowerCase('ar').includes(needle);
}

function emptyAttribute(name: string): Attribute {
  return { id: '', name, isGlobal: false, suggestedValues: [] };
}

function isConflict(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 409;
}

function readOptionalEgp(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}
