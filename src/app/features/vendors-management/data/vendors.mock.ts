export type VendorCategory =
  | 'restaurants'
  | 'cafes'
  | 'groceries'
  | 'pharmacy'
  | 'bakery'
  | 'electronics'
  | 'produce';

export type LiveStatus = 'open' | 'busy' | 'closed';
export type LiveStatusOverride = 'auto' | 'force_busy' | 'force_closed';
export type SystemStatus = 'active' | 'inactive';

export interface VendorStats {
  rating: number;
  totalReviews: number;
  totalCompletedOrders: number;
}

export interface VendorSettings {
  openingTime: string;
  closingTime: string;
  deliveryFee: number;
  minOrderValue: number;
  autoAccept: boolean;
}

export interface VendorProfile {
  id: string;
  name: string;
  phone: string;
  contactPerson: string;
  category: VendorCategory;
  zoneId: string;
  zoneName: string;
  logoUrl?: string;
  systemStatus: SystemStatus;
  liveStatusOverride: LiveStatusOverride;
  liveStatus: LiveStatus;
  /** Shown when closed outside hours — e.g. "17:00" */
  nextOpeningTime?: string;
  settings: VendorSettings;
  discountPercent: number;
  commissionRate: number;
  walletBalance: number;
  stats: VendorStats;
}

export const CATEGORY_CONFIG: Record<VendorCategory, { label: string; labelAr: string }> = {
  restaurants: { label: 'Restaurants',  labelAr: 'مطاعم'       },
  cafes:       { label: 'Cafés',        labelAr: 'مقاهي'       },
  groceries:   { label: 'Groceries',    labelAr: 'بقالة'       },
  pharmacy:    { label: 'Pharmacy',     labelAr: 'صيدليات'     },
  bakery:      { label: 'Bakery',       labelAr: 'مخابز'       },
  electronics: { label: 'Electronics',  labelAr: 'إلكترونيات'  },
  produce:     { label: 'Produce',      labelAr: 'فواكه'       },
};

export const LIVE_STATUS_CONFIG: Record<LiveStatus, { label: string; labelAr: string }> = {
  open:   { label: 'Open',   labelAr: 'مفتوح'          },
  busy:   { label: 'Busy',   labelAr: 'مشغول حالياً'  },
  closed: { label: 'Closed', labelAr: 'مغلق الآن'     },
};

export const SYSTEM_STATUS_CONFIG: Record<SystemStatus, { label: string; labelAr: string }> = {
  active:   { label: 'Active',   labelAr: 'نشط' },
  inactive: { label: 'Inactive', labelAr: 'غير نشط' },
};

export const LIVE_OVERRIDE_CONFIG: Record<
  LiveStatusOverride,
  { label: string; description: string }
> = {
  auto:         { label: 'تلقائي',        description: 'يتبع ساعات العمل' },
  force_busy:   { label: 'فرض مشغول',     description: 'إيقاف الطلبات مؤقتاً بسبب الضغط' },
  force_closed: { label: 'فرض مغلق',      description: 'إيقاف الطلبات لبقية اليوم' },
};

export const ZONE_OPTIONS = [
  { id: 'ZN-001', name: 'مجمع شطر ١٣'  },
  { id: 'ZN-002', name: 'حي الروضة'     },
  { id: 'ZN-004', name: 'مجمع الواحة'   },
  { id: 'ZN-005', name: 'حي الورود'     },
  { id: 'ZN-007', name: 'مجمع شطر ٥'   },
  { id: 'ZN-008', name: 'حي الياسمين'  },
];

const DEFAULT_SETTINGS: VendorSettings = {
  openingTime:   '09:00',
  closingTime:   '23:00',
  deliveryFee:   10,
  minOrderValue: 30,
  autoAccept:    false,
};

