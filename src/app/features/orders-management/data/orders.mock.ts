export const ORDER_CURRENCY = 'ج.م';

export type OrderStatus = 'new' | 'reviewing' | 'ready' | 'dispatched';

export type DriverStatus = 'available' | 'busy';

export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  outOfStock: boolean;
}

export interface OrderShopGroup {
  shopId: string;
  shopName: string;
  items: OrderItem[];
}

export interface OrderCustomer {
  name: string;
  phone: string;
  address: string;
}

export interface LiveOrder {
  id: string;
  status: OrderStatus;
  zoneId: string;
  zoneName: string;
  customer: OrderCustomer;
  shopGroups: OrderShopGroup[];
  deliveryFee: number;
  createdAt: Date;
  assignedDriverId: string | null;
  callCenterNotes?: string;
}

export interface Driver {
  id: string;
  name: string;
  zoneId: string;
  status: DriverStatus;
  phone: string;
}

export const ORDER_STATUS_CONFIG: Record<OrderStatus, { label: string; listLabel: string }> = {
  new:         { label: 'New',       listLabel: 'New'       },
  reviewing:   { label: 'Reviewing', listLabel: 'Reviewing' },
  ready:       { label: 'Ready',     listLabel: 'Ready'     },
  dispatched:  { label: 'Dispatched', listLabel: 'Dispatched' },
};

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = ['new', 'reviewing', 'ready'];

export const DRIVERS_DATA: Driver[] = [
  { id: 'DR-001', name: 'محمد العتيبي',  zoneId: 'ZN-001', status: 'available', phone: '+966 55 123 4567' },
  { id: 'DR-002', name: 'أحمد الشهري',   zoneId: 'ZN-001', status: 'busy',      phone: '+966 55 234 5678' },
  { id: 'DR-003', name: 'خالد الدوسري',  zoneId: 'ZN-001', status: 'available', phone: '+966 55 345 6789' },
  { id: 'DR-004', name: 'سعد القحطاني',  zoneId: 'ZN-002', status: 'available', phone: '+966 55 456 7890' },
  { id: 'DR-005', name: 'فيصل المطيري', zoneId: 'ZN-002', status: 'busy',      phone: '+966 55 567 8901' },
  { id: 'DR-006', name: 'عبدالله الحربي', zoneId: 'ZN-004', status: 'available', phone: '+966 55 678 9012' },
  { id: 'DR-007', name: 'ناصر الزهراني', zoneId: 'ZN-004', status: 'busy',      phone: '+966 55 789 0123' },
  { id: 'DR-008', name: 'يوسف الغامدي',  zoneId: 'ZN-007', status: 'available', phone: '+966 55 890 1234' },
  { id: 'DR-009', name: 'راشد العمري',   zoneId: 'ZN-008', status: 'available', phone: '+966 55 901 2345' },
];

