import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, map, reduce } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import { piastresToEgp } from '../models/zone.model';

export interface ProductFilters {
  vendorId: string;
  /** Shop section. Sent as `shopCategoryId`. */
  sectionId?: string;
}

/** One choice inside a variant (pricing lives on `ProductCombination`). */
export interface ProductOption {
  id?: string;
  label: string;
  priceDeltaPiastres: number;
}

/** Sellable SKU for a specific option permutation (`POST/PATCH` combinations). */
export interface ProductCombination {
  skuMapping: Record<string, string>;
  pricePiastres: number;
  isAvailable: boolean;
  /** Units on hand. Required by the form when the combination is available. */
  stockQuantity: number | null;
}

/** A required choice group, such as weight or size. */
export interface ProductVariant {
  id?: string;
  name: string;
  options: ProductOption[];
}

export interface ProductSpecification {
  label: string;
  value: string;
}

/** Product as shown in the catalog. `price` is EGP (`pricePiastres / 100`). */
export interface Product {
  id: string;
  vendorId: string;
  /** Primary section for list views; first of `categoryIds` when present. */
  sectionId: string;
  categoryIds: string[];
  name: string;
  description: string;
  /** First image, ready to display. */
  imageUrl: string;
  /** Stored image paths, in upload order. */
  images: string[];
  isAvailable: boolean;
  isNew: boolean;
  pricePiastres: number;
  oldPricePiastres: number | null;
  price: number;
  sectionName: string;
  variants: ProductVariant[];
  combinations: ProductCombination[];
  specifications: ProductSpecification[];
}

export interface ProductWritePayload {
  vendorId: string;
  categoryIds: string[];
  name: string;
  description: string;
  images: string[];
  isAvailable: boolean;
  isNew: boolean;
  pricePiastres: number;
  oldPricePiastres: number | null;
  variants: ProductVariant[];
  combinations: ProductCombination[];
  specifications: ProductSpecification[];
}

export type ProductUpdatePayload = Partial<ProductWritePayload>;

interface ProductApiSection {
  id?: string | null;
  name?: string | null;
}

interface ProductApiRecord {
  id?: string | null;
  productId?: string | null;
  vendorId?: string | null;
  shopCategoryId?: string | null;
  sectionId?: string | null;
  shopCategoryIds?: Array<string | null> | null;
  categoryIds?: Array<string | null> | null;
  categories?: Array<ProductApiSection | null> | null;
  name?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  images?: Array<string | null> | null;
  isAvailable?: boolean | null;
  isNew?: boolean | null;
  pricePiastres?: number | string | null;
  oldPricePiastres?: number | string | null;
  sectionName?: string | null;
  section?: ProductApiSection | null;
  variants?: unknown;
  combinations?: unknown;
  specifications?: unknown;
}

interface ProductPage {
  items: Product[];
  nextCursor: string | null;
}

const VENDORS_URL = `${API_BASE_URL}/v1/vendors`;
const PRODUCTS_URL = `${API_BASE_URL}/v1/products`;

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly http = inject(HttpClient);

  /**
   * `GET /v1/vendors/{vendorId}/products`.
   * `sectionId` is sent as `shopCategoryId`. Follows `nextCursor` until every page is loaded.
   */
  getProducts(filters: ProductFilters): Observable<Product[]> {
    return this.getProductPage(filters).pipe(
      expand((page) => (page.nextCursor ? this.getProductPage(filters, page.nextCursor) : EMPTY)),
      reduce((all, page) => [...all, ...page.items], [] as Product[]),
    );
  }

  /** `POST /v1/vendors/{vendorId}/products` */
  createProduct(payload: ProductWritePayload): Observable<Product> {
    return this.http
      .post<unknown>(`${VENDORS_URL}/${payload.vendorId}/products`, toApiBody(payload))
      .pipe(map((body) => parseProduct(body) ?? productFromPayload(payload)));
  }

  /** `PATCH /v1/products/{id}` */
  updateProduct(id: string, payload: ProductUpdatePayload): Observable<Product> {
    return this.http
      .patch<unknown>(`${PRODUCTS_URL}/${id}`, toApiBody(payload))
      .pipe(map((body) => parseProduct(body) ?? productFromPayload(payload, id)));
  }

  /** `GET /v1/products/{id}` */
  getProduct(id: string): Observable<Product> {
    return this.http.get<unknown>(`${PRODUCTS_URL}/${id}`).pipe(
      map((body) => {
        const product = parseProduct(body);
        if (!product) {
          throw new Error('Product response was empty');
        }
        return product;
      }),
    );
  }

  private getProductPage(filters: ProductFilters, cursor?: string): Observable<ProductPage> {
    let params = new HttpParams().set('limit', '100');
    const sectionId = filters.sectionId?.trim() ?? '';
    if (sectionId) {
      params = params.set('shopCategoryId', sectionId);
    }
    if (cursor) {
      params = params.set('cursor', cursor);
    }

    return this.http.get<unknown>(`${VENDORS_URL}/${filters.vendorId}/products`, { params }).pipe(
      map((body) => ({
        items: unwrapProducts(body)
          .map(toProduct)
          .filter((product): product is Product => product !== null),
        nextCursor: readCursor(body),
      })),
    );
  }
}

