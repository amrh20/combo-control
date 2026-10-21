import { Injectable, computed, signal } from '@angular/core';
import { API_BASE_URL } from '../api-config';

export interface VendorCategory {
  id: string;
  /** Arabic display name, e.g. بقالة وسوبرماركت */
  name: string;
  /** Emoji for seeded categories, or an uploaded image path such as `/files/...`. */
  iconUrl: string;
  /** CSS color for the category tile, stored as an rgba() string. */
  backgroundColor: string;
  isActive: boolean;
  /** Display order sent as `sortOrder` on create. */
  sortOrder: number;
}

export type VendorCategoryInput = Omit<VendorCategory, 'id'>;

const DEFAULT_CATEGORY_COLOR = 'rgba(231, 246, 238, 0.5)';

const VENDOR_CATEGORIES_SEED: VendorCategory[] = [
  { id: 'VC-001', name: 'بقالة وسوبرماركت', iconUrl: '🛒', backgroundColor: 'rgba(231, 246, 238, 0.5)', isActive: true, sortOrder: 1 },
  { id: 'VC-002', name: 'فواكه وخضروات',     iconUrl: '🥬', backgroundColor: 'rgba(232, 245, 233, 0.5)', isActive: true, sortOrder: 2 },
  { id: 'VC-003', name: 'مخابز',              iconUrl: '🥖', backgroundColor: 'rgba(255, 246, 216, 0.5)', isActive: true, sortOrder: 3 },
  { id: 'VC-004', name: 'لحوم ودواجن',        iconUrl: '🥩', backgroundColor: 'rgba(253, 236, 236, 0.5)', isActive: true, sortOrder: 4 },
  { id: 'VC-005', name: 'صيدليات',            iconUrl: '💊', backgroundColor: 'rgba(232, 241, 254, 0.5)', isActive: true, sortOrder: 5 },
  { id: 'VC-006', name: 'مطاعم',              iconUrl: '🍽️', backgroundColor: 'rgba(255, 232, 210, 0.5)', isActive: true, sortOrder: 6 },
  { id: 'VC-007', name: 'مقاهي',              iconUrl: '☕', backgroundColor: 'rgba(246, 240, 230, 0.5)', isActive: true, sortOrder: 7 },
  { id: 'VC-008', name: 'إلكترونيات',         iconUrl: '📱', backgroundColor: 'rgba(243, 232, 255, 0.5)', isActive: true, sortOrder: 8 },
];

export function isCategoryIconImage(iconUrl: string): boolean {
  return /^(https?:\/\/|\/|data:image\/)/i.test(iconUrl)
    || /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(iconUrl);
}

/** Resolve a stored icon path against the API origin. Absolute and data URLs are unchanged. */
export function categoryIconSrc(iconUrl: string): string {
  return iconUrl.startsWith('/') ? `${API_BASE_URL}${iconUrl}` : iconUrl;
}

const RGBA_PATTERN =
  /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*((?:0|1)(?:\.\d+)?|\.\d+)\s*\)$/i;

export interface ParsedRgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Parse an `rgba(r, g, b, a)` string. Channels must be 0–255 and alpha 0–1. */
export function parseRgba(value: string): ParsedRgba | null {
  const match = value.trim().match(RGBA_PATTERN);
  if (!match) {
    return null;
  }

  const r = Number(match[1]);
  const g = Number(match[2]);
  const b = Number(match[3]);
  const a = Number(match[4]);
  if (r > 255 || g > 255 || b > 255 || a > 1) {
    return null;
  }

  return { r, g, b, a };
}

export function isRgbaColor(value: string): boolean {
  return parseRgba(value) !== null;
}

/** Dark or light label color so text stays readable on a pastel or saturated tile. */
export function categoryTextColor(color: string): string {
  const rgba = parseRgba(color);
  let r: number;
  let g: number;
  let b: number;
  let a = 1;

  if (rgba) {
    r = rgba.r;
    g = rgba.g;
    b = rgba.b;
    a = rgba.a;
  } else {
    const value = color.replace('#', '');
    if (!/^[0-9A-Fa-f]{6}$/.test(value)) {
      return '#243028';
    }
    r = Number.parseInt(value.slice(0, 2), 16);
    g = Number.parseInt(value.slice(2, 4), 16);
    b = Number.parseInt(value.slice(4, 6), 16);
  }

  const blendedR = r * a + 255 * (1 - a);
  const blendedG = g * a + 255 * (1 - a);
  const blendedB = b * a + 255 * (1 - a);
  const luminance = (0.299 * blendedR + 0.587 * blendedG + 0.114 * blendedB) / 255;
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

  /** Next `sortOrder` for a category that has not been saved yet. */
  nextSortOrder(): number {
    const max = this.categoriesSignal().reduce(
      (acc, category) => Math.max(acc, category.sortOrder),
      0,
    );
    return max + 1;
  }

  /** Replace the in-memory list after `GET /v1/vendor-categories`. */
  replaceAll(categories: VendorCategory[]): void {
    this.categoriesSignal.set(categories);
  }

  /** Insert or replace one category after a successful create. */
  upsert(category: VendorCategory): void {
    this.categoriesSignal.update((list) => {
      const index = list.findIndex((item) => item.id === category.id);
      if (index === -1) {
        return [...list, category];
      }
      return list.map((item) => (item.id === category.id ? category : item));
    });
  }

  addCategory(data: VendorCategoryInput): VendorCategory {
    const next: VendorCategory = {
      id: this.nextId(),
      name: data.name.trim(),
      iconUrl: data.iconUrl.trim(),
      backgroundColor: normalizeBackgroundColor(data.backgroundColor),
      isActive: data.isActive,
      sortOrder: data.sortOrder,
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
            ? { backgroundColor: normalizeBackgroundColor(patch.backgroundColor) }
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

function normalizeBackgroundColor(value: string): string {
  const color = value.trim();
  if (isRgbaColor(color)) {
    return color;
  }
  return /^#[0-9A-Fa-f]{6}$/.test(color) ? color : DEFAULT_CATEGORY_COLOR;
}
