import { Injectable, computed, inject, signal } from '@angular/core';
import {
  DRIVERS_DATA,
  CaptainProfile,
  CaptainRole,
  CaptainVehicleType,
  DriverAccountStatus,
} from '../../features/drivers-management/data/drivers.mock';
import { HubService } from './hub.service';

export type DriverFormData = Pick<
  CaptainProfile,
  'name' | 'phone' | 'role' | 'hubId' | 'hubName' | 'vehicleType'
> & {
  /** Set on create; omitted on update when the admin leaves the field blank. */
  password?: string;
};

@Injectable({ providedIn: 'root' })
export class DriverService {
  private readonly hubService = inject(HubService);
  private readonly driversSignal = signal<CaptainProfile[]>(
    structuredClone(DRIVERS_DATA),
  );

  /** Live list — list & details both read from here. */
  readonly drivers = this.driversSignal.asReadonly();

  readonly driverCount = computed(() => this.driversSignal().length);

  getById(id: string): CaptainProfile | null {
    return this.driversSignal().find((d) => d.id === id) ?? null;
  }

  /**
   * Create a new captain from form data.
   * Defaults: offline, active account, empty stats/history.
   * Collectors are stored without a vehicle.
   */
  addDriver(driverData: Partial<CaptainProfile> & { password?: string }): CaptainProfile {
    const hub = this.resolveHub(driverData.hubId, driverData.hubName);
    const role: CaptainRole = driverData.role ?? 'DELIVERY';
    const password = driverData.password?.trim();
    const next: CaptainProfile = {
      id: this.nextDriverId(),
      name: (driverData.name ?? '').trim(),
      phone: (driverData.phone ?? '').trim(),
      ...(password ? { password } : {}),
      role,
      hubId: hub.id,
      hubName: hub.name,
      availability: driverData.availability ?? 'offline',
      accountStatus: driverData.accountStatus ?? 'active',
      vehicleType: this.resolveVehicle(role, driverData.vehicleType),
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

  updateDriver(id: string, driverData: Partial<CaptainProfile>): void {
    this.driversSignal.update((list) =>
      list.map((driver) => {
        if (driver.id !== id) {
          return driver;
        }

        const patch = { ...driverData };
        const role = patch.role ?? driver.role;

        if (patch.hubId && !patch.hubName) {
          const hub = this.hubService.getById(patch.hubId);
          if (hub) {
            patch.hubName = hub.name;
          }
        }

        if (patch.role === 'COLLECTOR' || (role === 'COLLECTOR' && patch.vehicleType !== undefined)) {
          patch.vehicleType = '';
        }

        return { ...driver, ...patch, role };
      }),
    );
  }

  /**
   * Lock / unlock a captain account.
   * `isLocked: true` → inactive; `isLocked: false` → active.
   */
  toggleDriverLock(id: string, isLocked: boolean): void {
    const accountStatus: DriverAccountStatus = isLocked ? 'inactive' : 'active';
    this.updateDriver(id, { accountStatus });
  }

  private resolveHub(
    hubId?: string,
    hubName?: string,
  ): { id: string; name: string } {
    if (hubId) {
      const found = this.hubService.getById(hubId);
      if (found) {
        return { id: found.id, name: found.name };
      }
      return { id: hubId, name: hubName ?? hubId };
    }
    const active = this.hubService.activeHubs();
    if (active.length > 0) {
      return { id: active[0].id, name: active[0].name };
    }
    return { id: '', name: hubName ?? '' };
  }

  private resolveVehicle(
    role: CaptainRole,
    vehicleType?: CaptainVehicleType | '',
  ): CaptainVehicleType | '' {
    if (role === 'COLLECTOR') {
      return '';
    }
    return vehicleType || 'Motorcycle';
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