/** Maps the form onto `POST/PATCH /products`, including optional catalog fields. */
function toApiBody(payload: ProductUpdatePayload): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (payload.name !== undefined) {
    body['name'] = payload.name.trim();
  }
  if (payload.description !== undefined) {
    body['description'] = payload.description.trim() || null;
  }
  if (payload.categoryIds !== undefined) {
    body['categoryIds'] = payload.categoryIds.map((id) => id.trim()).filter(Boolean);
  }
  if (payload.pricePiastres !== undefined) {
    body['pricePiastres'] = payload.pricePiastres;
  }
  if (payload.oldPricePiastres !== undefined) {
    body['oldPricePiastres'] = payload.oldPricePiastres;
  }
  if (payload.isAvailable !== undefined) {
    body['isAvailable'] = payload.isAvailable;
  }
  if (payload.isNew !== undefined) {
    body['isNew'] = payload.isNew;
  }
  if (payload.images !== undefined) {
    body['images'] = payload.images.map((image) => image.trim()).filter(Boolean);
  }
  if (payload.variants !== undefined) {
    body['variants'] = payload.variants.map((variant) => ({
      ...(variant.id ? { id: variant.id } : {}),
      name: variant.name.trim(),
      options: variant.options.map((option) => ({
        ...(option.id ? { id: option.id } : {}),
        label: option.label.trim(),
        priceDeltaPiastres: option.priceDeltaPiastres,
      })),
    }));
  }
  if (payload.combinations !== undefined) {
    body['combinations'] = payload.combinations.map((combo) => ({
      skuMapping: combo.skuMapping,
      price: combo.pricePiastres,
      isAvailable: combo.isAvailable,
      stockQuantity: combo.stockQuantity,
    }));
  }
  if (payload.specifications !== undefined) {
    body['specifications'] = payload.specifications.map((item) => ({
      label: item.label.trim(),
      value: item.value.trim(),
    }));
  }
  return body;
}

function productFromPayload(payload: ProductUpdatePayload, id = ''): Product {
  const pricePiastres = Number(payload.pricePiastres);
  const piastres = Number.isFinite(pricePiastres) ? pricePiastres : 0;
  const images = payload.images?.map((image) => image.trim()).filter(Boolean) ?? [];
  const categoryIds =
    payload.categoryIds?.map((id) => id.trim()).filter(Boolean) ?? [];
  return {
    id,
    vendorId: payload.vendorId?.trim() ?? '',
    sectionId: categoryIds[0] ?? '',
    categoryIds,
    name: payload.name?.trim() ?? '',
    description: payload.description?.trim() ?? '',
    imageUrl: images[0] ? displayImage(images[0]) : '',
    images,
    isAvailable: payload.isAvailable !== false,
    isNew: payload.isNew === true,
    pricePiastres: piastres,
    oldPricePiastres: payload.oldPricePiastres ?? null,
    price: piastresToEgp(piastres),
    sectionName: '',
    variants: payload.variants ?? [],
    combinations: payload.combinations ?? [],
    specifications: payload.specifications ?? [],
  };
}

function unwrapProducts(body: unknown): ProductApiRecord[] {
  if (Array.isArray(body)) {
    return body as ProductApiRecord[];
  }
  if (!body || typeof body !== 'object') {
    return [];
  }
  const record = body as Record<string, unknown>;
  for (const key of ['items', 'data', 'products']) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value as ProductApiRecord[];
    }
  }
  return [];
}

function readCursor(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const cursor = (body as Record<string, unknown>)['nextCursor'];
  if (typeof cursor !== 'string') {
    return null;
  }
  const trimmed = cursor.trim();
  return trimmed || null;
}

function parseProduct(body: unknown): Product | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const direct = toProduct(record as ProductApiRecord);
  if (direct) {
    return direct;
  }
  for (const key of ['product', 'data', 'item']) {
    const nested = record[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const product = toProduct(nested as ProductApiRecord);
      if (product) {
        return product;
      }
    }
  }
  return null;
}

function readImages(row: ProductApiRecord): string[] {
  const fromList = (row.images ?? [])
    .filter((item): item is string => typeof item === 'string' && !!item.trim())
    .map((item) => item.trim());
  if (fromList.length) {
    return fromList;
  }
  const single = String(row.imageUrl ?? '').trim();
  return single ? [single] : [];
}

