export const DRIVER_CURRENCY = 'ج.م';

export type DriverAvailability = 'available' | 'busy' | 'offline';
export type DriverAccountStatus = 'active' | 'inactive';
export type ComplaintSeverity = 'low' | 'medium' | 'high';
export type ComplaintResolution = 'pending' | 'resolved';

export interface DriverStats {
  totalCompletedOrders: number;
  totalCashCollected: number;
  acceptanceRate: number;
  customerRating: number;
  avgDeliveryTimeMins: number;
}

export interface DriverDeliveredOrder {
  id: string;
  date: string;
  zoneName: string;
  deliveryFeeEarned: number;
  status: 'delivered';
}

export interface DriverComplaint {
  id: string;
  date: string;
  orderId: string;
  severity: ComplaintSeverity;
  description: string;
  resolution: ComplaintResolution;
}

export interface DriverProfile {
  id: string;
  name: string;
  phone: string;
  zoneId: string;
  zoneName: string;
  availability: DriverAvailability;
  accountStatus: DriverAccountStatus;
  vehicleType: string;
  licenseExpiry: string;
  stats: DriverStats;
  deliveredOrders: DriverDeliveredOrder[];
  complaints: DriverComplaint[];
}

export const AVAILABILITY_CONFIG: Record<string, { label: string }> = {
  available: { label: 'Available' },
  busy:      { label: 'Busy'      },
  offline:   { label: 'Offline'   },
};

export const ACCOUNT_STATUS_CONFIG: Record<string, { label: string }> = {
  active:   { label: 'Active'   },
  inactive: { label: 'Inactive' },
};

export const SEVERITY_CONFIG: Record<string, { label: string; labelAr: string }> = {
  low:    { label: 'Low',    labelAr: 'منخفض'  },
  medium: { label: 'Medium', labelAr: 'متوسط'  },
  high:   { label: 'High',   labelAr: 'مرتفع'  },
};

export const RESOLUTION_CONFIG: Record<string, { label: string; labelAr: string }> = {
  pending:  { label: 'Pending',  labelAr: 'قيد المعالجة' },
  resolved: { label: 'Resolved', labelAr: 'تم الحل'      },
};

export const ZONE_OPTIONS = [
  { id: 'ZN-001', name: 'مجمع شطر ١٣'       },
  { id: 'ZN-002', name: 'حي الروضة'           },
  { id: 'ZN-004', name: 'مجمع الواحة'         },
  { id: 'ZN-005', name: 'حي الورود'           },
  { id: 'ZN-007', name: 'مجمع شطر ٥'          },
  { id: 'ZN-008', name: 'حي الياسمين'         },
];

const mkOrders = (items: Omit<DriverDeliveredOrder, 'status'>[]): DriverDeliveredOrder[] =>
  items.map(o => ({ ...o, status: 'delivered' as const }));

