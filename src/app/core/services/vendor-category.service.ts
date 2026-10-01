import { Injectable, computed, signal } from '@angular/core';

export interface VendorCategory {
  id: string;
  /** Arabic display name, e.g. بقالة وسوبرماركت */
  name: string;
  /** Emoji for seeded categories, or an uploaded image as a data URL. */
  iconUrl: string;
  /** Pastel hex used as the category tile background. */
  backgroundColor: string;
  isActive: boolean;
}

export type VendorCategoryInput = Omit<VendorCategory, 'id'>;

const VENDOR_CATEGORIES_SEED: VendorCategory[] = [
  { id: 'VC-001', name: 'بقالة وسوبرماركت', iconUrl: '🛒', backgroundColor: '#E7F6EE', isActive: true },
  { id: 'VC-002', name: 'فواكه وخضروات',     iconUrl: '🥬', backgroundColor: '#E8F5E9', isActive: true },
  { id: 'VC-003', name: 'مخابز',              iconUrl: '🥖', backgroundColor: '#FFF6D8', isActive: true },
  { id: 'VC-004', name: 'لحوم ودواجن',        iconUrl: '🥩', backgroundColor: '#FDECEC', isActive: true },
  { id: 'VC-005', name: 'صيدليات',            iconUrl: '💊', backgroundColor: '#E8F1FE', isActive: true },
  { id: 'VC-006', name: 'مطاعم',              iconUrl: '🍽️', backgroundColor: '#FFE8D2', isActive: true },
  { id: 'VC-007', name: 'مقاهي',              iconUrl: '☕', backgroundColor: '#F6F0E6', isActive: true },
  { id: 'VC-008', name: 'إلكترونيات',         iconUrl: '📱', backgroundColor: '#F3E8FF', isActive: true },
];

export function isCategoryIconImage(iconUrl: string): boolean {
  return /^(https?:\/\/|\/|data:image\/)/i.test(iconUrl)
    || /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(iconUrl);
}

/** Dark or light label color so text stays readable on a pastel or saturated tile. */
export function categoryTextColor(hex: string): string {
  const value = hex.replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(value)) {
    return '#243028';
  }
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#243028' : '#FFFFFF';
}

@Injectable({ providedIn: 'root' })
export class VendorCategoryService {
  private readonly categoriesSignal = signal<VendorCategory[]>(
    structuredClone(VENDOR_CATEGORIES_SEED),
  );

  readonly categories = this.categoriesSignal.asReadonly();

  readonly activeCategories = computed(() =>
    this.categoriesSignal().filter((category) => category.isActive),
  );

  getById(id: string): VendorCategory | null {
    return this.categoriesSignal().find((category) => category.id === id) ?? null;
  }

  nameOf(id: string): string {
    return this.getById(id)?.name ?? '';
  }

  addCategory(data: VendorCategoryInput): VendorCategory {
    const next: VendorCategory = {
      id: this.nextId(),
      name: data.name.trim(),
      iconUrl: data.iconUrl.trim(),
      backgroundColor: normalizeHex(data.backgroundColor),
      isActive: data.isActive,
    };

    this.categoriesSignal.update((list) => [...list, next]);
    return next;
  }

  updateCategory(id: string, patch: Partial<VendorCategoryInput>): void {
    this.categoriesSignal.update((list) =>
      list.map((category) => {
        if (category.id !== id) {
          return category;
        }

        return {
          ...category,
          ...patch,
          ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
          ...(patch.iconUrl !== undefined ? { iconUrl: patch.iconUrl.trim() } : {}),
          ...(patch.backgroundColor !== undefined
            ? { backgroundColor: normalizeHex(patch.backgroundColor) }
            : {}),
        };
      }),
    );
  }

  /**
   * Set active/inactive. When `isActive` is omitted, the current value is flipped.
   */
  toggleCategoryStatus(id: string, isActive?: boolean): void {
    this.categoriesSignal.update((list) =>
      list.map((category) => {
        if (category.id !== id) {
          return category;
        }
        return { ...category, isActive: isActive ?? !category.isActive };
      }),
    );
  }

  private nextId(): string {
    const max = this.categoriesSignal().reduce((acc, category) => {
      const n = Number.parseInt(category.id.replace(/\D/g, ''), 10);
      return Number.isFinite(n) ? Math.max(acc, n) : acc;
    }, 0);
    return `VC-${String(max + 1).padStart(3, '0')}`;
  }
}

function normalizeHex(value: string): string {
  const hex = value.trim();
  return /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex.toUpperCase() : '#E7F6EE';
}
