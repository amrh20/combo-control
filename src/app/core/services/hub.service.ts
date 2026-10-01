import { Injectable, computed, inject, signal } from '@angular/core';
import { Hub, HubInput } from '../models/hub.model';
import { rectanglePolygon } from '../models/zone.model';
import { SubZoneService } from './sub-zone.service';

const HUBS_SEED: Hub[] = [
  {
    id: 'HB-001',
    name: 'شارع ١٣',
    geometry: rectanglePolygon(31.2548, 29.9602, 31.2596, 29.9608),
    servingSubZoneIds: ['SZ-001'],
    isActive: true,
  },
  {
    id: 'HB-002',
    name: 'شارع ٩',
    geometry: rectanglePolygon(31.2472, 29.9579, 31.252, 29.9585),
    servingSubZoneIds: ['SZ-001', 'SZ-002'],
    isActive: true,
  },
  {
    id: 'HB-003',
    name: 'عباس العقاد',
    geometry: rectanglePolygon(31.3382, 30.052, 31.3394, 30.0608),
    servingSubZoneIds: ['SZ-003'],
    isActive: true,
  },
];

@Injectable({ providedIn: 'root' })
export class HubService {
  private readonly subZones = inject(SubZoneService);
  private readonly hubsSignal = signal<Hub[]>(structuredClone(HUBS_SEED));

  readonly hubs = this.hubsSignal.asReadonly();

  readonly activeHubs = computed(() =>
    this.hubsSignal().filter((hub) => hub.isActive),
  );

  getById(id: string): Hub | null {
    return this.hubsSignal().find((hub) => hub.id === id) ?? null;
  }

  nameOf(id: string): string {
    return this.getById(id)?.name ?? '';
  }

  /** Comma-separated Arabic names of the sub-zones this hub delivers to. */
  servingAreaNames(hub: Hub): string {
    const names = hub.servingSubZoneIds
      .map((id) => this.subZones.getById(id)?.name ?? '')
      .filter((name) => name.length > 0);
    return names.length > 0 ? names.join('، ') : '—';
  }

  add(data: HubInput): Hub {
    const next: Hub = {
      id: this.nextId(),
      name: data.name.trim(),
      geometry: structuredClone(data.geometry),
      servingSubZoneIds: [...data.servingSubZoneIds],
      isActive: data.isActive,
    };
    this.hubsSignal.update((list) => [...list, next]);
    return next;
  }

  update(id: string, patch: Partial<HubInput>): void {
    this.hubsSignal.update((list) =>
      list.map((hub) => {
        if (hub.id !== id) {
          return hub;
        }
        return {
          ...hub,
          ...patch,
          ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
          ...(patch.geometry !== undefined ? { geometry: structuredClone(patch.geometry) } : {}),
          ...(patch.servingSubZoneIds !== undefined
            ? { servingSubZoneIds: [...patch.servingSubZoneIds] }
            : {}),
        };
      }),
    );
  }

  private nextId(): string {
    const max = this.hubsSignal().reduce((acc, hub) => {
      const n = Number.parseInt(hub.id.replace(/\D/g, ''), 10);
      return Number.isFinite(n) ? Math.max(acc, n) : acc;
    }, 0);
    return `HB-${String(max + 1).padStart(3, '0')}`;
  }
}
