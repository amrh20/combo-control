/**
 * Canonical Order mocks for Ops Board + Order Details.
 *
 * Seed list powers the Live Orders left rail.
 * Legacy `features/orders-management/data/orders.mock.ts` remains deprecated.
 */

import {
  CanonicalOrder,
  CanonicalOrderStatus,
} from '../models/canonical-order.model';

export const CANONICAL_ORDER_MOCK: CanonicalOrder = {
  id: 'ord_8f3c2a91',
  orderNumber: 'CMB-2026-09142',
  status: 'READY_AT_HUB',
  zoneId: 'ZN-CAI-13',
  zoneName: 'مدينة نصر — الحي السابع',
  notes: 'Customer requested contactless handoff at building gate.',

  customer: {
    customerId: 'cust_4b21de',
    name: 'سارة محمود',
    phone: '+20 100 555 2187',
    address: {
      label: 'Home',
      street: 'شارع عباس العقاد',
      building: '12',
      floor: '4',
      apartment: '12B',
      landmark: 'بجانب صيدلية العزبي',
      area: 'الحي السابع',
      city: 'مدينة نصر',
      governorate: 'القاهرة',
      notes: 'Leave with security if no answer after 2 min.',
      location: { lat: 30.0626, lng: 31.3497 },
    },
  },

  hub: {
    hubId: 'hub_nasr_01',
    name: 'Nasr City Hub 01',
    nameAr: 'هاب مدينة نصر ١',
    location: { lat: 30.0569, lng: 31.3302 },
    zoneId: 'ZN-CAI-13',
    zoneName: 'مدينة نصر — الحي السابع',
  },

  subOrders: [
    {
      id: 'sub_a1',
      shopId: 'shop_bait',
      shopName: 'Al-Bait Restaurant',
      shopNameAr: 'مطعم البيت',
      status: 'VERIFIED',
      location: { lat: 30.0591, lng: 31.3410 },
      itemsSubtotal: 285,
      acceptedAt: '2026-09-28T17:42:10.000Z',
      arrivedAtHubAt: '2026-09-28T18:05:22.000Z',
      verifiedAt: '2026-09-28T18:08:01.000Z',
      notes: 'No onions on both mains.',
      items: [
        {
          id: 'li_a1',
          sku: 'BAIT-CHK-01',
          name: 'Grilled Chicken Plate',
          nameAr: 'وجبة دجاج مشوي',
          unitPrice: 145,
          quantity: 1,
          lineTotal: 145,
          modifiers: ['No onions', 'Extra tahini'],
        },
        {
          id: 'li_a2',
          sku: 'BAIT-KB-02',
          name: 'Kofta Sandwich',
          nameAr: 'ساندويتش كفتة',
          unitPrice: 70,
          quantity: 2,
          lineTotal: 140,
          notes: 'Cut in half',
        },
      ],
    },
    {
      id: 'sub_b1',
      shopId: 'shop_sabah',
      shopName: 'Morning Cafe',
      shopNameAr: 'كافيه الصباح',
      status: 'VERIFIED',
      location: { lat: 30.0615, lng: 31.3388 },
      itemsSubtotal: 165,
      acceptedAt: '2026-09-28T17:43:05.000Z',
      arrivedAtHubAt: '2026-09-28T18:11:40.000Z',
      verifiedAt: '2026-09-28T18:13:18.000Z',
      items: [
        {
          id: 'li_b1',
          sku: 'SAB-LAT-01',
          name: 'Iced Latte',
          nameAr: 'لاتيه مثلج',
          unitPrice: 55,
          quantity: 2,
          lineTotal: 110,
          modifiers: ['Oat milk'],
        },
        {
          id: 'li_b2',
          sku: 'SAB-CH-03',
          name: 'Chocolate Croissant',
          nameAr: 'كرواسون شوكولاتة',
          unitPrice: 55,
          quantity: 1,
          lineTotal: 55,
        },
      ],
    },
  ],

  financials: {
    currency: 'EGP',
    itemsSubtotal: 450,
    deliveryFee: 35,
    tax: 0,
    discount: 25,
    customerGrandTotal: 460,
    platformCommission: 67.5,
    vendorPayable: 382.5,
    driverEarnings: 28,
    finalCashToCollect: 460,
    paymentMethod: 'COD',
  },

  dispatch: {
    assignedDriverId: null,
    assignedDriverName: null,
    offerStatus: 'NONE',
    offeredAt: null,
    acceptedAt: null,
    pickedUpAt: null,
    offerExpiresAt: null,
  },

  timestamps: {
    placedAt: '2026-09-28T17:40:02.000Z',
    consolidatingAt: '2026-09-28T17:42:10.000Z',
    readyAtHubAt: '2026-09-28T18:13:18.000Z',
    updatedAt: '2026-09-28T18:13:18.000Z',
  },
};

