export const DRIVER_CURRENCY = 'ج.م';

export type DriverAvailability = 'available' | 'busy' | 'offline';
export type DriverAccountStatus = 'active' | 'inactive';
export type ComplaintSeverity = 'low' | 'medium' | 'high';
export type ComplaintResolution = 'pending' | 'resolved';
export type CaptainRole = 'COLLECTOR' | 'DELIVERY' | 'BOTH';
/** Matches `PATCH /v1/captains` vehicle enums (no `NONE` in the dropdown). */
export type CaptainVehicleType = 'MOTORCYCLE' | 'CAR' | 'BICYCLE';

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

export interface CaptainProfile {
  id: string;
  name: string;
  phone: string;
  /** Login credential for the captain app. Never rendered in the admin UI. */
  password?: string;
  role: CaptainRole;
  /** Dispatch hub this captain starts from. */
  hubId: string;
  /** Denormalized hub name so the table can sort and search without a join. */
  hubName: string;
  availability: DriverAvailability;
  accountStatus: DriverAccountStatus;
  /** Empty for collectors — they do not operate a vehicle. */
  vehicleType: CaptainVehicleType | '';
  employmentType?: 'FIXED' | 'FREELANCER';
  /** Max cash limit from the API, in piastres. */
  maxCashLimit?: number;
  /** Monthly salary for fixed captains, in piastres. */
  fixedSalary?: number;
  /** When false, the captain does not use the mobile app. */
  hasApp?: boolean;
  licenseExpiry: string;
  stats: DriverStats;
  deliveredOrders: DriverDeliveredOrder[];
  complaints: DriverComplaint[];
}

export const AVAILABILITY_CONFIG: Record<string, { label: string; labelAr: string }> = {
  available: { label: 'Available', labelAr: 'متاح' },
  busy:      { label: 'Busy',      labelAr: 'مشغول' },
  offline:   { label: 'Offline',   labelAr: 'غير متصل' },
};

export const ACCOUNT_STATUS_CONFIG: Record<string, { label: string; labelAr: string }> = {
  active:   { label: 'Active',   labelAr: 'نشط' },
  inactive: { label: 'Blocked', labelAr: 'محظور' },
};

export const ROLE_OPTIONS: { label: string; value: CaptainRole }[] = [
  { label: 'طيار توصيل', value: 'DELIVERY' },
  { label: 'مُجمّع طلبات', value: 'COLLECTOR' },
];

export const ROLE_CONFIG: Record<CaptainRole, { labelAr: string }> = {
  DELIVERY: { labelAr: 'طيار توصيل' },
  COLLECTOR: { labelAr: 'مُجمّع طلبات' },
  BOTH: { labelAr: 'تجميع وتوصيل' },
};

export const VEHICLE_OPTIONS: { label: string; value: CaptainVehicleType }[] = [
  { label: 'دراجة نارية', value: 'MOTORCYCLE' },
  { label: 'سيارة', value: 'CAR' },
  { label: 'دراجة هوائية (عجلة)', value: 'BICYCLE' },
];

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return parts[0].charAt(0) + parts[1].charAt(0);
  }
  return name.charAt(0);
}
