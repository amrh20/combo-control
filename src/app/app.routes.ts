import { Routes } from '@angular/router';
import { AdminLayoutComponent } from './layout/admin-layout/admin-layout.component';

export const routes: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    children: [
      { path: '', redirectTo: 'analytics', pathMatch: 'full' },

      // ── Analytics ───────────────────────────────────────────────────────
      {
        path: 'analytics',
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
        loadComponent: () =>
          import('./features/zones-management/zones-management.component').then(
            m => m.ZonesManagementComponent,
          ),
      },
      {
        path: 'zones/create',
        loadComponent: () =>
          import('./features/zones-management/zone-form/zone-form.component').then(
            m => m.ZoneFormComponent,
          ),
      },
      {
        path: 'zones/edit/:id',
        loadComponent: () =>
          import('./features/zones-management/zone-form/zone-form.component').then(
            m => m.ZoneFormComponent,
          ),
      },
      {
        path: 'zones/:id',
        loadComponent: () =>
          import('./features/zones-management/zone-details/zone-details.component').then(
            m => m.ZoneDetailsComponent,
          ),
      },

      // ── Sub-zones ────────────────────────────────────────────────────────
      {
        path: 'sub-zones',
        loadComponent: () =>
          import('./features/sub-zones/sub-zone-list/sub-zone-list.component').then(
            m => m.SubZoneListComponent,
          ),
      },
      {
        path: 'sub-zones/create',
        loadComponent: () =>
          import('./features/sub-zones/sub-zone-builder/sub-zone-builder.component').then(
            m => m.SubZoneBuilderComponent,
          ),
      },
      {
        path: 'sub-zones/edit/:id',
        loadComponent: () =>
          import('./features/sub-zones/sub-zone-builder/sub-zone-builder.component').then(
            m => m.SubZoneBuilderComponent,
          ),
      },

      // ── Hubs — specific routes BEFORE any :id ───────────────────────────
      {
        path: 'hubs',
        loadComponent: () =>
          import('./features/hubs/hubs-list/hubs-list.component').then(
            m => m.HubsListComponent,
          ),
      },
      {
        path: 'hubs/create',
        loadComponent: () =>
          import('./features/hubs/hub-form/hub-form.component').then(
            m => m.HubFormComponent,
          ),
      },
      {
        path: 'hubs/edit/:id',
        loadComponent: () =>
          import('./features/hubs/hub-form/hub-form.component').then(
            m => m.HubFormComponent,
          ),
      },

      // ── Vendor categories ────────────────────────────────────────────────
      {
        path: 'vendor-categories',
        loadComponent: () =>
          import('./features/vendors-management/vendor-categories/vendor-categories.component').then(
            m => m.VendorCategoriesComponent,
          ),
      },

      // ── Vendors — specific routes BEFORE :id ────────────────────────────
      {
        path: 'vendors',
        loadComponent: () =>
          import('./features/vendors-management/vendors-management.component').then(
            m => m.VendorsManagementComponent,
          ),
      },
      {
        path: 'vendors/create',
        loadComponent: () =>
          import('./features/vendors-management/vendor-form/vendor-form.component').then(
            m => m.VendorFormComponent,
          ),
      },
      {
        path: 'vendors/edit/:id',
        loadComponent: () =>
          import('./features/vendors-management/vendor-form/vendor-form.component').then(
            m => m.VendorFormComponent,
          ),
      },
      {
        path: 'vendors/:id',
        loadComponent: () =>
          import('./features/vendors-management/vendor-details/vendor-details.component').then(
            m => m.VendorDetailsComponent,
          ),
      },

      // ── Other modules (stubs) ────────────────────────────────────────────
      {
        path: 'catalog',
        loadComponent: () =>
          import('./features/catalog-management/catalog-management.component').then(
            m => m.CatalogManagementComponent,
          ),
      },
      {
        path: 'orders',
        loadComponent: () =>
          import('./features/orders-management/orders-management.component').then(
            m => m.OrdersManagementComponent,
          ),
      },
      {
        path: 'orders/:id',
        loadComponent: () =>
          import('./features/orders/order-details/order-details.component').then(
            m => m.OrderDetailsComponent,
          ),
      },
      {
        path: 'drivers',
        loadComponent: () =>
          import('./features/drivers-management/drivers-list/drivers-list.component').then(
            m => m.DriversListComponent,
          ),
      },
      {
        path: 'drivers/:id',
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
        loadComponent: () =>
          import('./features/financials/financials.component').then(m => m.FinancialsComponent),
      },
      {
        path: 'customers',
        loadComponent: () =>
          import('./features/customers/customers.component').then(m => m.CustomersComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