/** Second seed — still consolidating (one shop preparing, one at hub). */
export const CANONICAL_ORDER_MOCK_CONSOLIDATING: CanonicalOrder = {
  id: 'ord_9a4d3b02',
  orderNumber: 'CMB-2026-09143',
  status: 'CONSOLIDATING',
  zoneId: 'ZN-CAI-13',
  zoneName: 'مدينة نصر — الحي السابع',
  notes: 'Customer prefers evening delivery window.',

  customer: {
    customerId: 'cust_7e88af',
    name: 'أحمد حسني',
    phone: '+20 122 441 9033',
    address: {
      label: 'Office',
      street: 'شارع مصطفى النحاس',
      building: '45',
      floor: '8',
      apartment: '801',
      landmark: 'فوق بنك CIB',
      area: 'الحي السادس',
      city: 'مدينة نصر',
      governorate: 'القاهرة',
      notes: 'Call on arrival — security desk.',
      location: { lat: 30.0681, lng: 31.3452 },
    },
  },

  hub: {
    hubId: 'hub_nasr_01',
    name: 'Nasr City Hub 01',
    nameAr: 'هاب مدينة نصر ١',
    location: { lat: 30.0569, lng: 31.3302 },
    zoneId: 'ZN-CAI-13',
    zoneName: 'مدينة نصر — الحي السابع',
  },

  subOrders: [
    {
      id: 'sub_c1',
      shopId: 'shop_bait',
      shopName: 'Al-Bait Restaurant',
      shopNameAr: 'مطعم البيت',
      status: 'AT_HUB',
      location: { lat: 30.0591, lng: 31.3410 },
      itemsSubtotal: 190,
      acceptedAt: '2026-09-28T18:20:10.000Z',
      arrivedAtHubAt: '2026-09-28T18:41:00.000Z',
      items: [
        {
          id: 'li_c1',
          sku: 'BAIT-MIX-04',
          name: 'Mixed Grill for Two',
          nameAr: 'مشاوي مشكلة لشخصين',
          unitPrice: 190,
          quantity: 1,
          lineTotal: 190,
        },
      ],
    },
    {
      id: 'sub_d1',
      shopId: 'shop_ward',
      shopName: 'Ward Juice Bar',
      shopNameAr: 'عصير الورد',
      status: 'PREPARING',
      location: { lat: 30.0602, lng: 31.3361 },
      itemsSubtotal: 90,
      acceptedAt: '2026-09-28T18:21:40.000Z',
      items: [
        {
          id: 'li_d1',
          sku: 'WRD-MNG-01',
          name: 'Fresh Mango Juice',
          nameAr: 'عصير مانجو طازج',
          unitPrice: 45,
          quantity: 2,
          lineTotal: 90,
        },
      ],
    },
  ],

  financials: {
    currency: 'EGP',
    itemsSubtotal: 280,
    deliveryFee: 30,
    tax: 0,
    discount: 0,
    customerGrandTotal: 310,
    platformCommission: 42,
    vendorPayable: 238,
    driverEarnings: 25,
    finalCashToCollect: 310,
    paymentMethod: 'COD',
  },

  dispatch: {
    assignedDriverId: null,
    assignedDriverName: null,
    offerStatus: 'NONE',
    offeredAt: null,
    acceptedAt: null,
    pickedUpAt: null,
    offerExpiresAt: null,
  },

  timestamps: {
    placedAt: '2026-09-28T18:18:44.000Z',
    consolidatingAt: '2026-09-28T18:20:10.000Z',
    updatedAt: '2026-09-28T18:41:00.000Z',
  },
};

/** Live board seed — active hub-pipeline orders. */
export const CANONICAL_ORDERS_SEED: CanonicalOrder[] = [
  CANONICAL_ORDER_MOCK,
  CANONICAL_ORDER_MOCK_CONSOLIDATING,
];

/** Statuses shown on the Live Ops board (pre-delivery pipeline). */
export const ACTIVE_CANONICAL_STATUSES: CanonicalOrderStatus[] = [
  'PLACED',
  'CONSOLIDATING',
  'READY_AT_HUB',
  'ASSIGNED',
];

export function getCanonicalOrderById(id: string): CanonicalOrder | null {
  return (
    CANONICAL_ORDERS_SEED.find(
      (order) => order.id === id || order.orderNumber === id,
    ) ?? null
  );
}

export function matchesCanonicalOrderSearch(
  order: CanonicalOrder,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }

  const haystack = [
    order.id,
    order.orderNumber,
    order.customer.name,
    order.customer.phone,
    order.zoneName ?? '',
    ...order.subOrders.map((s) => s.shopName),
    ...order.subOrders.map((s) => s.shopNameAr ?? ''),
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(q);
}

export function formatCanonicalOrderAge(iso: string, now = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) {
    return '—';
  }

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) {
    return 'الآن';
  }
  if (minutes < 60) {
    return `منذ ${minutes} د`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `منذ ${hours} س`;
  }

  const days = Math.floor(hours / 24);
  return `منذ ${days} ي`;
}
