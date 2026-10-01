import { Injectable, computed, signal } from '@angular/core';
import { rectanglePolygon } from '../models/zone.model';
import { SubZone, SubZoneBatchItem, SubZoneInput } from '../models/sub-zone.model';

const SUB_ZONES_SEED: SubZone[] = [
  {
    id: 'SZ-001',
    parentZoneId: 'ZN-001',
    name: 'زهراء المعادي — الحي الأول',
    minOrder: 60,
    color: '#2563eb',
    isActive: true,
    geometry: rectanglePolygon(31.305, 29.952, 31.325, 29.972),
  },
  {
    id: 'SZ-002',
    parentZoneId: 'ZN-002',
    name: 'المعادي — دجلة',
    minOrder: 45,
    color: '#d97706',
    isActive: true,
    geometry: rectanglePolygon(31.24, 29.95, 31.265, 29.97),
  },
  {
    id: 'SZ-003',
    parentZoneId: 'ZN-003',
    name: 'مدينة نصر — الحي السابع',
    minOrder: 70,
    color: '#7c3aed',
    isActive: true,
    geometry: rectanglePolygon(31.33, 30.045, 31.355, 30.065),
  },
  {
    id: 'SZ-004',
    parentZoneId: 'ZN-003',
    name: 'مدينة نصر — مكرم عبيد',
    minOrder: 65,
    color: '#0891b2',
    isActive: false,
    geometry: rectanglePolygon(31.36, 30.065, 31.38, 30.085),
  },
];

@Injectable({ providedIn: 'root' })
export class SubZoneService {
  private readonly subZonesSignal = signal<SubZone[]>(structuredClone(SUB_ZONES_SEED));

  readonly subZones = this.subZonesSignal.asReadonly();

  readonly activeSubZones = computed(() =>
    this.subZonesSignal().filter((subZone) => subZone.isActive),
  );

  getById(id: string): SubZone | null {
    return this.subZonesSignal().find((subZone) => subZone.id === id) ?? null;
  }

  byParent(parentZoneId: string): SubZone[] {
    return this.subZonesSignal().filter((subZone) => subZone.parentZoneId === parentZoneId);
  }

  add(data: SubZoneInput): SubZone {
    const next: SubZone = { id: this.nextId(), ...this.sanitize(data) };
    this.subZonesSignal.update((list) => [...list, next]);
    return next;
  }

  /**
   * Creates one atomic batch under the selected parent zone.
   * The in-memory implementation mirrors a single backend batch request.
   */
  createMultipleSubZones(
    parentZoneId: string,
    subZones: readonly SubZoneBatchItem[],
  ): SubZone[] {
    const start = this.nextSequence();
    const created = subZones.map((subZone, index) => ({
      id: `SZ-${String(start + index).padStart(3, '0')}`,
      ...this.sanitize({ ...subZone, parentZoneId }),
    }));
    this.subZonesSignal.update((list) => [...list, ...created]);
    return created;
  }

  update(id: string, data: SubZoneInput): void {
    this.subZonesSignal.update((list) =>
      list.map((subZone) =>
        subZone.id === id ? { ...subZone, ...this.sanitize(data) } : subZone,
      ),
    );
  }

  remove(id: string): void {
    this.subZonesSignal.update((list) => list.filter((subZone) => subZone.id !== id));
  }

  private sanitize(data: SubZoneInput): SubZoneInput {
    return {
      parentZoneId: data.parentZoneId,
      name: data.name.trim(),
      minOrder: data.minOrder,
      color: data.color.toLowerCase(),
      isActive: data.isActive,
      geometry: structuredClone(data.geometry),
    };
  }

  private nextId(): string {
    return `SZ-${String(this.nextSequence()).padStart(3, '0')}`;
  }

  private nextSequence(): number {
    const max = this.subZonesSignal().reduce((acc, subZone) => {
      const n = Number.parseInt(subZone.id.replace(/\D/g, ''), 10);
      return Number.isFinite(n) ? Math.max(acc, n) : acc;
    }, 0);
    return max + 1;
  }
}
