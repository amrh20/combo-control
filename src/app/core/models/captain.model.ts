import { CaptainCashSettlement } from './captain-settlement.model';

/** Account state accepted by `POST` / `PATCH /v1/captains`. */
export type CaptainStatus = 'ACTIVE' | 'BLOCKED';

/** Duty accepted by the captains API. Operational availability is not part of this contract yet. */
export type CaptainRole = 'COLLECTOR' | 'DELIVERY' | 'BOTH';

/** Travel mode accepted by `POST` / `PATCH /v1/captains`. Collectors use `NONE`. */
export type CaptainVehicleType = 'MOTORCYCLE' | 'CAR' | 'BICYCLE' | 'NONE';

/** Mixed fleet: fixed salary vs freelancer cash limit rules. */
export type CaptainEmploymentType = 'FIXED' | 'FREELANCER';

/** Captain row from `GET /v1/captains` and `GET /v1/captains/{id}`. */
export interface Captain {
  id: string;
  phone: string;
  fullName: string;
  role: CaptainRole;
  status: CaptainStatus;
  hubId: string;
  vehicleType: CaptainVehicleType;
  /**
   * Cash the captain still holds, in piastres.
   * From `company_cash_balance` / `companyCashBalance` on the captain payload.
   */
  companyCashBalance: number | null;
  /**
   * Open remittance request from `GET /v1/captains/{id}` (`pendingSettlement`).
   * Null when the captain has not asked to hand in cash.
   */
  pendingSettlement: CaptainCashSettlement | null;
  employmentType?: CaptainEmploymentType;
  /** Max cash the captain may hold, in piastres (`maxCashLimit` / `max_cash_limit`). */
  maxCashLimit?: number;
  /** Monthly salary for fixed captains, in piastres (`fixedSalary` / `fixed_salary`). */
  fixedSalary?: number;
  /** When false, the captain is external and does not use the mobile app. Defaults to true. */
  hasApp?: boolean;
}

export interface CaptainListQuery {
  role?: CaptainRole;
  status?: CaptainStatus;
  hubId?: string;
}

/** `POST /v1/captains`. */
export interface CreateCaptainPayload {
  phone: string;
  fullName: string;
  role: CaptainRole;
  hubId: string;
  password: string;
  vehicleType?: CaptainVehicleType;
  employmentType?: CaptainEmploymentType;
  maxCashLimit?: number;
  fixedSalary?: number;
  hasApp?: boolean;
}

/** `PATCH /v1/captains/{id}`. */
export interface UpdateCaptainPayload {
  fullName?: string;
  role?: CaptainRole;
  status?: CaptainStatus;
  hubId?: string;
  vehicleType?: CaptainVehicleType;
  employmentType?: CaptainEmploymentType;
  maxCashLimit?: number;
  fixedSalary?: number;
  hasApp?: boolean;
}

/** Backend default is true; only an explicit `false` means no app access. */
export function captainUsesApp(captain: { hasApp?: boolean | null } | null | undefined): boolean {
  return captain?.hasApp !== false;
}

export const CAPTAIN_EMPLOYMENT_OPTIONS: { label: string; value: CaptainEmploymentType }[] = [
  { label: 'عمل حر (Freelancer)', value: 'FREELANCER' },
  { label: 'راتب ثابت (Fixed)', value: 'FIXED' },
];

export const CAPTAIN_DEFAULT_MAX_CASH_EGP: Readonly<Record<CaptainEmploymentType, number>> = {
  FREELANCER: 200,
  FIXED: 2000,
};

export const CAPTAIN_ROLE_OPTIONS: { label: string; value: CaptainRole }[] = [
  { label: 'طيار توصيل', value: 'DELIVERY' },
  { label: 'مُجمّع طلبات', value: 'COLLECTOR' },
];

/** Selectable vehicles. `NONE` is sent for collectors and is not a dropdown choice. */
export const CAPTAIN_VEHICLE_OPTIONS: {
  label: string;
  value: Exclude<CaptainVehicleType, 'NONE'>;
}[] = [
  { label: 'دراجة نارية', value: 'MOTORCYCLE' },
  { label: 'سيارة', value: 'CAR' },
  { label: 'دراجة هوائية (عجلة)', value: 'BICYCLE' },
];

const ROLE_LABELS: Readonly<Record<CaptainRole, string>> = {
  DELIVERY: 'طيار توصيل',
  COLLECTOR: 'مُجمّع طلبات',
  BOTH: 'تجميع وتوصيل',
};

const STATUS_LABELS: Readonly<Record<CaptainStatus, string>> = {
  ACTIVE: 'نشط',
  BLOCKED: 'محظور',
};

export function captainRoleLabel(role: CaptainRole): string {
  return ROLE_LABELS[role];
}

export function captainStatusLabel(status: CaptainStatus): string {
  return STATUS_LABELS[status];
}

/** Suffix used by the existing list badge styles. */
export function captainRoleBadge(role: CaptainRole): 'delivery' | 'collector' | 'both' {
  if (role === 'DELIVERY') {
    return 'delivery';
  }
  if (role === 'COLLECTOR') {
    return 'collector';
  }
  return 'both';
}
