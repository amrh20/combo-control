import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import { ApiErrorBody } from '../models/auth.model';
import { Hub } from '../models/hub.model';
import {
  CreateVendorCategoryPayload,
  UpdateVendorCategoryPayload,
  CreateVendorPayload,
  UpdateVendorPayload,
  VendorApiLiveStatus,
  VendorApiRecord,
  VendorCategoryApiRecord,
  VendorDiscountBadge,
  VendorListFilters,
  VendorListItem,
  VendorListPage,
  VendorLiveStatusOverride,
  basisPointsToPercent,
  percentToBasisPoints,
  isVendorLiveStatus,
} from '../models/vendor.model';
import { egpToPiastres, piastresToEgp } from '../models/zone.model';
import {
  LiveStatusOverride,
  VendorProfile,
  VENDORS_DATA,
} from '../../features/vendors-management/data/vendors.mock';
import { HubService } from './hub.service';
import { VendorCategory, VendorCategoryService } from './vendor-category.service';

export type VendorInput = Omit<VendorProfile, 'id' | 'hubName'>;

const CATEGORIES_URL = `${API_BASE_URL}/v1/vendor-categories`;
const VENDORS_URL = `${API_BASE_URL}/v1/vendors`;

type CategoryListResponse =
  | VendorCategoryApiRecord[]
  | { items?: VendorCategoryApiRecord[] };

interface VendorListCategory {
  name?: string | null;
  backgroundColor?: string | null;
  icon?: string | null;
  iconUrl?: string | null;
}

interface VendorListApiRecord {
  id?: string | null;
  name?: string | null;
  categoryName?: string | null;
  category?: VendorListCategory | null;
  backgroundColor?: string | null;
  icon?: string | null;
  hubName?: string | null;
  liveStatus?: string | null;
  nextOpenAt?: string | null;
  isActive?: boolean | null;
  logoUrl?: string | null;
}

/** Profile returned by `GET` / `PATCH /v1/vendors/{id}`, plus list fields when the response includes them. */
export interface VendorUpdateResult extends VendorProfile {
  reportedLiveStatus: VendorApiLiveStatus | null;
  reportedNextOpenAt: string | null | undefined;
}

interface VendorListApiPage {
  items?: VendorListApiRecord[] | null;
  nextCursor?: string | null;
}

@Injectable({ providedIn: 'root' })
export class VendorService {
  private readonly http = inject(HttpClient);
  private readonly hubs = inject(HubService);
  private readonly categoryStore = inject(VendorCategoryService);
  private readonly vendorsSignal = signal<VendorProfile[]>(structuredClone(VENDORS_DATA));
  /** Bumps when a category is created so an older list response cannot wipe it. */
  private categoryFetchId = 0;

  readonly vendors = this.vendorsSignal.asReadonly();

  /** `GET /v1/hubs`. Hubs include the polygon used to bound a vendor pin. */
  getHubs(): Observable<Hub[]> {
    return this.hubs.getHubs();
  }

  /** `GET /v1/vendor-categories` */
  getCategories(): Observable<VendorCategory[]> {
    const fetchId = ++this.categoryFetchId;
    return this.http.get<CategoryListResponse>(CATEGORIES_URL).pipe(
      map((body) => unwrapCategories(body).map(toCategory)),
      tap((categories) => {
        if (fetchId === this.categoryFetchId) {
          this.categoryStore.replaceAll(categories);
        }
      }),
    );
  }

  /** `POST /v1/vendor-categories` */
  createCategory(payload: CreateVendorCategoryPayload): Observable<VendorCategory> {
    return this.http.post<VendorCategoryApiRecord>(CATEGORIES_URL, payload).pipe(
      map(toCategory),
      tap((category) => {
        this.categoryFetchId += 1;
        this.categoryStore.upsert(category);
      }),
    );
  }

