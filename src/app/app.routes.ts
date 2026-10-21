import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { landingGuard, permissionGuard } from './core/guards/permission.guard';
import { Permission } from './core/models/permission.model';
import { AdminLayoutComponent } from './layout/admin-layout/admin-layout.component';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    component: AdminLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', canActivate: [landingGuard], children: [] },
      {
        path: 'no-access',
        loadComponent: () =>
          import('./features/auth/no-access/no-access.component').then((m) => m.NoAccessComponent),
      },

      // ── Analytics ───────────────────────────────────────────────────────
      {
        path: 'analytics',
        canActivate: [permissionGuard],
        data: { permission: Permission.AnalyticsRead },
        loadComponent: () =>
          import('./features/analytics/analytics.component').then(m => m.AnalyticsComponent),
      },

      {
        path: 'geofencing',
        redirectTo: 'zones',
        pathMatch: 'full',
      },

      // ── Zones — specific routes BEFORE :id to prevent shadowing ─────────
      {
        path: 'zones',
        canActivate: [permissionGuard],
        data: { permission: Permission.ZonesRead },
        loadComponent: () =>
          import('./features/zones-management/zones-management.component').then(
            m => m.ZonesManagementComponent,
          ),
      },
      {
        path: 'zones/create',
        canActivate: [permissionGuard],
        data: { permission: Permission.ZonesWrite, permissionFallback: '/zones' },
        loadComponent: () =>
          import('./features/zones-management/zone-form/zone-form.component').then(
            m => m.ZoneFormComponent,
          ),
      },
      {
        path: 'zones/edit/:id',
        canActivate: [permissionGuard],
        data: { permission: Permission.ZonesWrite, permissionFallback: '/zones' },
        loadComponent: () =>
          import('./features/zones-management/zone-form/zone-form.component').then(
            m => m.ZoneFormComponent,
          ),
      },
      {
        path: 'zones/:id',
        canActivate: [permissionGuard],
        data: { permission: Permission.ZonesRead },
        loadComponent: () =>
          import('./features/zones-management/zone-details/zone-details.component').then(
            m => m.ZoneDetailsComponent,
          ),
      },

      // ── Sub-zones ────────────────────────────────────────────────────────
      {
        path: 'sub-zones',
        canActivate: [permissionGuard],
        data: { permission: Permission.ZonesRead },
        loadComponent: () =>
          import('./features/sub-zones/sub-zone-list/sub-zone-list.component').then(
            m => m.SubZoneListComponent,
          ),
      },
      {
        path: 'sub-zones/create',
        canActivate: [permissionGuard],
        data: { permission: Permission.ZonesWrite, permissionFallback: '/sub-zones' },
        loadComponent: () =>
          import('./features/sub-zones/sub-zone-builder/sub-zone-builder.component').then(
            m => m.SubZoneBuilderComponent,
          ),
      },
      {
        path: 'sub-zones/edit/:id',
        canActivate: [permissionGuard],
        data: { permission: Permission.ZonesWrite, permissionFallback: '/sub-zones' },
        loadComponent: () =>
          import('./features/sub-zones/sub-zone-builder/sub-zone-builder.component').then(
            m => m.SubZoneBuilderComponent,
          ),
      },

      // ── Hubs — specific routes BEFORE any :id ───────────────────────────
      {
        path: 'hubs',
        canActivate: [permissionGuard],
        data: { permission: Permission.ZonesRead },
        loadComponent: () =>
          import('./features/hubs/hubs-list/hubs-list.component').then(
            m => m.HubsListComponent,
          ),
      },
      {
        path: 'hubs/create',
        canActivate: [permissionGuard],
        data: { permission: Permission.HubsWrite, permissionFallback: '/hubs' },
        loadComponent: () =>
          import('./features/hubs/hub-form/hub-form.component').then(
            m => m.HubFormComponent,
          ),
      },
      {
        path: 'hubs/edit/:id',
        canActivate: [permissionGuard],
        data: { permission: Permission.HubsWrite, permissionFallback: '/hubs' },
        loadComponent: () =>
          import('./features/hubs/hub-form/hub-form.component').then(
            m => m.HubFormComponent,
          ),
      },

      // ── Vendor categories ────────────────────────────────────────────────
      {
        path: 'vendor-categories',
        canActivate: [permissionGuard],
        data: { permission: Permission.VendorsRead },
        loadComponent: () =>
          import('./features/vendors-management/vendor-categories/vendor-categories.component').then(
            m => m.VendorCategoriesComponent,
          ),
      },

      // ── Vendors — specific routes BEFORE :id ────────────────────────────
      {
        path: 'vendors',
        canActivate: [permissionGuard],
        data: { permission: Permission.VendorsRead },
        loadComponent: () =>
          import('./features/vendors-management/vendors-management.component').then(
            m => m.VendorsManagementComponent,
          ),
      },
      {
        path: 'vendors/create',
        canActivate: [permissionGuard],
        data: { permission: Permission.VendorsWrite, permissionFallback: '/vendors' },
        loadComponent: () =>
          import('./features/vendors-management/vendor-form/vendor-form.component').then(
            m => m.VendorFormComponent,
          ),
      },
      {
        path: 'vendors/edit/:id',
        canActivate: [permissionGuard],
        data: { permission: Permission.VendorsWrite, permissionFallback: '/vendors' },
        loadComponent: () =>
          import('./features/vendors-management/vendor-form/vendor-form.component').then(
            m => m.VendorFormComponent,
          ),
      },
      {
        path: 'vendors/:id/catalog',
        canActivate: [permissionGuard],
        data: { permission: Permission.CatalogRead, permissionFallback: '/vendors' },
        loadComponent: () =>
          import('./features/catalog-management/vendor-catalog/vendor-catalog.component').then(
            m => m.VendorCatalogComponent,
          ),
      },
      {
        path: 'vendors/:id/catalog/products/create',
        canActivate: [permissionGuard],
        data: { permission: Permission.CatalogWrite, permissionFallback: '/vendors' },
        loadComponent: () =>
          import('./features/catalog-management/product-form/product-form.component').then(
            m => m.ProductFormComponent,
          ),
      },
      {
        path: 'vendors/:id/catalog/products/:productId/edit',
        canActivate: [permissionGuard],
        data: { permission: Permission.CatalogWrite, permissionFallback: '/vendors' },
        loadComponent: () =>
          import('./features/catalog-management/product-form/product-form.component').then(
            m => m.ProductFormComponent,
          ),
      },
      {
        path: 'vendors/:id',
        canActivate: [permissionGuard],
        data: { permission: Permission.VendorsRead },
        loadComponent: () =>
          import('./features/vendors-management/vendor-details/vendor-details.component').then(
            m => m.VendorDetailsComponent,
          ),
      },

      // ── Other modules (stubs) ────────────────────────────────────────────
      {
        path: 'catalog',
        canActivate: [permissionGuard],
        data: { permission: Permission.CatalogRead },
        loadComponent: () =>
          import('./features/catalog-management/catalog-management.component').then(
            m => m.CatalogManagementComponent,
          ),
      },
      {
        path: 'catalog/create',
        canActivate: [permissionGuard],
        data: { permission: Permission.CatalogWrite, permissionFallback: '/catalog' },
        loadComponent: () =>
          import('./features/catalog-management/product-form/product-form.component').then(
            m => m.ProductFormComponent,
          ),
      },
      {
        path: 'catalog/:productId/edit',
        canActivate: [permissionGuard],
        data: { permission: Permission.CatalogWrite, permissionFallback: '/catalog' },
        loadComponent: () =>
          import('./features/catalog-management/product-form/product-form.component').then(
            m => m.ProductFormComponent,
          ),
      },
      {
        path: 'orders',
        canActivate: [permissionGuard],
        data: { permission: Permission.OrdersRead },
        loadComponent: () =>
          import('./features/orders-management/orders-management.component').then(
            m => m.OrdersManagementComponent,
          ),
      },
      {
        path: 'orders/create',
        canActivate: [permissionGuard],
        data: { permission: Permission.OrdersUpdate, permissionFallback: '/orders' },
        loadComponent: () =>
          import('./features/orders/create-order/create-order.component').then(
            m => m.CreateOrderComponent,
          ),
      },
      {
        path: 'orders/history',
        canActivate: [permissionGuard],
        data: { permission: Permission.OrdersRead },
        loadComponent: () =>
          import('./features/orders/order-history/order-history.component').then(
            m => m.OrderHistoryComponent,
          ),
      },
      {
        path: 'orders/:id',
        canActivate: [permissionGuard],
        data: { permission: Permission.OrdersRead },
        loadComponent: () =>
          import('./features/orders/order-details/order-details.component').then(
            m => m.OrderDetailsComponent,
          ),
      },
      {
        path: 'drivers',
        canActivate: [permissionGuard],
        data: { permission: Permission.DriversRead },
        loadComponent: () =>
          import('./features/drivers-management/captain-list/captain-list.component').then(
            m => m.CaptainListComponent,
          ),
      },
      {
        path: 'drivers/:id',
        canActivate: [permissionGuard],
        data: { permission: Permission.DriversRead },
        loadComponent: () =>
          import('./features/drivers-management/driver-details/driver-details.component').then(
            m => m.DriverDetailsComponent,
          ),
      },
      {
        path: 'fleet',
        redirectTo: 'drivers',
        pathMatch: 'full',
      },
      {
        path: 'financials',
        canActivate: [permissionGuard],
        data: { permission: Permission.FinancialsRead },
        loadComponent: () =>
          import('./features/financials/financials.component').then(m => m.FinancialsComponent),
      },
      {
        path: 'staff',
        canActivate: [permissionGuard],
        data: { permission: Permission.StaffRead },
        loadComponent: () =>
          import('./features/staff-management/staff-list/staff-list.component').then(
            m => m.StaffListComponent,
          ),
      },
      {
        path: 'roles',
        canActivate: [permissionGuard],
        data: { permission: Permission.StaffRead },
        loadComponent: () =>
          import('./features/roles-management/role-list/role-list.component').then(
            (m) => m.RoleListComponent,
          ),
      },
      {
        path: 'customers',
        canActivate: [permissionGuard],
        data: { permission: Permission.CustomersRead },
        loadComponent: () =>
          import('./features/customers/customer-list/customer-list.component').then(
            m => m.CustomerListComponent,
          ),
      },
      {
        path: 'audit-log',
        canActivate: [permissionGuard],
        data: { permission: Permission.AuditRead },
        loadComponent: () =>
          import('./features/audit-log/audit-log.component').then((m) => m.AuditLogComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
