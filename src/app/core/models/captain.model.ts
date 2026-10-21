/** Account state accepted by `POST` / `PATCH /v1/captains`. */
export type CaptainStatus = 'ACTIVE' | 'BLOCKED';

/** Duty accepted by the captains API. Operational availability is not part of this contract yet. */
export type CaptainRole = 'COLLECTOR' | 'DELIVERY' | 'BOTH';

/** Travel mode accepted by `POST` / `PATCH /v1/captains`. Collectors use `NONE`. */
export type CaptainVehicleType = 'MOTORCYCLE' | 'CAR' | 'BICYCLE' | 'NONE';

/** Captain row from `GET /v1/captains` and `GET /v1/captains/{id}`. */
export interface Captain {
  id: string;
  phone: string;
  fullName: string;
  role: CaptainRole;
  status: CaptainStatus;
  hubId: string;
  vehicleType: CaptainVehicleType;
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
}

/** `PATCH /v1/captains/{id}`. */
export interface UpdateCaptainPayload {
  fullName?: string;
  role?: CaptainRole;
  status?: CaptainStatus;
  hubId?: string;
  vehicleType?: CaptainVehicleType;
}

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