export const VENDORS_DATA: VendorProfile[] = [
  {
    id: 'SH-001', name: 'مطعم البيت', phone: '+966 50 123 4567', contactPerson: 'خالد المنصور',
    category: 'restaurants', zoneId: 'ZN-001', zoneName: 'مجمع شطر ١٣',
    systemStatus: 'active', liveStatusOverride: 'auto', liveStatus: 'open',
    settings: { openingTime: '11:00', closingTime: '23:30', deliveryFee: 10, minOrderValue: 50, autoAccept: true },
    discountPercent: 15, commissionRate: 12, walletBalance: 4250.75,
    stats: { rating: 4.7, totalReviews: 328, totalCompletedOrders: 1842 },
  },
  {
    id: 'SH-002', name: 'كافيه الصباح', phone: '+966 55 234 5678', contactPerson: 'نورة العتيبي',
    category: 'cafes', zoneId: 'ZN-002', zoneName: 'حي الروضة',
    systemStatus: 'active', liveStatusOverride: 'force_busy', liveStatus: 'busy',
    settings: { openingTime: '07:00', closingTime: '22:00', deliveryFee: 8, minOrderValue: 25, autoAccept: false },
    discountPercent: 0, commissionRate: 10, walletBalance: 1120.0,
    stats: { rating: 4.5, totalReviews: 156, totalCompletedOrders: 920 },
  },
  {
    id: 'SH-003', name: 'بقالة النور', phone: '+966 54 345 6789', contactPerson: 'فهد الشمري',
    category: 'groceries', zoneId: 'ZN-004', zoneName: 'مجمع الواحة',
    systemStatus: 'active', liveStatusOverride: 'auto', liveStatus: 'open',
    settings: { openingTime: '08:00', closingTime: '00:00', deliveryFee: 5, minOrderValue: 20, autoAccept: true },
    discountPercent: 10, commissionRate: 8, walletBalance: 8900.5,
    stats: { rating: 4.8, totalReviews: 512, totalCompletedOrders: 3210 },
  },
  {
    id: 'SH-004', name: 'صيدلية الرعاية', phone: '+966 56 456 7890', contactPerson: 'د. سارة الحربي',
    category: 'pharmacy', zoneId: 'ZN-008', zoneName: 'حي الياسمين',
    systemStatus: 'active', liveStatusOverride: 'auto', liveStatus: 'closed', nextOpeningTime: '08:00',
    settings: { ...DEFAULT_SETTINGS, openingTime: '08:00', closingTime: '23:00', deliveryFee: 15, minOrderValue: 40 },
    discountPercent: 0, commissionRate: 6, walletBalance: 320.0,
    stats: { rating: 4.6, totalReviews: 89, totalCompletedOrders: 445 },
  },
  {
    id: 'SH-005', name: 'مطعم لذة الشام', phone: '+966 50 567 8901', contactPerson: 'أحمد القحطاني',
    category: 'restaurants', zoneId: 'ZN-001', zoneName: 'مجمع شطر ١٣',
    systemStatus: 'active', liveStatusOverride: 'auto', liveStatus: 'open',
    settings: { openingTime: '12:00', closingTime: '01:00', deliveryFee: 12, minOrderValue: 60, autoAccept: true },
    discountPercent: 20, commissionRate: 12, walletBalance: 6775.25,
    stats: { rating: 4.9, totalReviews: 421, totalCompletedOrders: 2156 },
  },
  {
    id: 'SH-006', name: 'محل الفاكهة الطازجة', phone: '+966 53 678 9012', contactPerson: 'يوسف الزهراني',
    category: 'produce', zoneId: 'ZN-005', zoneName: 'حي الورود',
    systemStatus: 'active', liveStatusOverride: 'force_busy', liveStatus: 'busy',
    settings: { openingTime: '06:00', closingTime: '21:00', deliveryFee: 7, minOrderValue: 30, autoAccept: false },
    discountPercent: 5, commissionRate: 9, walletBalance: 2300.0,
    stats: { rating: 4.3, totalReviews: 67, totalCompletedOrders: 534 },
  },
  {
    id: 'SH-007', name: 'سوبرماركت الحارة', phone: '+966 55 789 0123', contactPerson: 'عبدالله الدوسري',
    category: 'groceries', zoneId: 'ZN-007', zoneName: 'مجمع شطر ٥',
    systemStatus: 'active', liveStatusOverride: 'auto', liveStatus: 'open',
    settings: { openingTime: '08:00', closingTime: '00:00', deliveryFee: 0, minOrderValue: 15, autoAccept: true },
    discountPercent: 0, commissionRate: 8, walletBalance: 12450.0,
    stats: { rating: 4.4, totalReviews: 890, totalCompletedOrders: 4521 },
  },
  {
    id: 'SH-008', name: 'مخبز زهرة الأصيل', phone: '+966 54 890 1234', contactPerson: 'ريم السعيد',
    category: 'bakery', zoneId: 'ZN-002', zoneName: 'حي الروضة',
    systemStatus: 'inactive', liveStatusOverride: 'auto', liveStatus: 'closed', nextOpeningTime: '05:00',
    settings: { openingTime: '05:00', closingTime: '14:00', deliveryFee: 6, minOrderValue: 20, autoAccept: false },
    discountPercent: 0, commissionRate: 7, walletBalance: 500.0,
    stats: { rating: 4.2, totalReviews: 34, totalCompletedOrders: 198 },
  },
  {
    id: 'SH-009', name: 'مطعم النخلة', phone: '+966 50 901 2345', contactPerson: 'محمد الغامدي',
    category: 'restaurants', zoneId: 'ZN-004', zoneName: 'مجمع الواحة',
    systemStatus: 'active', liveStatusOverride: 'auto', liveStatus: 'open',
    settings: { openingTime: '11:00', closingTime: '23:00', deliveryFee: 10, minOrderValue: 45, autoAccept: true },
    discountPercent: 12, commissionRate: 12, walletBalance: 3100.75,
    stats: { rating: 4.6, totalReviews: 245, totalCompletedOrders: 1287 },
  },
  {
    id: 'SH-010', name: 'متجر التقنية الحديثة', phone: '+966 56 012 3456', contactPerson: 'فيصل المطيري',
    category: 'electronics', zoneId: 'ZN-007', zoneName: 'مجمع شطر ٥',
    systemStatus: 'active', liveStatusOverride: 'force_closed', liveStatus: 'closed',
    settings: { openingTime: '10:00', closingTime: '22:00', deliveryFee: 20, minOrderValue: 100, autoAccept: false },
    discountPercent: 8, commissionRate: 15, walletBalance: 950.5,
    stats: { rating: 4.1, totalReviews: 112, totalCompletedOrders: 367 },
  },
  {
    id: 'SH-011', name: 'مقهى الورد', phone: '+966 55 123 9876', contactPerson: 'لينا الحسن',
    category: 'cafes', zoneId: 'ZN-008', zoneName: 'حي الياسمين',
    systemStatus: 'active', liveStatusOverride: 'auto', liveStatus: 'closed', nextOpeningTime: '16:00',
    settings: { openingTime: '16:00', closingTime: '01:00', deliveryFee: 8, minOrderValue: 30, autoAccept: true },
    discountPercent: 0, commissionRate: 10, walletBalance: 780.0,
    stats: { rating: 4.7, totalReviews: 203, totalCompletedOrders: 876 },
  },
  {
    id: 'SH-012', name: 'صيدلية الشفاء', phone: '+966 54 987 6543', contactPerson: 'د. هند العمري',
    category: 'pharmacy', zoneId: 'ZN-005', zoneName: 'حي الورود',
    systemStatus: 'inactive', liveStatusOverride: 'auto', liveStatus: 'closed',
    settings: { openingTime: '09:00', closingTime: '21:00', deliveryFee: 12, minOrderValue: 35, autoAccept: true },
    discountPercent: 0, commissionRate: 6, walletBalance: 145.0,
    stats: { rating: 3.9, totalReviews: 28, totalCompletedOrders: 156 },
  },
];