  /** `PATCH /v1/vendor-categories/{id}` with `{ name, backgroundColor, icon }`. */
  updateCategory(id: string, payload: UpdateVendorCategoryPayload): Observable<VendorCategory> {
    return this.http.patch<VendorCategoryApiRecord | null>(`${CATEGORIES_URL}/${id}`, payload).pipe(
      map((record) =>
        mergeUpdatedCategory(id, payload, record, this.categoryStore.getById(id)),
      ),
      tap((category) => {
        this.categoryFetchId += 1;
        this.categoryStore.upsert(category);
      }),
    );
  }

  /** `PATCH /v1/vendor-categories/{id}` with `{ isActive }`. */
  updateCategoryStatus(id: string, isActive: boolean): Observable<VendorCategory> {
    return this.http
      .patch<VendorCategoryApiRecord | null>(`${CATEGORIES_URL}/${id}`, { isActive })
      .pipe(
        map((record) =>
          mergeCategoryStatus(id, isActive, record, this.categoryStore.getById(id)),
        ),
        tap((category) => {
          this.categoryFetchId += 1;
          this.categoryStore.upsert(category);
        }),
      );
  }

  /**
   * `GET /v1/vendors`.
   * Query params: `categoryId`, `hubId`, `liveStatus` (`OPEN` | `BUSY` | `CLOSED`), `search`, `cursor`, `limit`.
   */
  getVendors(filters: VendorListFilters = {}): Observable<VendorListPage> {
    let params = new HttpParams().set('limit', String(filters.limit ?? 20));
    const categoryId = filters.categoryId?.trim() ?? '';
    const hubId = filters.hubId?.trim() ?? '';
    const search = filters.search?.trim() ?? '';
    const cursor = filters.cursor?.trim() ?? '';
    if (categoryId) {
      params = params.set('categoryId', categoryId);
    }
    if (hubId) {
      params = params.set('hubId', hubId);
    }
    if (filters.liveStatus && isVendorLiveStatus(filters.liveStatus)) {
      params = params.set('liveStatus', filters.liveStatus);
    }
    if (search.length >= 2) {
      params = params.set('search', search);
    }
    if (cursor) {
      params = params.set('cursor', cursor);
    }

    return this.http
      .get<VendorListApiPage>(VENDORS_URL, { params })
      .pipe(map(toVendorListPage));
  }

  /** `GET /v1/vendors/{id}` */
  getVendorById(id: string): Observable<VendorProfile> {
    return this.http.get<VendorApiRecord>(`${VENDORS_URL}/${id}`).pipe(
      map((record) => this.toProfile(id, record, {})),
      tap((vendor) => this.upsertVendor(vendor)),
    );
  }

  /** `PATCH /v1/vendors/{id}` */
  updateVendor(id: string, payload: UpdateVendorPayload): Observable<VendorUpdateResult> {
    return this.http.patch<VendorApiRecord>(`${VENDORS_URL}/${id}`, payload).pipe(
      map((record) => {
        const vendor = this.toProfile(id, record, payload);
        const result: VendorUpdateResult = {
          ...vendor,
          reportedLiveStatus: isVendorLiveStatus(record.liveStatus) ? record.liveStatus : null,
          reportedNextOpenAt:
            record.nextOpenAt === undefined ? undefined : record.nextOpenAt?.trim() || null,
        };
        return result;
      }),
      tap((vendor) => {
        if (vendor.name.trim()) {
          this.upsertVendor(vendor);
        }
      }),
    );
  }

  /** `PATCH /v1/vendors/{id}` with `{ isActive }`. */
  updateVendorStatus(id: string, isActive: boolean): Observable<VendorListItem> {
    return this.http
      .patch<VendorListApiRecord>(`${VENDORS_URL}/${id}`, { isActive })
      .pipe(map(toVendorListItem));
  }

  /** `POST /v1/vendors` */
  createVendor(payload: CreateVendorPayload): Observable<VendorProfile> {
    return this.http.post<VendorApiRecord>(VENDORS_URL, payload).pipe(
      map((record) => toVendorProfile(record, payload, this.hubs.nameOf(payload.hubId))),
      tap((vendor) => this.upsertVendor(vendor)),
    );
  }