export const ORDERS_DATA: LiveOrder[] = [
  {
    id: 'ORD-1042',
    status: 'new',
    zoneId: 'ZN-001',
    zoneName: 'مجمع شطر ١٣',
    customer: {
      name: 'فهد العنزي',
      phone: '+966 50 112 3344',
      address: 'مجمع شطر ١٣، شارع الملك فهد، مبنى ٧، شقة ٣٠٢',
    },
    shopGroups: [
      {
        shopId: 'SH-001',
        shopName: 'مطعم البيت',
        items: [
          { id: 'IT-001', name: 'وجبة كبسة دجاج', price: 45, quantity: 2, outOfStock: false },
          { id: 'IT-002', name: 'سلطة فتوش',       price: 18, quantity: 1, outOfStock: false },
        ],
      },
      {
        shopId: 'SH-005',
        shopName: 'مطعم لذة الشام',
        items: [
          { id: 'IT-003', name: 'شاورما مشكل', price: 32, quantity: 1, outOfStock: false },
          { id: 'IT-004', name: 'حمص باللحمة', price: 28, quantity: 1, outOfStock: false },
        ],
      },
    ],
    deliveryFee: 10,
    createdAt: new Date(Date.now() - 4 * 60_000),
    assignedDriverId: null,
    callCenterNotes: 'Customer requested contactless delivery.',
  },
  {
    id: 'ORD-1041',
    status: 'reviewing',
    zoneId: 'ZN-001',
    zoneName: 'مجمع شطر ١٣',
    customer: {
      name: 'نورة السبيعي',
      phone: '+966 55 223 4455',
      address: 'حي النزهة، شارع الأمير سلطان، فيلا ١٢',
    },
    shopGroups: [
      {
        shopId: 'SH-001',
        shopName: 'مطعم البيت',
        items: [
          { id: 'IT-005', name: 'مندي لحم', price: 85, quantity: 1, outOfStock: false },
        ],
      },
    ],
    deliveryFee: 10,
    createdAt: new Date(Date.now() - 12 * 60_000),
    assignedDriverId: null,
  },
  {
    id: 'ORD-1040',
    status: 'ready',
    zoneId: 'ZN-001',
    zoneName: 'مجمع شطر ١٣',
    customer: {
      name: 'عبدالرحمن المطيري',
      phone: '+966 54 334 5566',
      address: 'مجمع شطر ١٣، برج الندى، الطابق ٥',
    },
    shopGroups: [
      {
        shopId: 'SH-005',
        shopName: 'مطعم لذة الشام',
        items: [
          { id: 'IT-006', name: 'منسف أردني', price: 95, quantity: 1, outOfStock: false },
          { id: 'IT-007', name: 'عصير ليمون بالنعناع', price: 12, quantity: 2, outOfStock: false },
        ],
      },
    ],
    deliveryFee: 12,
    createdAt: new Date(Date.now() - 22 * 60_000),
    assignedDriverId: null,
  },
  {
    id: 'ORD-1039',
    status: 'new',
    zoneId: 'ZN-002',
    zoneName: 'حي الروضة',
    customer: {
      name: 'ريم الحربي',
      phone: '+966 56 445 6677',
      address: 'حي الروضة، شارع التحلية، عمارة ٣، شقة ١٠١',
    },
    shopGroups: [
      {
        shopId: 'SH-002',
        shopName: 'كافيه الصباح',
        items: [
          { id: 'IT-008', name: 'لاتيه كراميل', price: 22, quantity: 2, outOfStock: false },
          { id: 'IT-009', name: 'كروissant',    price: 14, quantity: 3, outOfStock: false },
        ],
      },
      {
        shopId: 'SH-008',
        shopName: 'مخبز زهرة الأصيل',
        items: [
          { id: 'IT-010', name: 'خبز تميس', price: 8, quantity: 6, outOfStock: false },
        ],
      },
    ],
    deliveryFee: 8,
    createdAt: new Date(Date.now() - 7 * 60_000),
    assignedDriverId: null,
  },
  {
    id: 'ORD-1038',
    status: 'reviewing',
    zoneId: 'ZN-004',
    zoneName: 'مجمع الواحة',
    customer: {
      name: 'سلman الغامدي',
      phone: '+966 53 556 7788',
      address: 'مجمع الواحة، بوابة ٢، شارع العليا',
    },
    shopGroups: [
      {
        shopId: 'SH-003',
        shopName: 'بقالة النور',
        items: [
          { id: 'IT-011', name: 'حليب كامل الدسم ٢ لتر', price: 12, quantity: 2, outOfStock: false },
          { id: 'IT-012', name: 'بيض طازج (١٢)',         price: 18, quantity: 1, outOfStock: false },
          { id: 'IT-013', name: 'خبز توست',              price: 7,  quantity: 2, outOfStock: false },
        ],
      },
      {
        shopId: 'SH-009',
        shopName: 'مطعم النخلة',
        items: [
          { id: 'IT-014', name: 'بiryani دجاج', price: 55, quantity: 1, outOfStock: false },
        ],
      },
    ],
    deliveryFee: 10,
    createdAt: new Date(Date.now() - 18 * 60_000),
    assignedDriverId: null,
    callCenterNotes: 'Verify egg availability with بقالة النور.',
  },
  {
    id: 'ORD-1037',
    status: 'ready',
    zoneId: 'ZN-004',
    zoneName: 'مجمع الواحة',
    customer: {
      name: 'هند العتيبي',
      phone: '+966 50 667 8899',
      address: 'حي السليمانية، شارع الأمير محمد بن عبدالرحمن',
    },
    shopGroups: [
      {
        shopId: 'SH-009',
        shopName: 'مطعم النخلة',
        items: [
          { id: 'IT-015', name: 'مشاوي مشكل', price: 120, quantity: 1, outOfStock: false },
        ],
      },
    ],
    deliveryFee: 10,
    createdAt: new Date(Date.now() - 35 * 60_000),
    assignedDriverId: null,
  },
  {
    id: 'ORD-1036',
    status: 'new',
    zoneId: 'ZN-007',
    zoneName: 'مجمع شطر ٥',
    customer: {
      name: 'تركي الشمري',
      phone: '+966 54 778 9900',
      address: 'مجمع شطر ٥، حي المعيزيلة، شارع الدائري الشرقي',
    },
    shopGroups: [
      {
        shopId: 'SH-007',
        shopName: 'سوبرماركت الحارة',
        items: [
          { id: 'IT-016', name: 'مياه معدنية (٢٤)', price: 15, quantity: 1, outOfStock: false },
          { id: 'IT-017', name: 'شيبس Lays',        price: 9,  quantity: 3, outOfStock: false },
        ],
      },
      {
        shopId: 'SH-010',
        shopName: 'متجر التقنية الحديثة',
        items: [
          { id: 'IT-018', name: 'كابل USB-C', price: 45, quantity: 1, outOfStock: false },
        ],
      },
    ],
    deliveryFee: 0,
    createdAt: new Date(Date.now() - 2 * 60_000),
    assignedDriverId: null,
  },
];

export function getDriversForZone(zoneId: string): Driver[] {
  return DRIVERS_DATA.filter(d => d.zoneId === zoneId);
}

export function calcOrderSubtotal(order: LiveOrder): number {
  return order.shopGroups
    .flatMap(g => g.items)
    .filter(i => !i.outOfStock)
    .reduce((sum, i) => sum + i.price * i.quantity, 0);
}

export function calcOrderTotal(order: LiveOrder): number {
  return calcOrderSubtotal(order) + order.deliveryFee;
}

export function formatOrderAge(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (mins < 1) return 'Just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} mins ago`;
  const hrs = Math.floor(mins / 60);
  return hrs === 1 ? '1 hr ago' : `${hrs} hrs ago`;
}

function normalizePhone(value: string): string {
  return value.replace(/[\s\-()+]/g, '').toLowerCase();
}

export function matchesOrderSearch(order: LiveOrder, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const qPhone = normalizePhone(q);
  const customerPhone = normalizePhone(order.customer.phone);

  return (
    order.id.toLowerCase().includes(q) ||
    order.customer.name.toLowerCase().includes(q) ||
    customerPhone.includes(qPhone)
  );
}
