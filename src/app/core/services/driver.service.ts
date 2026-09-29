import { Injectable, computed, signal } from '@angular/core';
import {
  DRIVERS_DATA,
  DriverAccountStatus,
  DriverProfile,
  ZONE_OPTIONS,
} from '../../features/drivers-management/data/drivers.mock';

export type DriverFormData = Pick<
  DriverProfile,
  'name' | 'phone' | 'zoneId' | 'zoneName' | 'vehicleType'
>;

@Injectable({ providedIn: 'root' })
export class DriverService {
  private readonly driversSignal = signal<DriverProfile[]>(
    structuredClone(DRIVERS_DATA),
  );

  /** Live list — list & details both read from here. */
  readonly drivers = this.driversSignal.asReadonly();

  readonly driverCount = computed(() => this.driversSignal().length);

  getById(id: string): DriverProfile | null {
    return this.driversSignal().find((d) => d.id === id) ?? null;
  }

  /**
   * Create a new driver from form data.
   * Defaults: available, active account, empty stats/history.
   */
  addDriver(driverData: Partial<DriverProfile>): DriverProfile {
    const zone = this.resolveZone(driverData.zoneId, driverData.zoneName);
    const next: DriverProfile = {
      id: this.nextDriverId(),
      name: (driverData.name ?? '').trim(),
      phone: (driverData.phone ?? '').trim(),
      zoneId: zone.id,
      zoneName: zone.name,
      availability: driverData.availability ?? 'offline',
      accountStatus: driverData.accountStatus ?? 'active',
      vehicleType: driverData.vehicleType ?? 'Motorcycle',
      licenseExpiry: driverData.licenseExpiry ?? this.defaultLicenseExpiry(),
      stats: driverData.stats ?? {
        totalCompletedOrders: 0,
        totalCashCollected: 0,
        acceptanceRate: 100,
        customerRating: 5,
        avgDeliveryTimeMins: 0,
      },
      deliveredOrders: driverData.deliveredOrders ?? [],
      complaints: driverData.complaints ?? [],
    };

    this.driversSignal.update((list) => [next, ...list]);
    return next;
  }

  updateDriver(id: string, driverData: Partial<DriverProfile>): void {
    this.driversSignal.update((list) =>
      list.map((driver) => {
        if (driver.id !== id) {
          return driver;
        }

        const patch = { ...driverData };
        if (patch.zoneId && !patch.zoneName) {
          const zone = ZONE_OPTIONS.find((z) => z.id === patch.zoneId);
          if (zone) {
            patch.zoneName = zone.name;
          }
        }

        return { ...driver, ...patch };
      }),
    );
  }

  /**
   * Lock / unlock a driver account.
   * `isLocked: true` → inactive; `isLocked: false` → active.
   */
  toggleDriverLock(id: string, isLocked: boolean): void {
    const accountStatus: DriverAccountStatus = isLocked ? 'inactive' : 'active';
    this.updateDriver(id, { accountStatus });
  }

  private resolveZone(
    zoneId?: string,
    zoneName?: string,
  ): { id: string; name: string } {
    if (zoneId) {
      const found = ZONE_OPTIONS.find((z) => z.id === zoneId);
      if (found) {
        return found;
      }
      return { id: zoneId, name: zoneName ?? zoneId };
    }
    if (zoneName) {
      const found = ZONE_OPTIONS.find((z) => z.name === zoneName);
      if (found) {
        return found;
      }
    }
    return ZONE_OPTIONS[0];
  }

  private nextDriverId(): string {
    const max = this.driversSignal().reduce((acc, d) => {
      const n = Number.parseInt(d.id.replace(/\D/g, ''), 10);
      return Number.isFinite(n) ? Math.max(acc, n) : acc;
    }, 0);
    return `DR-${String(max + 1).padStart(3, '0')}`;
  }

  private defaultLicenseExpiry(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  }
}