  getById(id: string): VendorProfile | null {
    return this.vendorsSignal().find((vendor) => vendor.id === id) ?? null;
  }

  add(data: VendorInput): VendorProfile {
    const next: VendorProfile = {
      ...data,
      id: this.nextId(),
      hubName: this.hubs.nameOf(data.hubId) || data.hubId,
    };
    this.vendorsSignal.update((list) => [...list, next]);
    return next;
  }

  update(id: string, patch: Partial<VendorProfile>): void {
    this.vendorsSignal.update((list) =>
      list.map((vendor) => {
        if (vendor.id !== id) {
          return vendor;
        }
        const next: VendorProfile = { ...vendor, ...patch };
        if (patch.hubId) {
          next.hubName = this.hubs.nameOf(patch.hubId) || next.hubName;
        }
        return next;
      }),
    );
  }

  private toProfile(id: string, record: VendorApiRecord, payload: UpdateVendorPayload): VendorProfile {
    const existing = this.getById(record.id || id);
    const base = existing ? profileToPayload(existing) : recordToPayload(record);
    const merged: CreateVendorPayload = {
      ...base,
      ...definedPayload(payload),
      hours: payload.hours ?? base.hours,
      location: payload.location ?? base.location,
    };
    return toVendorProfile(
      { ...record, id: record.id || id },
      merged,
      record.hubName?.trim() || this.hubs.nameOf(merged.hubId),
      existing,
    );
  }

  private upsertVendor(vendor: VendorProfile): void {
    this.vendorsSignal.update((list) => {
      const index = list.findIndex((item) => item.id === vendor.id);
      if (index === -1) {
        return [...list, vendor];
      }
      return list.map((item) => (item.id === vendor.id ? vendor : item));
    });
  }

  private nextId(): string {
    const max = this.vendorsSignal().reduce((acc, vendor) => {
      const n = Number.parseInt(vendor.id.replace(/\D/g, ''), 10);
      return Number.isFinite(n) ? Math.max(acc, n) : acc;
    }, 0);
    return `SH-${String(max + 1).padStart(3, '0')}`;
  }
}

export function vendorErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }

  const body = error.error as ApiErrorBody | null;
  const message = body?.error?.message?.trim() ?? '';
  if (/[\u0600-\u06FF]/.test(message)) {
    return message;
  }

  if (error.status === 400) {
    return 'البيانات غير مقبولة. راجع الحقول وحاول مرة أخرى.';
  }

  return fallback;
}

export function toApiLiveStatusOverride(value: LiveStatusOverride): VendorLiveStatusOverride {
  switch (value) {
    case 'force_busy':
      return 'FORCE_BUSY';
    case 'force_closed':
      return 'FORCE_CLOSED';
    default:
      return 'AUTO';
  }
}

export function toMockLiveStatusOverride(value: VendorLiveStatusOverride): LiveStatusOverride {
  switch (value) {
    case 'FORCE_BUSY':
      return 'force_busy';
    case 'FORCE_CLOSED':
      return 'force_closed';
    default:
      return 'auto';
  }
}

function toVendorListPage(body: VendorListApiPage | null): VendorListPage {
  return {
    items: (body?.items ?? []).map(toVendorListItem),
    nextCursor:
      body?.nextCursor == null || body.nextCursor === '' ? null : String(body.nextCursor),
  };
}

