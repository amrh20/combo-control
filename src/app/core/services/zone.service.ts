import { Injectable, computed, signal } from '@angular/core';
import { rectanglePolygon, Zone, ZoneWritePayload } from '../models/zone.model';

const ZONES_SEED: Zone[] = [
  {
    id: 'ZN-001',
    name: 'زهراء المعادي',
    polygon: rectanglePolygon(31.3, 29.948, 31.348, 29.978),
    minOrder: 50,
    isActive: true,
  },
  {
    id: 'ZN-002',
    name: 'المعادي',
    polygon: rectanglePolygon(31.23, 29.945, 31.29, 29.98),
    minOrder: 40,
    isActive: true,
  },
  {
    id: 'ZN-003',
    name: 'مدينة نصر',
    polygon: rectanglePolygon(31.32, 30.04, 31.385, 30.09),
    minOrder: 60,
    isActive: true,
  },
  {
    id: 'ZN-004',
    name: 'مصر الجديدة',
    polygon: rectanglePolygon(31.3, 30.085, 31.36, 30.13),
    minOrder: 45,
    isActive: false,
  },
];

@Injectable({ providedIn: 'root' })
export class ZoneService {
  private readonly zonesSignal = signal<Zone[]>(structuredClone(ZONES_SEED));

  readonly zones = this.zonesSignal.asReadonly();

  readonly activeZones = computed(() =>
    this.zonesSignal().filter((zone) => zone.isActive),
  );

  getById(id: string): Zone | null {
    return this.zonesSignal().find((zone) => zone.id === id) ?? null;
  }

  nameOf(id: string): string {
    return this.getById(id)?.name ?? '';
  }

  add(data: ZoneWritePayload): Zone {
    const next: Zone = {
      id: this.nextId(),
      name: data.name.trim(),
      polygon: data.geometry,
      minOrder: data.minOrder,
      isActive: data.isActive,
    };
    this.zonesSignal.update((list) => [...list, next]);
    return next;
  }

  update(id: string, data: ZoneWritePayload): void {
    this.zonesSignal.update((list) =>
      list.map((zone) => {
        if (zone.id !== id) {
          return zone;
        }
        return {
          ...zone,
          name: data.name.trim(),
          polygon: data.geometry,
          minOrder: data.minOrder,
          isActive: data.isActive,
        };
      }),
    );
  }

  private nextId(): string {
    const max = this.zonesSignal().reduce((acc, zone) => {
      const n = Number.parseInt(zone.id.replace(/\D/g, ''), 10);
      return Number.isFinite(n) ? Math.max(acc, n) : acc;
    }, 0);
    return `ZN-${String(max + 1).padStart(3, '0')}`;
  }
}
