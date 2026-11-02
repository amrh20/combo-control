import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface WizardCustomer {
  phone: string;
  name: string;
  customerId: string;
}

export interface WizardLocation {
  parentZoneId: string | null;
  subZoneId: string | null;
  addressDetails: string;
  hubId: string | null;
}

export interface WizardCartLine {
  id: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  optionIds: string[];
  optionSummary: string;
  unitPricePiastres: number;
}

export interface WizardShopCart {
  vendorId: string;
  vendorName: string;
  items: WizardCartLine[];
}

export interface WizardDraft {
  customer: WizardCustomer;
  location: WizardLocation;
  activeVendorId: string | null;
  cartByShopId: Record<string, WizardShopCart>;
}

export function emptyWizardDraft(): WizardDraft {
  return {
    customer: { phone: '', name: '', customerId: '' },
    location: {
      parentZoneId: null,
      subZoneId: null,
      addressDetails: '',
      hubId: null,
    },
    activeVendorId: null,
    cartByShopId: {},
  };
}

@Injectable()
export class OpsOrderWizardService {
  private readonly draftSubject = new BehaviorSubject<WizardDraft>(emptyWizardDraft());

  readonly draft$ = this.draftSubject.asObservable();

  snapshot(): WizardDraft {
    return this.draftSubject.value;
  }

  patchCustomer(customer: Partial<WizardCustomer>): void {
    const current = this.snapshot();
    this.draftSubject.next({
      ...current,
      customer: { ...current.customer, ...customer },
    });
  }

  patchLocation(location: Partial<WizardLocation>): void {
    const current = this.snapshot();
    const nextLocation = { ...current.location, ...location };
    const hubChanged = nextLocation.hubId !== current.location.hubId;
    this.draftSubject.next({
      ...current,
      location: nextLocation,
      activeVendorId: hubChanged ? null : current.activeVendorId,
      cartByShopId: hubChanged ? {} : current.cartByShopId,
    });
  }

  setActiveVendor(vendorId: string | null): void {
    const current = this.snapshot();
    if (current.activeVendorId === vendorId) {
      return;
    }
    this.draftSubject.next({ ...current, activeVendorId: vendorId });
  }

  addLine(shop: { vendorId: string; vendorName: string }, line: Omit<WizardCartLine, 'id'>): void {
    const current = this.snapshot();
    const existing = current.cartByShopId[shop.vendorId] ?? {
      vendorId: shop.vendorId,
      vendorName: shop.vendorName,
      items: [],
    };
    const signature = lineSignature(line.productId, line.optionIds);
    const match = existing.items.find((item) => lineSignature(item.productId, item.optionIds) === signature);
    const items = match
      ? existing.items.map((item) =>
          item.id === match.id ? { ...item, quantity: item.quantity + line.quantity } : item,
        )
      : [...existing.items, { ...line, id: crypto.randomUUID() }];
    this.draftSubject.next({
      ...current,
      cartByShopId: {
        ...current.cartByShopId,
        [shop.vendorId]: { ...existing, vendorName: shop.vendorName, items },
      },
    });
  }

  removeLine(vendorId: string, lineId: string): void {
    const current = this.snapshot();
    const group = current.cartByShopId[vendorId];
    if (!group) {
      return;
    }
    const items = group.items.filter((item) => item.id !== lineId);
    const cartByShopId = { ...current.cartByShopId };
    if (items.length === 0) {
      delete cartByShopId[vendorId];
    } else {
      cartByShopId[vendorId] = { ...group, items };
    }
    this.draftSubject.next({ ...current, cartByShopId });
  }

  reset(): void {
    this.draftSubject.next(emptyWizardDraft());
  }
}

function lineSignature(productId: string, optionIds: string[]): string {
  return `${productId}:${[...optionIds].sort().join(',')}`;
}