function toVendorListItem(row: VendorListApiRecord): VendorListItem {
  const category = row.category ?? null;
  return {
    id: row.id?.trim() ?? '',
    name: row.name?.trim() ?? '',
    categoryName: row.categoryName?.trim() || category?.name?.trim() || '',
    backgroundColor: row.backgroundColor?.trim() || category?.backgroundColor?.trim() || null,
    icon: (row.icon || category?.icon || category?.iconUrl || '').trim() || null,
    hubName: row.hubName?.trim() ?? '',
    liveStatus: isVendorLiveStatus(row.liveStatus) ? row.liveStatus : 'CLOSED',
    nextOpenAt: row.nextOpenAt?.trim() || null,
    isActive: row.isActive === true,
    logoUrl: row.logoUrl?.trim() || null,
  };
}

function definedPayload(payload: UpdateVendorPayload): UpdateVendorPayload {
  return Object.fromEntries(
    Object.entries(payload).filter((entry) => entry[1] !== undefined),
  ) as UpdateVendorPayload;
}

function recordToPayload(record: VendorApiRecord): CreateVendorPayload {
  const hours = record.hours?.length
    ? record.hours
    : [{ weekday: 0, opens: '09:00', closes: '23:00' }];
  return {
    name: record.name ?? '',
    phone: record.phone ?? '',
    contactPerson: record.contactPerson ?? '',
    categoryId: record.categoryId ?? '',
    hubId: record.hubId ?? '',
    location: record.location ?? { lat: 0, lng: 0 },
    logoUrl: record.logoUrl ?? '',
    isActive: record.isActive ?? true,
    liveStatusOverride: record.liveStatusOverride ?? 'AUTO',
    autoAccept: record.autoAccept ?? false,
    minOrderPiastres: record.minOrderPiastres ?? 0,
    discountBp: record.discountBp ?? 0,
    commissionBp: record.commissionBp ?? 0,
    hours,
  };
}

function profileToPayload(vendor: VendorProfile): CreateVendorPayload {
  const opens = vendor.settings.openingTime || '09:00';
  const closes = vendor.settings.closingTime || '23:00';
  return {
    name: vendor.name,
    phone: vendor.phone,
    contactPerson: vendor.contactPerson,
    categoryId: vendor.category,
    hubId: vendor.hubId,
    location: vendor.location,
    logoUrl: vendor.logoUrl ?? '',
    isActive: vendor.systemStatus === 'active',
    liveStatusOverride: toApiLiveStatusOverride(vendor.liveStatusOverride),
    autoAccept: vendor.settings.autoAccept,
    minOrderPiastres: egpToPiastres(vendor.minOrder),
    discountBp: percentToBasisPoints(vendor.discountPercent),
    commissionBp: vendor.commissionBp ?? percentToBasisPoints(vendor.commissionRate),
    hours: Array.from({ length: 7 }, (_, weekday) => ({ weekday, opens, closes })),
  };
}

function unwrapCategories(body: CategoryListResponse): VendorCategoryApiRecord[] {
  return Array.isArray(body) ? body : (body.items ?? []);
}

function mergeCategoryStatus(
  id: string,
  isActive: boolean,
  record: VendorCategoryApiRecord | null,
  existing: VendorCategory | null,
): VendorCategory {
  const current: VendorCategory = existing ?? {
    id,
    name: record?.name ?? '',
    iconUrl: (record?.icon || record?.iconUrl || '').trim(),
    backgroundColor: record?.backgroundColor ?? '',
    isActive,
    sortOrder: record?.sortOrder ?? 0,
  };

  if (!record?.id && !record?.name) {
    return { ...current, isActive: record?.isActive ?? isActive };
  }

  return {
    ...current,
    id: record?.id || id,
    name: record?.name || current.name,
    iconUrl: (record?.icon || record?.iconUrl || current.iconUrl).trim(),
    backgroundColor: record?.backgroundColor || current.backgroundColor,
    isActive: record?.isActive ?? isActive,
    sortOrder: record?.sortOrder ?? current.sortOrder,
  };
}