export const DRIVERS_DATA: DriverProfile[] = [
  {
    id: 'DR-001',
    name: 'محمد العتيبي',
    phone: '+20 10 1234 5678',
    zoneId: 'ZN-001',
    zoneName: 'مجمع شطر ١٣',
    availability: 'available',
    accountStatus: 'active',
    vehicleType: 'Motorcycle',
    licenseExpiry: '2027-03-15',
    stats: {
      totalCompletedOrders: 842,
      totalCashCollected: 12450.75,
      acceptanceRate: 96,
      customerRating: 4.8,
      avgDeliveryTimeMins: 28,
    },
    deliveredOrders: mkOrders([
      { id: 'ORD-1040', date: '2026-06-21', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 12 },
      { id: 'ORD-1035', date: '2026-06-21', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 10 },
      { id: 'ORD-1028', date: '2026-06-20', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 15 },
      { id: 'ORD-1021', date: '2026-06-20', zoneName: 'حي النزهة',     deliveryFeeEarned: 12 },
      { id: 'ORD-1015', date: '2026-06-19', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 10 },
      { id: 'ORD-1008', date: '2026-06-19', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 12 },
      { id: 'ORD-1002', date: '2026-06-18', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 10 },
      { id: 'ORD-0995', date: '2026-06-18', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 14 },
      { id: 'ORD-0988', date: '2026-06-17', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 10 },
      { id: 'ORD-0981', date: '2026-06-17', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 12 },
    ]),
    complaints: [
      {
        id: 'CMP-1001',
        date: '2026-06-15',
        orderId: 'ORD-0970',
        severity: 'low',
        description: 'تأخير بسيط في التوصيل — ١٠ دقائق بعد الموعد المتوقع',
        resolution: 'resolved',
      },
      {
        id: 'CMP-1002',
        date: '2026-06-18',
        orderId: 'ORD-1002',
        severity: 'medium',
        description: 'العميل يشتكي من المعاملة — عدم الرد على المكالمة',
        resolution: 'pending',
      },
    ],
  },
  {
    id: 'DR-002',
    name: 'أحمد الشهري',
    phone: '+20 11 2345 6789',
    zoneId: 'ZN-001',
    zoneName: 'مجمع شطر ١٣',
    availability: 'busy',
    accountStatus: 'active',
    vehicleType: 'Motorcycle',
    licenseExpiry: '2026-11-20',
    stats: {
      totalCompletedOrders: 615,
      totalCashCollected: 8920.00,
      acceptanceRate: 91,
      customerRating: 4.5,
      avgDeliveryTimeMins: 32,
    },
    deliveredOrders: mkOrders([
      { id: 'ORD-1038', date: '2026-06-21', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 10 },
      { id: 'ORD-1031', date: '2026-06-20', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 12 },
      { id: 'ORD-1024', date: '2026-06-20', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 10 },
      { id: 'ORD-1018', date: '2026-06-19', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 15 },
      { id: 'ORD-1010', date: '2026-06-18', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 10 },
      { id: 'ORD-1003', date: '2026-06-18', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 12 },
      { id: 'ORD-0996', date: '2026-06-17', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 10 },
      { id: 'ORD-0989', date: '2026-06-17', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 12 },
      { id: 'ORD-0982', date: '2026-06-16', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 10 },
      { id: 'ORD-0975', date: '2026-06-16', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 14 },
    ]),
    complaints: [
      {
        id: 'CMP-2001',
        date: '2026-06-10',
        orderId: 'ORD-0950',
        severity: 'high',
        description: 'نقص في تحصيل الكاش — فرق ٥٠ ج.م عن المبلغ المطلوب',
        resolution: 'pending',
      },
    ],
  },
  {
    id: 'DR-003',
    name: 'خالد الدوسري',
    phone: '+20 12 3456 7890',
    zoneId: 'ZN-001',
    zoneName: 'مجمع شطر ١٣',
    availability: 'available',
    accountStatus: 'active',
    vehicleType: 'Car',
    licenseExpiry: '2028-01-08',
    stats: {
      totalCompletedOrders: 412,
      totalCashCollected: 6780.50,
      acceptanceRate: 94,
      customerRating: 4.7,
      avgDeliveryTimeMins: 25,
    },
    deliveredOrders: mkOrders([
      { id: 'ORD-1036', date: '2026-06-21', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 12 },
      { id: 'ORD-1029', date: '2026-06-20', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 10 },
      { id: 'ORD-1022', date: '2026-06-19', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 12 },
      { id: 'ORD-1014', date: '2026-06-18', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 10 },
      { id: 'ORD-1007', date: '2026-06-17', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 15 },
      { id: 'ORD-0999', date: '2026-06-16', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 10 },
      { id: 'ORD-0992', date: '2026-06-15', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 12 },
      { id: 'ORD-0985', date: '2026-06-14', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 10 },
      { id: 'ORD-0978', date: '2026-06-13', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 12 },
      { id: 'ORD-0971', date: '2026-06-12', zoneName: 'مجمع شطر ١٣', deliveryFeeEarned: 10 },
    ]),
    complaints: [],
  },
  {
    id: 'DR-004',
    name: 'سعد القحطاني',
    phone: '+20 10 4567 8901',
    zoneId: 'ZN-002',
    zoneName: 'حي الروضة',
    availability: 'available',
    accountStatus: 'active',
    vehicleType: 'Motorcycle',
    licenseExpiry: '2027-07-22',
    stats: {
      totalCompletedOrders: 528,
      totalCashCollected: 7650.25,
      acceptanceRate: 89,
      customerRating: 4.3,
      avgDeliveryTimeMins: 35,
    },
    deliveredOrders: mkOrders([
      { id: 'ORD-1039', date: '2026-06-21', zoneName: 'حي الروضة', deliveryFeeEarned: 8 },
      { id: 'ORD-1032', date: '2026-06-20', zoneName: 'حي الروضة', deliveryFeeEarned: 8 },
      { id: 'ORD-1025', date: '2026-06-19', zoneName: 'حي الروضة', deliveryFeeEarned: 10 },
      { id: 'ORD-1017', date: '2026-06-18', zoneName: 'حي الروضة', deliveryFeeEarned: 8 },
      { id: 'ORD-1009', date: '2026-06-17', zoneName: 'حي الروضة', deliveryFeeEarned: 8 },
      { id: 'ORD-1001', date: '2026-06-16', zoneName: 'حي الروضة', deliveryFeeEarned: 10 },
      { id: 'ORD-0994', date: '2026-06-15', zoneName: 'حي الروضة', deliveryFeeEarned: 8 },
      { id: 'ORD-0987', date: '2026-06-14', zoneName: 'حي الروضة', deliveryFeeEarned: 8 },
      { id: 'ORD-0980', date: '2026-06-13', zoneName: 'حي الروضة', deliveryFeeEarned: 10 },
      { id: 'ORD-0973', date: '2026-06-12', zoneName: 'حي الروضة', deliveryFeeEarned: 8 },
    ]),
    complaints: [
      {
        id: 'CMP-4001',
        date: '2026-06-08',
        orderId: 'ORD-0930',
        severity: 'medium',
        description: 'تأخير في التوصيل — تجاوز ٤٥ دقيقة',
        resolution: 'resolved',
      },
      {
        id: 'CMP-4002',
        date: '2026-06-19',
        orderId: 'ORD-1025',
        severity: 'low',
        description: 'الطلب وصل بارد — شكوى من جودة التغليف',
        resolution: 'pending',
      },
    ],
  },
  {
    id: 'DR-005',
    name: 'فيصل المطيري',
    phone: '+20 11 5678 9012',
    zoneId: 'ZN-002',
    zoneName: 'حي الروضة',
    availability: 'busy',
    accountStatus: 'inactive',
    vehicleType: 'Motorcycle',
    licenseExpiry: '2026-05-30',
    stats: {
      totalCompletedOrders: 290,
      totalCashCollected: 4120.00,
      acceptanceRate: 78,
      customerRating: 3.9,
      avgDeliveryTimeMins: 42,
    },
    deliveredOrders: mkOrders([
      { id: 'ORD-1020', date: '2026-06-15', zoneName: 'حي الروضة', deliveryFeeEarned: 8 },
      { id: 'ORD-1012', date: '2026-06-14', zoneName: 'حي الروضة', deliveryFeeEarned: 8 },
      { id: 'ORD-1004', date: '2026-06-13', zoneName: 'حي الروضة', deliveryFeeEarned: 10 },
      { id: 'ORD-0997', date: '2026-06-12', zoneName: 'حي الروضة', deliveryFeeEarned: 8 },
      { id: 'ORD-0990', date: '2026-06-11', zoneName: 'حي الروضة', deliveryFeeEarned: 8 },
      { id: 'ORD-0983', date: '2026-06-10', zoneName: 'حي الروضة', deliveryFeeEarned: 10 },
      { id: 'ORD-0976', date: '2026-06-09', zoneName: 'حي الروضة', deliveryFeeEarned: 8 },
      { id: 'ORD-0969', date: '2026-06-08', zoneName: 'حي الروضة', deliveryFeeEarned: 8 },
      { id: 'ORD-0962', date: '2026-06-07', zoneName: 'حي الروضة', deliveryFeeEarned: 10 },
      { id: 'ORD-0955', date: '2026-06-06', zoneName: 'حي الروضة', deliveryFeeEarned: 8 },
    ]),
    complaints: [
      {
        id: 'CMP-5001',
        date: '2026-06-05',
        orderId: 'ORD-0940',
        severity: 'high',
        description: 'العميل يشتكي من المعاملة — استخدام لغة غير لائقة',
        resolution: 'resolved',
      },
      {
        id: 'CMP-5002',
        date: '2026-06-12',
        orderId: 'ORD-0997',
        severity: 'high',
        description: 'نقص في تحصيل الكاش — لم يسلم المبلغ كاملاً للعمليات',
        resolution: 'pending',
      },
    ],
  },
  {
    id: 'DR-006',
    name: 'عبدالله الحربي',
    phone: '+20 12 6789 0123',
    zoneId: 'ZN-004',
    zoneName: 'مجمع الواحة',
    availability: 'available',
    accountStatus: 'active',
    vehicleType: 'Car',
    licenseExpiry: '2027-12-01',
    stats: {
      totalCompletedOrders: 701,
      totalCashCollected: 10230.80,
      acceptanceRate: 95,
      customerRating: 4.9,
      avgDeliveryTimeMins: 26,
    },
    deliveredOrders: mkOrders([
      { id: 'ORD-1037', date: '2026-06-21', zoneName: 'مجمع الواحة', deliveryFeeEarned: 10 },
      { id: 'ORD-1030', date: '2026-06-20', zoneName: 'مجمع الواحة', deliveryFeeEarned: 12 },
      { id: 'ORD-1023', date: '2026-06-19', zoneName: 'مجمع الواحة', deliveryFeeEarned: 10 },
      { id: 'ORD-1016', date: '2026-06-18', zoneName: 'مجمع الواحة', deliveryFeeEarned: 10 },
      { id: 'ORD-1006', date: '2026-06-17', zoneName: 'مجمع الواحة', deliveryFeeEarned: 12 },
      { id: 'ORD-0998', date: '2026-06-16', zoneName: 'مجمع الواحة', deliveryFeeEarned: 10 },
      { id: 'ORD-0991', date: '2026-06-15', zoneName: 'مجمع الواحة', deliveryFeeEarned: 10 },
      { id: 'ORD-0984', date: '2026-06-14', zoneName: 'مجمع الواحة', deliveryFeeEarned: 12 },
      { id: 'ORD-0977', date: '2026-06-13', zoneName: 'مجمع الواحة', deliveryFeeEarned: 10 },
      { id: 'ORD-0970', date: '2026-06-12', zoneName: 'مجمع الواحة', deliveryFeeEarned: 10 },
    ]),
    complaints: [
      {
        id: 'CMP-6001',
        date: '2026-06-01',
        orderId: 'ORD-0910',
        severity: 'low',
        description: 'تأخير بسيط — ازدحام مروري',
        resolution: 'resolved',
      },
    ],
  },
  {
    id: 'DR-007',
    name: 'ناصر الزهراني',
    phone: '+20 10 7890 1234',
    zoneId: 'ZN-004',
    zoneName: 'مجمع الواحة',
    availability: 'offline',
    accountStatus: 'active',
    vehicleType: 'Motorcycle',
    licenseExpiry: '2027-04-18',
    stats: {
      totalCompletedOrders: 445,
      totalCashCollected: 5890.00,
      acceptanceRate: 88,
      customerRating: 4.2,
      avgDeliveryTimeMins: 38,
    },
    deliveredOrders: mkOrders([
      { id: 'ORD-1026', date: '2026-06-19', zoneName: 'مجمع الواحة', deliveryFeeEarned: 10 },
      { id: 'ORD-1019', date: '2026-06-18', zoneName: 'مجمع الواحة', deliveryFeeEarned: 10 },
      { id: 'ORD-1011', date: '2026-06-17', zoneName: 'مجمع الواحة', deliveryFeeEarned: 12 },
      { id: 'ORD-1005', date: '2026-06-16', zoneName: 'مجمع الواحة', deliveryFeeEarned: 10 },
      { id: 'ORD-0993', date: '2026-06-15', zoneName: 'مجمع الواحة', deliveryFeeEarned: 10 },
      { id: 'ORD-0986', date: '2026-06-14', zoneName: 'مجمع الواحة', deliveryFeeEarned: 10 },
      { id: 'ORD-0979', date: '2026-06-13', zoneName: 'مجمع الواحة', deliveryFeeEarned: 12 },
      { id: 'ORD-0972', date: '2026-06-12', zoneName: 'مجمع الواحة', deliveryFeeEarned: 10 },
      { id: 'ORD-0965', date: '2026-06-11', zoneName: 'مجمع الواحة', deliveryFeeEarned: 10 },
      { id: 'ORD-0958', date: '2026-06-10', zoneName: 'مجمع الواحة', deliveryFeeEarned: 10 },
    ]),
    complaints: [],
  },
  {
    id: 'DR-008',
    name: 'يوسف الغامدي',
    phone: '+20 11 8901 2345',
    zoneId: 'ZN-007',
    zoneName: 'مجمع شطر ٥',
    availability: 'available',
    accountStatus: 'active',
    vehicleType: 'Motorcycle',
    licenseExpiry: '2028-06-10',
    stats: {
      totalCompletedOrders: 367,
      totalCashCollected: 4980.50,
      acceptanceRate: 92,
      customerRating: 4.6,
      avgDeliveryTimeMins: 30,
    },
    deliveredOrders: mkOrders([
      { id: 'ORD-1034', date: '2026-06-21', zoneName: 'مجمع شطر ٥', deliveryFeeEarned: 0 },
      { id: 'ORD-1027', date: '2026-06-20', zoneName: 'مجمع شطر ٥', deliveryFeeEarned: 0 },
      { id: 'ORD-1013', date: '2026-06-18', zoneName: 'مجمع شطر ٥', deliveryFeeEarned: 0 },
      { id: 'ORD-1000', date: '2026-06-16', zoneName: 'مجمع شطر ٥', deliveryFeeEarned: 0 },
      { id: 'ORD-0987', date: '2026-06-14', zoneName: 'مجمع شطر ٥', deliveryFeeEarned: 0 },
      { id: 'ORD-0974', date: '2026-06-12', zoneName: 'مجمع شطر ٥', deliveryFeeEarned: 0 },
      { id: 'ORD-0967', date: '2026-06-10', zoneName: 'مجمع شطر ٥', deliveryFeeEarned: 0 },
      { id: 'ORD-0960', date: '2026-06-08', zoneName: 'مجمع شطر ٥', deliveryFeeEarned: 0 },
      { id: 'ORD-0953', date: '2026-06-06', zoneName: 'مجمع شطر ٥', deliveryFeeEarned: 0 },
      { id: 'ORD-0946', date: '2026-06-04', zoneName: 'مجمع شطر ٥', deliveryFeeEarned: 0 },
    ]),
    complaints: [
      {
        id: 'CMP-8001',
        date: '2026-06-14',
        orderId: 'ORD-0987',
        severity: 'medium',
        description: 'تأخير في التوصيل — لم يبلغ العميل بالتأخير',
        resolution: 'pending',
      },
    ],
  },
  {
    id: 'DR-009',
    name: 'راشد العمري',
    phone: '+20 12 9012 3456',
    zoneId: 'ZN-008',
    zoneName: 'حي الياسمين',
    availability: 'offline',
    accountStatus: 'inactive',
    vehicleType: 'Car',
    licenseExpiry: '2026-09-25',
    stats: {
      totalCompletedOrders: 198,
      totalCashCollected: 2840.00,
      acceptanceRate: 82,
      customerRating: 4.0,
      avgDeliveryTimeMins: 45,
    },
    deliveredOrders: mkOrders([
      { id: 'ORD-1019', date: '2026-06-10', zoneName: 'حي الياسمين', deliveryFeeEarned: 15 },
      { id: 'ORD-1008', date: '2026-06-08', zoneName: 'حي الياسمين', deliveryFeeEarned: 15 },
      { id: 'ORD-0996', date: '2026-06-06', zoneName: 'حي الياسمين', deliveryFeeEarned: 15 },
      { id: 'ORD-0984', date: '2026-06-04', zoneName: 'حي الياسمين', deliveryFeeEarned: 15 },
      { id: 'ORD-0972', date: '2026-06-02', zoneName: 'حي الياسمين', deliveryFeeEarned: 15 },
      { id: 'ORD-0960', date: '2026-05-30', zoneName: 'حي الياسمين', deliveryFeeEarned: 15 },
      { id: 'ORD-0948', date: '2026-05-28', zoneName: 'حي الياسمين', deliveryFeeEarned: 15 },
      { id: 'ORD-0936', date: '2026-05-26', zoneName: 'حي الياسمين', deliveryFeeEarned: 15 },
      { id: 'ORD-0924', date: '2026-05-24', zoneName: 'حي الياسمين', deliveryFeeEarned: 15 },
      { id: 'ORD-0912', date: '2026-05-22', zoneName: 'حي الياسمين', deliveryFeeEarned: 15 },
    ]),
    complaints: [
      {
        id: 'CMP-9001',
        date: '2026-05-20',
        orderId: 'ORD-0890',
        severity: 'high',
        description: 'نقص في تحصيل الكاش — فرق ١٢٠ ج.م',
        resolution: 'resolved',
      },
    ],
  },
  {
    id: 'DR-010',
    name: 'كريم حسن',
    phone: '+20 10 1122 3344',
    zoneId: 'ZN-005',
    zoneName: 'حي الورود',
    availability: 'busy',
    accountStatus: 'active',
    vehicleType: 'Motorcycle',
    licenseExpiry: '2027-08-14',
    stats: {
      totalCompletedOrders: 503,
      totalCashCollected: 7120.25,
      acceptanceRate: 93,
      customerRating: 4.7,
      avgDeliveryTimeMins: 29,
    },
    deliveredOrders: mkOrders([
      { id: 'ORD-1033', date: '2026-06-21', zoneName: 'حي الورود', deliveryFeeEarned: 7 },
      { id: 'ORD-1026', date: '2026-06-20', zoneName: 'حي الورود', deliveryFeeEarned: 7 },
      { id: 'ORD-1018', date: '2026-06-19', zoneName: 'حي الورود', deliveryFeeEarned: 7 },
      { id: 'ORD-1010', date: '2026-06-18', zoneName: 'حي الورود', deliveryFeeEarned: 7 },
      { id: 'ORD-1002', date: '2026-06-17', zoneName: 'حي الورود', deliveryFeeEarned: 7 },
      { id: 'ORD-0994', date: '2026-06-16', zoneName: 'حي الورود', deliveryFeeEarned: 7 },
      { id: 'ORD-0986', date: '2026-06-15', zoneName: 'حي الورود', deliveryFeeEarned: 7 },
      { id: 'ORD-0978', date: '2026-06-14', zoneName: 'حي الورود', deliveryFeeEarned: 7 },
      { id: 'ORD-0970', date: '2026-06-13', zoneName: 'حي الورود', deliveryFeeEarned: 7 },
      { id: 'ORD-0962', date: '2026-06-12', zoneName: 'حي الورود', deliveryFeeEarned: 7 },
    ]),
    complaints: [
      {
        id: 'CMP-A001',
        date: '2026-06-11',
        orderId: 'ORD-0962',
        severity: 'low',
        description: 'العميل يشتكي من المعاملة — عدم الاعتذار عن التأخير',
        resolution: 'resolved',
      },
    ],
  },
];

/** Shared in-memory store — list & details read/write the same reference. */
export let DRIVERS_STATE: DriverProfile[] = structuredClone(DRIVERS_DATA);

export function getDriverById(id: string): DriverProfile | undefined {
  return DRIVERS_STATE.find(d => d.id === id);
}

export function updateDriver(id: string, patch: Partial<DriverProfile>): void {
  const idx = DRIVERS_STATE.findIndex(d => d.id === id);
  if (idx < 0) return;
  DRIVERS_STATE[idx] = { ...DRIVERS_STATE[idx], ...patch };
}

export function syncDriversFromState(): DriverProfile[] {
  return structuredClone(DRIVERS_STATE);
}

function normalizePhone(value: string): string {
  return value.replace(/[\s\-()+]/g, '').toLowerCase();
}

export function matchesDriverSearch(driver: DriverProfile, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const qPhone = normalizePhone(q);
  const driverPhone = normalizePhone(driver.phone);

  return (
    driver.id.toLowerCase().includes(q) ||
    driver.name.toLowerCase().includes(q) ||
    driver.zoneName.toLowerCase().includes(q) ||
    driverPhone.includes(qPhone)
  );
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return parts[0].charAt(0) + parts[1].charAt(0);
  }
  return name.charAt(0);
}
