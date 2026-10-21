/**
 * Staff permission catalog. Keys match `@combo/contracts` `PERMISSIONS`.
 * A page needs the `.read` grant; creating or changing data needs the write grant.
 */
export const Permission = {
  StaffRead: 'staff.read',
  StaffManage: 'staff.manage',
  RolesManage: 'roles.manage',
  AuditRead: 'audit.read',
  AnalyticsRead: 'analytics.read',
  ZonesRead: 'zones.read',
  ZonesWrite: 'zones.write',
  HubsWrite: 'hubs.write',
  VendorsRead: 'vendors.read',
  VendorsWrite: 'vendors.write',
  CatalogRead: 'catalog.read',
  CatalogWrite: 'catalog.write',
  OrdersRead: 'orders.read',
  OrdersUpdate: 'orders.update',
  OrdersAssign: 'orders.assign',
  OrdersCancel: 'orders.cancel',
  HubVerify: 'hub.verify',
  DriversRead: 'drivers.read',
  DriversWrite: 'drivers.write',
  CustomersRead: 'customers.read',
  CustomersBlock: 'customers.block',
  FinancialsRead: 'financials.read',
  FinancialsPayout: 'financials.payout',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

/** First page in the sidebar the signed-in user is allowed to open. */
export const LANDING_PAGES: readonly { path: string; permission: Permission }[] = [
  { path: '/analytics', permission: Permission.AnalyticsRead },
  { path: '/zones', permission: Permission.ZonesRead },
  { path: '/vendors', permission: Permission.VendorsRead },
  { path: '/catalog', permission: Permission.CatalogRead },
  { path: '/orders', permission: Permission.OrdersRead },
  { path: '/drivers', permission: Permission.DriversRead },
  { path: '/financials', permission: Permission.FinancialsRead },
  { path: '/staff', permission: Permission.StaffRead },
  { path: '/customers', permission: Permission.CustomersRead },
  { path: '/audit-log', permission: Permission.AuditRead },
];
