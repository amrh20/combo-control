export type StaffStatus = 'ACTIVE' | 'BLOCKED';

export interface StaffRole {
  key: string;
  name: string;
}

/** Role row from `GET /v1/roles`. */
export interface StaffRoleDefinition extends StaffRole {
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
}

/** `all` covers every zone and hub. Otherwise the user is limited to the listed ids. */
export interface StaffScope {
  all: boolean;
  zoneIds: string[];
  hubIds: string[];
}

/** Staff row from `GET /v1/staff`. */
export interface Staff {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: StaffStatus;
  roles: StaffRole[];
  scope: StaffScope;
  mfaEnabled: boolean;
}

export interface StaffPage {
  items: Staff[];
  nextCursor: string | null;
}

export interface CreateStaffPayload {
  email: string;
  fullName: string;
  phone?: string;
  password: string;
  roleKeys: string[];
  scope: StaffScope;
}

/** Hub option used when assigning a staff member's scope. */
export interface ScopeHub {
  id: string;
  name: string;
  isActive: boolean;
}

const ROLE_LABELS: Readonly<Record<string, string>> = {
  SUPER_ADMIN: 'مدير أعلى',
  ADMIN: 'مدير النظام',
  OPS_MANAGER: 'مدير العمليات',
  OPS_AGENT: 'موظف العمليات',
  HUB_STAFF: 'موظف المركز',
  FINANCE: 'المالية',
  CATALOG_MANAGER: 'مدير المنتجات',
};

/** Arabic label for a known system role; custom roles keep the name from the API. */
export function staffRoleLabel(role: StaffRole): string {
  return ROLE_LABELS[role.key] ?? role.name;
}

export function staffRoleBadgeClass(roleKey: string): string {
  if (roleKey === 'SUPER_ADMIN' || roleKey === 'ADMIN') {
    return 'bg-blue-50 text-blue-700';
  }
  if (roleKey === 'OPS_MANAGER' || roleKey === 'OPS_AGENT') {
    return 'bg-emerald-50 text-emerald-700';
  }
  if (roleKey === 'HUB_STAFF') {
    return 'bg-amber-50 text-amber-800';
  }
  if (roleKey === 'FINANCE') {
    return 'bg-violet-50 text-violet-700';
  }
  return 'bg-gray-100 text-gray-600';
}
