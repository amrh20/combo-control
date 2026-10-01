import { Injectable, inject, signal } from '@angular/core';
import {
  VENDORS_DATA,
  VendorProfile,
} from '../../features/vendors-management/data/vendors.mock';
import { HubService } from './hub.service';

export type VendorInput = Omit<VendorProfile, 'id' | 'hubName'>;

@Injectable({ providedIn: 'root' })
export class VendorService {
  private readonly hubs = inject(HubService);
  private readonly vendorsSignal = signal<VendorProfile[]>(structuredClone(VENDORS_DATA));

  readonly vendors = this.vendorsSignal.asReadonly();

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

  private nextId(): string {
    const max = this.vendorsSignal().reduce((acc, vendor) => {
      const n = Number.parseInt(vendor.id.replace(/\D/g, ''), 10);
      return Number.isFinite(n) ? Math.max(acc, n) : acc;
    }, 0);
    return `SH-${String(max + 1).padStart(3, '0')}`;
  }
}