function mergeUpdatedCategory(
  id: string,
  payload: UpdateVendorCategoryPayload,
  record: VendorCategoryApiRecord | null,
  existing: VendorCategory | null,
): VendorCategory {
  const current: VendorCategory = existing ?? {
    id,
    name: payload.name,
    iconUrl: payload.icon,
    backgroundColor: payload.backgroundColor,
    isActive: true,
    sortOrder: 0,
  };

  return {
    ...current,
    id: record?.id || id,
    name: record?.name || payload.name,
    iconUrl: (record?.icon || record?.iconUrl || payload.icon || current.iconUrl).trim(),
    backgroundColor: record?.backgroundColor || payload.backgroundColor,
    isActive: record?.isActive ?? current.isActive,
    sortOrder: record?.sortOrder ?? current.sortOrder,
  };
}

function toCategory(row: VendorCategoryApiRecord): VendorCategory {
  return {
    id: row.id,
    name: row.name,
    iconUrl: (row.icon || row.iconUrl || '').trim(),
    backgroundColor: row.backgroundColor,
    isActive: row.isActive,
    sortOrder: row.sortOrder ?? 0,
  };
}

function toVendorProfile(
  record: VendorApiRecord,
  payload: CreateVendorPayload,
  hubName: string,
  existing?: VendorProfile | null,
): VendorProfile {
  const hours = record.hours?.length ? record.hours : payload.hours;
  const opens = hours[0]?.opens ?? '09:00';
  const closes = hours[0]?.closes ?? '23:00';
  const override = record.liveStatusOverride ?? payload.liveStatusOverride;
  const minOrderPiastres = record.minOrderPiastres ?? payload.minOrderPiastres;
  const discountBp = record.discountBp ?? payload.discountBp;
  const commissionBp = record.commissionBp ?? existing?.commissionBp ?? payload.commissionBp;
  const logoUrl = record.logoUrl ?? payload.logoUrl;
  const ratingsScore =
    record.ratingsScore !== undefined ? readRatingScore(record.ratingsScore) : (existing?.ratingsScore ?? null);
  const ratingsCount = readCount(record.ratingsCount, existing?.ratingsCount ?? 0);
  const completedOrders = readCount(record.completedOrders, existing?.completedOrders ?? 0);
  const walletBalance = readCount(record.walletBalance, existing?.walletBalance ?? 0);
  const discountBadge =
    record.discountBadge !== undefined
      ? readDiscountBadge(record.discountBadge)
      : (existing?.discountBadge ?? null);

  return {
    id: record.id || `SH-${Date.now()}`,
    name: record.name ?? payload.name,
    phone: record.phone ?? payload.phone,
    contactPerson: record.contactPerson ?? payload.contactPerson,
    category: record.categoryId ?? payload.categoryId,
    hubId: record.hubId ?? payload.hubId,
    hubName: hubName || record.hubId || payload.hubId,
    location: record.location ?? payload.location,
    ...(logoUrl ? { logoUrl } : {}),
    systemStatus: (record.isActive ?? payload.isActive) ? 'active' : 'inactive',
    liveStatusOverride: toMockLiveStatusOverride(override),
    liveStatus: 'closed',
    settings: {
      openingTime: opens,
      closingTime: closes,
      autoAccept: record.autoAccept ?? payload.autoAccept,
    },
    minOrder: piastresToEgp(minOrderPiastres),
    discountPercent: basisPointsToPercent(discountBp),
    commissionRate: basisPointsToPercent(commissionBp),
    commissionBp,
    walletBalance,
    ratingsScore,
    ratingsCount,
    completedOrders,
    discountBadge,
    stats: {
      rating: ratingsScore ?? 0,
      totalReviews: ratingsCount,
      totalCompletedOrders: completedOrders,
    },
  };
}

function readCount(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readRatingScore(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function readDiscountBadge(value: VendorDiscountBadge | null): VendorDiscountBadge | null {
  if (!value) {
    return null;
  }
  const label = value.label?.trim() ?? '';
  const discountBp = value.discountBp;
  if (!label || typeof discountBp !== 'number' || !Number.isFinite(discountBp)) {
    return null;
  }
  return { discountBp, label };
}