/** Shared in-memory store — list & details read/write the same reference. */
export let VENDORS_STATE: VendorProfile[] = structuredClone(VENDORS_DATA);

export function getVendorById(id: string): VendorProfile | undefined {
  return VENDORS_STATE.find(v => v.id === id);
}

export function updateVendor(id: string, patch: Partial<VendorProfile>): void {
  const idx = VENDORS_STATE.findIndex(v => v.id === id);
  if (idx < 0) return;
  VENDORS_STATE[idx] = { ...VENDORS_STATE[idx], ...patch };
}

export function syncVendorsFromState(): VendorProfile[] {
  return structuredClone(VENDORS_STATE);
}

export function getVendorInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return parts[0].charAt(0) + parts[1].charAt(0);
  }
  return name.charAt(0);
}

export function resolveLiveStatus(vendor: VendorProfile): LiveStatus {
  if (vendor.liveStatusOverride === 'force_busy') return 'busy';
  if (vendor.liveStatusOverride === 'force_closed') return 'closed';
  return vendor.liveStatus;
}

export function getEffectiveLiveStatus(vendor: VendorProfile): LiveStatus {
  return resolveLiveStatus(vendor);
}

export interface VendorFilters {
  search: string;
  category: VendorCategory | 'all';
  zoneId: string | 'all';
  liveStatus: LiveStatus | 'all';
}

export function matchesVendorSearch(vendor: VendorProfile, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const categoryLabel = CATEGORY_CONFIG[vendor.category].labelAr.toLowerCase();

  return (
    vendor.id.toLowerCase().includes(q) ||
    vendor.name.toLowerCase().includes(q) ||
    vendor.zoneName.toLowerCase().includes(q) ||
    vendor.contactPerson.toLowerCase().includes(q) ||
    vendor.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')) ||
    categoryLabel.includes(q)
  );
}

export function matchesVendorFilters(vendor: VendorProfile, filters: VendorFilters): boolean {
  if (!matchesVendorSearch(vendor, filters.search)) return false;
  if (filters.category !== 'all' && vendor.category !== filters.category) return false;
  if (filters.zoneId !== 'all' && vendor.zoneId !== filters.zoneId) return false;
  if (filters.liveStatus !== 'all' && getEffectiveLiveStatus(vendor) !== filters.liveStatus) return false;
  return true;
}

export function timeStringToDate(time: string): Date {
  const [h, m] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

export function dateToTimeString(date: Date | null): string {
  if (!date) return '09:00';
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}
