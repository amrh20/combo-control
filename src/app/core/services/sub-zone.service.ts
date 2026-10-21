import { Injectable, computed, signal } from '@angular/core';
import { SubZone } from '../models/sub-zone.model';

/**
 * In-memory cache of sub-zones. `ZoneService` is the only writer;
 * screens keep reading `subZones`, `getById`, and `byParent`.
 */
@Injectable({ providedIn: 'root' })
export class SubZoneService {
  private readonly subZonesSignal = signal<SubZone[]>([]);

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

  replaceAll(items: readonly SubZone[]): void {
    this.subZonesSignal.set([...items]);
  }

  /** Replaces every sub-zone of one parent and leaves the rest of the cache in place. */
  mergeForParent(parentZoneId: string, items: readonly SubZone[]): void {
    this.subZonesSignal.update((list) => [
      ...list.filter((subZone) => subZone.parentZoneId !== parentZoneId),
      ...items,
    ]);
  }

  upsert(subZone: SubZone): void {
    this.upsertMany([subZone]);
  }

  upsertMany(items: readonly SubZone[]): void {
    this.subZonesSignal.update((list) => {
      const incoming = new Map(items.map((item) => [item.id, item]));
      const kept = list.filter((item) => !incoming.has(item.id));
      return [...kept, ...incoming.values()];
    });
  }

  removeById(id: string): void {
    this.subZonesSignal.update((list) => list.filter((subZone) => subZone.id !== id));
  }
}
