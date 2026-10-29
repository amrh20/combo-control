import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { permissionGuard } from '../../core/guards/permission.guard';
import { Permission } from '../../core/models/permission.model';
import { CouponFormComponent } from './coupon-form/coupon-form.component';
import { CouponListComponent } from './coupon-list/coupon-list.component';

const writePermission = [Permission.CouponsWrite, Permission.FinancialsPayout];

const routes: Routes = [
  { path: '', component: CouponListComponent },
  {
    path: 'new',
    canActivate: [permissionGuard],
    data: { permission: writePermission, permissionFallback: '/coupons' },
    component: CouponFormComponent,
  },
  {
    path: ':id/edit',
    canActivate: [permissionGuard],
    data: { permission: writePermission, permissionFallback: '/coupons' },
    component: CouponFormComponent,
  },
];

/** Lazy-loaded coupons feature for `/coupons`. */
@NgModule({
  imports: [RouterModule.forChild(routes)],
})
export class CouponsModule {}
