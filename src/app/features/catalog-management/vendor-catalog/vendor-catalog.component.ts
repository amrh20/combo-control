import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { PermissionDirective } from '../../../core/directives/permission.directive';
import {
  CatalogSection,
  VendorCatalogService,
} from '../../../core/services/catalog.service';
import { Product, ProductService } from '../../../core/services/product.service';
import { vendorErrorMessage, VendorService } from '../../../core/services/vendor.service';

/** Main category with its sub-categories. Nesting stops at one level. */
interface CatalogSectionNode extends CatalogSection {
  children: CatalogSection[];
}

type SectionEditor =
  | { mode: 'create'; prefilledParentId: string | null }
  | { mode: 'edit'; section: CatalogSection };

/** Not a database section. Selects products whose `shopCategoryId` is null. */
const UNCATEGORIZED_SECTION_ID = 'UNCATEGORIZED';

@Component({
  selector: 'ctrl-vendor-catalog',
  standalone: true,
  imports: [ReactiveFormsModule, PermissionDirective, NgTemplateOutlet, DecimalPipe],
  templateUrl: './vendor-catalog.component.html',
  styleUrl: './vendor-catalog.component.scss',
})
export class VendorCatalogComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly vendorService = inject(VendorService);
  private readonly catalog = inject(VendorCatalogService);
  private readonly productsApi = inject(ProductService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private productLoadSeq = 0;

  private vendorId = '';
  readonly currency = 'ج.م';
  readonly uncategorizedSectionId = UNCATEGORIZED_SECTION_ID;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly vendorName = signal('');
  readonly vendorError = signal<string | null>(null);
  readonly sectionsError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly sections = signal<CatalogSection[]>([]);
  readonly sectionTree = computed(() => buildSectionTree(this.sections()));
  readonly selectedSectionId = signal<string | null>(null);
  readonly products = signal<Product[]>([]);
  readonly productsLoading = signal(false);
  readonly productsError = signal<string | null>(null);
  readonly editor = signal<SectionEditor | null>(null);

  /** Main categories only. The section being edited is excluded so it cannot parent itself. */
  readonly parentOptions = computed(() => {
    const editor = this.editor();
    const selfId = editor?.mode === 'edit' ? editor.section.id : null;
    return this.sections().filter((section) => !section.parentId && section.id !== selfId);
  });

  /** A main category that already has children cannot move under another parent. */
  readonly canAssignParent = computed(() => {
    const editor = this.editor();
    if (!editor || editor.mode === 'create') {
      return true;
    }
    return !this.sections().some((section) => section.parentId === editor.section.id);
  });

  readonly sectionForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    parentId: [''],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')?.trim() ?? '';
    if (!id) {
      this.router.navigate(['/vendors']);
      return;
    }
    this.vendorId = id;
    this.loadPage();
  }

  goBack(): void {
    this.router.navigate(['/vendors']);
  }

  selectSection(sectionId: string): void {
    this.selectedSectionId.set(sectionId);
    this.loadProducts(sectionId);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { sectionId },
      replaceUrl: true,
    });
  }

  openAddProduct(): void {
    const sectionId = this.selectedSectionId();
    if (!sectionId || !this.vendorId) {
      return;
    }
    if (sectionId === UNCATEGORIZED_SECTION_ID) {
      void this.router.navigate(['/vendors', this.vendorId, 'catalog', 'products', 'create']);
      return;
    }
    void this.router.navigate(['/vendors', this.vendorId, 'catalog', 'products', 'create'], {
      queryParams: { sectionId },
    });
  }

  openEditProduct(product: Product): void {
    const selected = this.selectedSectionId();
    const sectionId =
      selected && selected !== UNCATEGORIZED_SECTION_ID ? selected : product.sectionId.trim();
    void this.router.navigate(
      ['/vendors', this.vendorId, 'catalog', 'products', product.id, 'edit'],
      { queryParams: sectionId ? { sectionId } : {} },
    );
  }

  sectionName(sectionId: string): string {
    if (sectionId === UNCATEGORIZED_SECTION_ID) {
      return 'منتجات بدون تصنيف';
    }
    return this.sections().find((section) => section.id === sectionId)?.name ?? '';
  }

  openCreate(): void {
    this.actionError.set(null);
    this.editor.set({ mode: 'create', prefilledParentId: null });
    this.sectionForm.reset({ name: '', parentId: '' });
    this.applyParentPrefill(null);
  }

  onAddSubCategory(parentCategory: CatalogSection, event: Event): void {
    event.stopPropagation();
    this.actionError.set(null);
    this.editor.set({ mode: 'create', prefilledParentId: parentCategory.id });
    this.sectionForm.reset({ name: '', parentId: '' });
    this.applyParentPrefill(parentCategory.id);
  }

  openEdit(section: CatalogSection, event: Event): void {
    event.stopPropagation();
    this.selectedSectionId.set(section.id);
    this.actionError.set(null);
    this.editor.set({ mode: 'edit', section });
    const currentParent = section.parentId ?? '';
    const parentId = this.parentOptions().some((parent) => parent.id === currentParent)
      ? currentParent
      : '';
    this.sectionForm.reset({
      name: section.name,
      parentId: this.canAssignParent() ? parentId : '',
    });
    if (this.canAssignParent()) {
      this.sectionForm.controls.parentId.enable();
    } else {
      this.sectionForm.controls.parentId.disable();
    }
  }

  closeEditor(): void {
    if (this.saving()) {
      return;
    }
    this.editor.set(null);
    this.actionError.set(null);
  }

  saveSection(): void {
    const raw = this.sectionForm.getRawValue();
    const name = raw.name.trim();
    if (!name || this.saving()) {
      this.sectionForm.controls.name.markAsTouched();
      return;
    }

    const editor = this.editor();
    if (!editor) {
      return;
    }

    this.saving.set(true);
    this.actionError.set(null);

    const selectedParent = raw.parentId.trim();
    const parentId =
      this.canAssignParent() && this.parentOptions().some((parent) => parent.id === selectedParent)
        ? selectedParent
        : null;

    const request =
      editor.mode === 'create'
        ? this.catalog.createSection(this.vendorId, {
            name,
            sortOrder: this.nextSortOrder(),
            parentId,
          })
        : this.catalog.updateSection(this.vendorId, editor.section.id, {
            name,
            sortOrder: editor.section.sortOrder,
            parentId,
          });

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.editor.set(null);
        const preferId = editor.mode === 'create' ? saved?.id : editor.section.id;
        this.reloadSections(preferId ?? this.selectedSectionId());
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.actionError.set(vendorErrorMessage(error, 'تعذر حفظ التصنيف.'));
      },
    });
  }

  deleteSection(section: CatalogSection, event: Event): void {
    event.stopPropagation();
    if (this.saving()) {
      return;
    }
    if (!confirm(`هل أنت متأكد من حذف التصنيف "${section.name}"؟`)) {
      return;
    }

    this.saving.set(true);
    this.sectionsError.set(null);
    this.catalog
      .deleteSection(this.vendorId, section.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          const nextId = this.selectedSectionId() === section.id ? null : this.selectedSectionId();
          this.reloadSections(nextId);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.sectionsError.set(vendorErrorMessage(error, 'تعذر حذف التصنيف.'));
        },
      });
  }

  private loadPage(): void {
    this.loading.set(true);
    this.vendorError.set(null);
    this.sectionsError.set(null);

    forkJoin({
      vendor: this.vendorService.getVendorById(this.vendorId).pipe(
        catchError((error: unknown) => {
          this.vendorError.set(vendorErrorMessage(error, 'تعذر تحميل المتجر.'));
          return of(null);
        }),
      ),
      sections: this.catalog.getSections(this.vendorId).pipe(
        catchError((error: unknown) => {
          this.sectionsError.set(vendorErrorMessage(error, 'تعذر تحميل التصنيفات.'));
          return of([] as CatalogSection[]);
        }),
      ),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ vendor, sections }) => {
          this.loading.set(false);
          this.vendorName.set(vendor?.name?.trim() ?? '');
          const fromQuery = this.route.snapshot.queryParamMap.get('sectionId');
          this.applySections(sections, fromQuery);
          const selected = this.selectedSectionId();
          if (selected) {
            this.loadProducts(selected);
          }
        },
        error: () => {
          this.loading.set(false);
        },
      });
  }

  private reloadSections(preferId: string | null): void {
    this.catalog
      .getSections(this.vendorId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sections) => {
          this.sectionsError.set(null);
          this.applySections(sections, preferId);
        },
        error: (error: unknown) => {
          this.sectionsError.set(vendorErrorMessage(error, 'تعذر تحميل التصنيفات.'));
        },
      });
  }

  private applySections(sections: CatalogSection[], preferId?: string | null): void {
    this.sections.set(sections);
    const current = preferId === undefined ? this.selectedSectionId() : preferId;
    const stillThere =
      current === UNCATEGORIZED_SECTION_ID ||
      (current !== null && sections.some((section) => section.id === current));
    this.selectedSectionId.set(stillThere ? current : null);
    if (!stillThere) {
      this.productLoadSeq += 1;
      this.products.set([]);
      this.productsLoading.set(false);
      this.productsError.set(null);
    }
  }

  private loadProducts(sectionId: string): void {
    const seq = ++this.productLoadSeq;
    const uncategorized = sectionId === UNCATEGORIZED_SECTION_ID;
    this.productsLoading.set(true);
    this.productsError.set(null);
    this.productsApi
      .getProducts(uncategorized ? { vendorId: this.vendorId } : { vendorId: this.vendorId, sectionId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (products) => {
          if (seq !== this.productLoadSeq || this.selectedSectionId() !== sectionId) {
            return;
          }
          this.products.set(uncategorized ? products.filter(isUncategorizedProduct) : products);
          this.productsLoading.set(false);
        },
        error: (error: unknown) => {
          if (seq !== this.productLoadSeq || this.selectedSectionId() !== sectionId) {
            return;
          }
          this.products.set([]);
          this.productsLoading.set(false);
          this.productsError.set(vendorErrorMessage(error, 'تعذر تحميل المنتجات.'));
        },
      });
  }

  private nextSortOrder(): number {
    return this.sections().reduce((max, section) => Math.max(max, section.sortOrder), -1) + 1;
  }

  /** Locks the parent dropdown when a sub-category is added from a main category row. */
  private applyParentPrefill(prefilledParentId: string | null): void {
    const parentControl = this.sectionForm.get('parentId');
    if (!parentControl) {
      return;
    }
    if (prefilledParentId) {
      parentControl.patchValue(prefilledParentId);
      parentControl.disable();
      return;
    }
    parentControl.enable();
  }
}

/** `shopCategoryId: null` is stored on the product as a blank `sectionId`. */
function isUncategorizedProduct(product: Product): boolean {
  return product.sectionId.trim() === '';
}

function buildSectionTree(sections: CatalogSection[]): CatalogSectionNode[] {
  const byId = new Map(sections.map((section) => [section.id, section]));
  const childrenByParent = new Map<string, CatalogSection[]>();
  const roots: CatalogSection[] = [];

  for (const section of sections) {
    const parent = section.parentId ? byId.get(section.parentId) : undefined;
    const parentIsMain = !!parent && !parent.parentId && parent.id !== section.id;
    if (parent && parentIsMain) {
      const children = childrenByParent.get(parent.id) ?? [];
      children.push(section);
      childrenByParent.set(parent.id, children);
    } else {
      roots.push(section);
    }
  }

  const byOrder = (a: CatalogSection, b: CatalogSection) =>
    a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ar');

  return roots.sort(byOrder).map((section) => ({
    ...section,
    children: (childrenByParent.get(section.id) ?? []).sort(byOrder),
  }));
}
