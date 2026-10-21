import { staffRoleLabel, type StaffRole, type StaffRoleDefinition } from './staff.model';

/** Role row from `GET /v1/roles`. */
export type Role = StaffRoleDefinition;

/** Permission row from `GET /v1/permissions`. */
export interface PermissionDefinition {
  key: string;
  description: string;
}

/** Body for `POST /v1/roles`. */
export interface CreateRolePayload {
  key: string;
  name: string;
  permissions: string[];
}

/** Body result of `PUT /v1/roles/{key}/permissions`. */
export interface RolePermissionsUpdate {
  key: string;
  permissions: string[];
}

export interface PermissionGroup {
  id: string;
  label: string;
  permissions: PermissionDefinition[];
}

/** `POST /v1/roles` key: UPPER_SNAKE_CASE, 3–50 characters. */
export const ROLE_KEY_PATTERN = /^[A-Z][A-Z0-9_]{2,49}$/;

const ROLE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  SUPER_ADMIN: 'كل الصلاحيات، بما فيها إدارة المديرين',
  ADMIN: 'إدارة المنصة بدون تعديل الأدوار',
  OPS_MANAGER: 'التشغيل اليومي: الطلبات والتوزيع والكباتن والمناطق',
  OPS_AGENT: 'متابعة الطلبات وتعيين الكباتن',
  HUB_STAFF: 'استلام حقائب المتاجر والتحقق منها في المركز',
  FINANCE: 'التقارير المالية والتسويات',
  CATALOG_MANAGER: 'المتاجر والفئات والمنتجات',
};

const PERMISSION_LABELS: Readonly<Record<string, string>> = {
  'staff.read': 'عرض الموظفين والأدوار',
  'staff.manage': 'إضافة الموظفين وتعديل أدوارهم وحظرهم',
  'roles.manage': 'إنشاء الأدوار وتعديل صلاحياتها',
  'audit.read': 'عرض سجل التعديلات',
  'analytics.read': 'عرض لوحات التحليلات',
  'zones.read': 'عرض المناطق والمناطق الفرعية والمراكز',
  'zones.write': 'إنشاء وتعديل المناطق والمناطق الفرعية',
  'hubs.write': 'إنشاء وتعديل مراكز الانطلاق',
  'vendors.read': 'عرض المتاجر وفئاتها',
  'vendors.write': 'إنشاء وتعديل المتاجر وفئاتها',
  'catalog.read': 'عرض المنتجات والفئات',
  'catalog.write': 'إنشاء وتعديل المنتجات والفئات',
  'orders.read': 'عرض الطلبات',
  'orders.update': 'تعديل محتوى الطلب وحالة الطلبات الفرعية',
  'orders.assign': 'تعيين الكباتن على الطلبات',
  'orders.cancel': 'إلغاء الطلبات وتحديد الرسوم والاسترداد',
  'hub.verify': 'استلام الحقائب والتحقق منها في المركز',
  'drivers.read': 'عرض الكباتن',
  'drivers.write': 'إضافة الكباتن وتعديلهم وحظرهم وإعادة ضبط كلمة المرور',
  'customers.read': 'عرض العملاء',
  'customers.block': 'حظر العملاء وإلغاء الحظر',
  'financials.read': 'عرض التقارير المالية',
  'financials.payout': 'تسوية مستحقات المتاجر والكباتن',
};

const GROUP_LABELS: Readonly<Record<string, string>> = {
  staff: 'الموظفون',
  roles: 'الأدوار',
  audit: 'سجل التعديلات',
  analytics: 'التحليلات',
  zones: 'المناطق',
  hubs: 'المراكز',
  vendors: 'المتاجر',
  catalog: 'المنتجات',
  orders: 'الطلبات',
  drivers: 'الكباتن',
  customers: 'العملاء',
  financials: 'الماليات',
};

const GROUP_ORDER = Object.keys(GROUP_LABELS);

export function roleDisplayName(role: StaffRole): string {
  return staffRoleLabel(role);
}

export function roleDescription(role: Pick<Role, 'key' | 'description'>): string {
  return ROLE_DESCRIPTIONS[role.key] ?? role.description?.trim() ?? '—';
}

export function permissionLabel(permission: PermissionDefinition): string {
  return PERMISSION_LABELS[permission.key] ?? permission.description;
}

export function groupPermissions(permissions: readonly PermissionDefinition[]): PermissionGroup[] {
  const buckets = new Map<string, PermissionDefinition[]>();
  for (const permission of permissions) {
    const id = permission.key.split('.')[0] || 'other';
    const group = buckets.get(id) ?? [];
    group.push(permission);
    buckets.set(id, group);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => {
      const leftIndex = GROUP_ORDER.indexOf(left);
      const rightIndex = GROUP_ORDER.indexOf(right);
      return (leftIndex === -1 ? GROUP_ORDER.length : leftIndex) -
        (rightIndex === -1 ? GROUP_ORDER.length : rightIndex);
    })
    .map(([id, items]) => ({
      id,
      label: GROUP_LABELS[id] ?? id,
      permissions: [...items].sort((left, right) => left.key.localeCompare(right.key)),
    }));
}