export function displayImage(url: string): string {
  const raw = url.trim();
  if (!raw) {
    return '';
  }
  return raw.startsWith('/') ? `${API_BASE_URL}${raw}` : raw;
}

function readOptionalPiastres(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function readCombinations(value: unknown): ProductCombination[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const combinations: ProductCombination[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as Record<string, unknown>;
    const rawMapping = row['sku_mapping'] ?? row['skuMapping'];
    if (!rawMapping || typeof rawMapping !== 'object' || Array.isArray(rawMapping)) {
      continue;
    }
    const skuMapping: Record<string, string> = {};
    for (const [key, mapped] of Object.entries(rawMapping as Record<string, unknown>)) {
      const variantKey = String(key).trim();
      const optionValue = String(mapped ?? '').trim();
      if (variantKey && optionValue) {
        skuMapping[variantKey] = optionValue;
      }
    }
    if (!Object.keys(skuMapping).length) {
      continue;
    }
    const priceRaw = row['price'] ?? row['pricePiastres'] ?? row['price_piastres'];
    const pricePiastres = Number(priceRaw);
    const availableRaw = row['is_available'] ?? row['isAvailable'];
    const stockRaw = row['stockQuantity'] ?? row['stock_quantity'];
    const stockQuantity = Number(stockRaw);
    combinations.push({
      skuMapping,
      pricePiastres: Number.isFinite(pricePiastres) ? pricePiastres : 0,
      isAvailable: availableRaw !== false,
      stockQuantity: Number.isFinite(stockQuantity) ? stockQuantity : null,
    });
  }
  return combinations;
}

function readVariants(value: unknown): ProductVariant[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const variants: ProductVariant[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as Record<string, unknown>;
    const name = String(row['name'] ?? '').trim();
    const options: ProductOption[] = [];
    if (Array.isArray(row['options'])) {
      for (const option of row['options']) {
        if (!option || typeof option !== 'object') {
          continue;
        }
        const record = option as Record<string, unknown>;
        const label = String(record['label'] ?? '').trim();
        if (!label) {
          continue;
        }
        const delta = Number(record['priceDeltaPiastres']);
        const id = String(record['id'] ?? '').trim();
        options.push({
          ...(id ? { id } : {}),
          label,
          priceDeltaPiastres: Number.isFinite(delta) ? delta : 0,
        });
      }
    }
    if (!name || !options.length) {
      continue;
    }
    const id = String(row['id'] ?? '').trim();
    variants.push({ ...(id ? { id } : {}), name, options });
  }
  return variants;
}

function readCategoryIds(row: ProductApiRecord, fallbackSectionId: string | null): string[] {
  const fromList = readIdList(row.categoryIds ?? row.shopCategoryIds);
  if (fromList.length) {
    return fromList;
  }
  if (Array.isArray(row.categories)) {
    const fromCategories = row.categories
      .map((item) => (item && typeof item === 'object' ? String(item.id ?? '').trim() : ''))
      .filter(Boolean);
    if (fromCategories.length) {
      return fromCategories;
    }
  }
  const single = String(row.shopCategoryId ?? row.sectionId ?? fallbackSectionId ?? '').trim();
  return single ? [single] : [];
}

function readIdList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);
}

function readSpecifications(value: unknown): ProductSpecification[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const specs: ProductSpecification[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as Record<string, unknown>;
    const label = String(row['label'] ?? '').trim();
    const specValue = String(row['value'] ?? '').trim();
    if (label && specValue) {
      specs.push({ label, value: specValue });
    }
  }
  return specs;
}

function toProduct(row: ProductApiRecord): Product | null {
  const id = String(row.id ?? row.productId ?? '').trim();
  const name = String(row.name ?? '').trim();
  if (!id || !name) {
    return null;
  }
  const section = row.section && typeof row.section === 'object' ? row.section : null;
  const categoryIds = readCategoryIds(row, section?.id ?? null);
  const legacySectionId = String(row.shopCategoryId ?? row.sectionId ?? section?.id ?? '').trim();
  const pricePiastres = Number(row.pricePiastres);
  const piastres = Number.isFinite(pricePiastres) ? pricePiastres : 0;
  const images = readImages(row);
  return {
    id,
    vendorId: String(row.vendorId ?? '').trim(),
    sectionId: categoryIds[0] ?? legacySectionId,
    categoryIds,
    name,
    description: String(row.description ?? '').trim(),
    imageUrl: images[0] ? displayImage(images[0]) : '',
    images,
    isAvailable: row.isAvailable !== false,
    isNew: row.isNew === true,
    pricePiastres: piastres,
    oldPricePiastres: readOptionalPiastres(row.oldPricePiastres),
    price: piastresToEgp(piastres),
    sectionName: String(row.sectionName ?? section?.name ?? '').trim(),
    variants: readVariants(row.variants),
    combinations: readCombinations(row.combinations),
    specifications: readSpecifications(row.specifications),
  };
}
