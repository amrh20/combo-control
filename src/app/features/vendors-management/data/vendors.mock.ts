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
  autoAccept: boolean;
}

/** WGS84 storefront pin. Must fall inside the assigned hub polygon. */
export interface VendorLocation {
  lat: number;
  lng: number;
}

export interface VendorProfile {
  id: string;
  name: string;
  phone: string;
  contactPerson: string;
  /** Id from VendorCategoryService (e.g. VC-001). */
  category: string;
  /** Hub this shop is physically assigned to. */
  hubId: string;
  hubName: string;
  /** Storefront coordinate inside `hubId`'s polygon. */
  location: VendorLocation;
  logoUrl?: string;
  systemStatus: SystemStatus;
  liveStatusOverride: LiveStatusOverride;
  liveStatus: LiveStatus;
  /** Shown when closed outside hours — e.g. "17:00" */
  nextOpeningTime?: string;
  settings: VendorSettings;
  /** Cart value floor. Delivery price is calculated separately. */
  minOrder: number;
  discountPercent: number;
  commissionRate: number;
  walletBalance: number;
  stats: VendorStats;
}

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

const DEFAULT_SETTINGS: VendorSettings = {
  openingTime: '09:00',
  closingTime: '23:00',
  autoAccept:  false,
};

export const VENDORS_DATA: VendorProfile[] = [
  {
    id: 'SH-013', name: 'سوق الأمل', phone: '+20 10 1234 5678', contactPerson: 'أمل حسن',
    category: 'VC-001', hubId: 'HB-001', hubName: 'شارع ١٣',
    location: { lat: 29.9605, lng: 31.2556 },
    systemStatus: 'active', liveStatusOverride: 'auto', liveStatus: 'open',
    minOrder: 40,
    settings: { openingTime: '08:00', closingTime: '23:00', autoAccept: true },
    discountPercent: 0, commissionRate: 8, walletBalance: 1540.0,
    stats: { rating: 4.6, totalReviews: 210, totalCompletedOrders: 980 },
  },
  {
    id: 'SH-001', name: 'مطعم البيت', phone: '+966 50 123 4567', contactPerson: 'خالد المنصور',
    category: 'VC-006', hubId: 'HB-001', hubName: 'شارع ١٣',
    location: { lat: 29.9605, lng: 31.2566 },
    systemStatus: 'active', liveStatusOverride: 'auto', liveStatus: 'open',
    minOrder: 50,
    settings: { openingTime: '11:00', closingTime: '23:30', autoAccept: true },
    discountPercent: 15, commissionRate: 12, walletBalance: 4250.75,
    stats: { rating: 4.7, totalReviews: 328, totalCompletedOrders: 1842 },
  },
  {
    id: 'SH-002', name: 'كافيه الصباح', phone: '+966 55 234 5678', contactPerson: 'نورة العتيبي',
    category: 'VC-007', hubId: 'HB-002', hubName: 'شارع ٩',
    location: { lat: 29.9582, lng: 31.2476 },
    systemStatus: 'active', liveStatusOverride: 'force_busy', liveStatus: 'busy',
    minOrder: 25,
    settings: { openingTime: '07:00', closingTime: '22:00', autoAccept: false },
    discountPercent: 0, commissionRate: 10, walletBalance: 1120.0,
    stats: { rating: 4.5, totalReviews: 156, totalCompletedOrders: 920 },
  },
  {
    id: 'SH-003', name: 'بقالة النور', phone: '+966 54 345 6789', contactPerson: 'فهد الشمري',
    category: 'VC-001', hubId: 'HB-003', hubName: 'عباس العقاد',
    location: { lat: 30.054, lng: 31.3388 },
    systemStatus: 'active', liveStatusOverride: 'auto', liveStatus: 'open',
    minOrder: 20,
    settings: { openingTime: '08:00', closingTime: '00:00', autoAccept: true },
    discountPercent: 10, commissionRate: 8, walletBalance: 8900.5,
    stats: { rating: 4.8, totalReviews: 512, totalCompletedOrders: 3210 },
  },
  {
    id: 'SH-004', name: 'صيدلية الرعاية', phone: '+966 56 456 7890', contactPerson: 'د. سارة الحربي',
    category: 'VC-005', hubId: 'HB-003', hubName: 'عباس العقاد',
    location: { lat: 30.056, lng: 31.3388 },
    systemStatus: 'active', liveStatusOverride: 'auto', liveStatus: 'closed', nextOpeningTime: '08:00',
    minOrder: 40,
    settings: { ...DEFAULT_SETTINGS, openingTime: '08:00', closingTime: '23:00' },
    discountPercent: 0, commissionRate: 6, walletBalance: 320.0,
    stats: { rating: 4.6, totalReviews: 89, totalCompletedOrders: 445 },
  },
  {
    id: 'SH-005', name: 'مطعم لذة الشام', phone: '+966 50 567 8901', contactPerson: 'أحمد القحطاني',
    category: 'VC-006', hubId: 'HB-001', hubName: 'شارع ١٣',
    location: { lat: 29.9605, lng: 31.2576 },
    systemStatus: 'active', liveStatusOverride: 'auto', liveStatus: 'open',
    minOrder: 60,
    settings: { openingTime: '12:00', closingTime: '01:00', autoAccept: true },
    discountPercent: 20, commissionRate: 12, walletBalance: 6775.25,
    stats: { rating: 4.9, totalReviews: 421, totalCompletedOrders: 2156 },
  },
  {
    id: 'SH-006', name: 'محل الفاكهة الطازجة', phone: '+966 53 678 9012', contactPerson: 'يوسف الزهراني',
    category: 'VC-002', hubId: 'HB-002', hubName: 'شارع ٩',
    location: { lat: 29.9582, lng: 31.2484 },
    systemStatus: 'active', liveStatusOverride: 'force_busy', liveStatus: 'busy',
    minOrder: 30,
    settings: { openingTime: '06:00', closingTime: '21:00', autoAccept: false },
    discountPercent: 5, commissionRate: 9, walletBalance: 2300.0,
    stats: { rating: 4.3, totalReviews: 67, totalCompletedOrders: 534 },
  },
  {
    id: 'SH-007', name: 'سوبرماركت الحارة', phone: '+966 55 789 0123', contactPerson: 'عبدالله الدوسري',
    category: 'VC-001', hubId: 'HB-002', hubName: 'شارع ٩',
    location: { lat: 29.9582, lng: 31.2492 },
    systemStatus: 'active', liveStatusOverride: 'auto', liveStatus: 'open',
    minOrder: 15,
    settings: { openingTime: '08:00', closingTime: '00:00', autoAccept: true },
    discountPercent: 0, commissionRate: 8, walletBalance: 12450.0,
    stats: { rating: 4.4, totalReviews: 890, totalCompletedOrders: 4521 },
  },
  {
    id: 'SH-008', name: 'مخبز زهرة الأصيل', phone: '+966 54 890 1234', contactPerson: 'ريم السعيد',
    category: 'VC-003', hubId: 'HB-002', hubName: 'شارع ٩',
    location: { lat: 29.9582, lng: 31.25 },
    systemStatus: 'inactive', liveStatusOverride: 'auto', liveStatus: 'closed', nextOpeningTime: '05:00',
    minOrder: 20,
    settings: { openingTime: '05:00', closingTime: '14:00', autoAccept: false },
    discountPercent: 0, commissionRate: 7, walletBalance: 500.0,
    stats: { rating: 4.2, totalReviews: 34, totalCompletedOrders: 198 },
  },
  {
    id: 'SH-009', name: 'مطعم النخلة', phone: '+966 50 901 2345', contactPerson: 'محمد الغامدي',
    category: 'VC-006', hubId: 'HB-003', hubName: 'عباس العقاد',
    location: { lat: 30.058, lng: 31.3388 },
    systemStatus: 'active', liveStatusOverride: 'auto', liveStatus: 'open',
    minOrder: 45,
    settings: { openingTime: '11:00', closingTime: '23:00', autoAccept: true },
    discountPercent: 12, commissionRate: 12, walletBalance: 3100.75,
    stats: { rating: 4.6, totalReviews: 245, totalCompletedOrders: 1287 },
  },
  {
    id: 'SH-010', name: 'متجر التقنية الحديثة', phone: '+966 56 012 3456', contactPerson: 'فيصل المطيري',
    category: 'VC-008', hubId: 'HB-003', hubName: 'عباس العقاد',
    location: { lat: 30.06, lng: 31.3388 },
    systemStatus: 'active', liveStatusOverride: 'force_closed', liveStatus: 'closed',
    minOrder: 100,
    settings: { openingTime: '10:00', closingTime: '22:00', autoAccept: false },
    discountPercent: 8, commissionRate: 15, walletBalance: 950.5,
    stats: { rating: 4.1, totalReviews: 112, totalCompletedOrders: 367 },
  },
  {
    id: 'SH-011', name: 'مقهى الورد', phone: '+966 55 123 9876', contactPerson: 'لينا الحسن',
    category: 'VC-007', hubId: 'HB-001', hubName: 'شارع ١٣',
    location: { lat: 29.9605, lng: 31.2586 },
    systemStatus: 'active', liveStatusOverride: 'auto', liveStatus: 'closed', nextOpeningTime: '16:00',
    minOrder: 30,
    settings: { openingTime: '16:00', closingTime: '01:00', autoAccept: true },
    discountPercent: 0, commissionRate: 10, walletBalance: 780.0,
    stats: { rating: 4.7, totalReviews: 203, totalCompletedOrders: 876 },
  },
  {
    id: 'SH-012', name: 'صيدلية الشفاء', phone: '+966 54 987 6543', contactPerson: 'د. هند العمري',
    category: 'VC-005', hubId: 'HB-002', hubName: 'شارع ٩',
    location: { lat: 29.9582, lng: 31.2508 },
    systemStatus: 'inactive', liveStatusOverride: 'auto', liveStatus: 'closed',
    minOrder: 35,
    settings: { openingTime: '09:00', closingTime: '21:00', autoAccept: true },
    discountPercent: 0, commissionRate: 6, walletBalance: 145.0,
    stats: { rating: 3.9, totalReviews: 28, totalCompletedOrders: 156 },
  },
];

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
  category: string | 'all';
  hubId: string | 'all';
  liveStatus: LiveStatus | 'all';
}

export function matchesVendorSearch(
  vendor: VendorProfile,
  query: string,
  categoryName = '',
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  return (
    vendor.id.toLowerCase().includes(q) ||
    vendor.name.toLowerCase().includes(q) ||
    vendor.hubName.toLowerCase().includes(q) ||
    vendor.contactPerson.toLowerCase().includes(q) ||
    vendor.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')) ||
    categoryName.toLowerCase().includes(q)
  );
}

export function matchesVendorFilters(
  vendor: VendorProfile,
  filters: VendorFilters,
  categoryName = '',
): boolean {
  if (!matchesVendorSearch(vendor, filters.search, categoryName)) return false;
  if (filters.category !== 'all' && vendor.category !== filters.category) return false;
  if (filters.hubId !== 'all' && vendor.hubId !== filters.hubId) return false;
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
