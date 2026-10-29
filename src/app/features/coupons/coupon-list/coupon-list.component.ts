import { DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { PermissionDirective } from '../../../core/directives/permission.directive';
import { Coupon } from '../../../core/models/coupon.model';
import { Permission } from '../../../core/models/permission.model';
import { AuthService } from '../../../core/services/auth.service';
import { CouponService, couponErrorMessage } from '../../../core/services/coupon.service';

@Component({
  selector: 'ctrl-coupon-list',
  standalone: true,
  imports: [DecimalPipe, PermissionDirective, RouterLink],
  templateUrl: './coupon-list.component.html',
  styleUrl: './coupon-list.component.scss',
})
export class CouponListComponent {
  private readonly couponsApi = inject(CouponService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly writePermissions = [Permission.CouponsWrite, Permission.FinancialsPayout];

  readonly coupons = signal<Coupon[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly pendingId = signal<string | null>(null);
  readonly pendingDelete = signal<Coupon | null>(null);
  readonly deleting = signal(false);

  readonly canWrite = computed(() => this.auth.hasAnyPermission(this.writePermissions));

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.couponsApi
      .getCoupons()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (coupons) => {
          this.coupons.set(coupons);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.loadError.set(couponErrorMessage(error, 'تعذر تحميل الكوبونات.'));
        },
      });
  }

  onActiveChange(coupon: Coupon, event: Event): void {
    const input = event.target as HTMLInputElement;
    const next = input.checked;
    if (!this.canWrite() || this.pendingId() || coupon.isActive === next) {
      input.checked = coupon.isActive;
      return;
    }

    this.actionError.set(null);
    this.pendingId.set(coupon.id);
    this.couponsApi
      .setCouponActive(coupon.id, next)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.pendingId.set(null);
          this.coupons.update((list) =>
            list.map((item) => {
              if (item.id !== coupon.id) {
                return item;
              }
              return updated.id ? updated : { ...item, isActive: next };
            }),
          );
        },
        error: (error: unknown) => {
          input.checked = coupon.isActive;
          this.pendingId.set(null);
          this.actionError.set(couponErrorMessage(error, 'تعذر تحديث حالة الكوبون.'));
        },
      });
  }

  askDelete(coupon: Coupon): void {
    if (this.deleting()) {
      return;
    }
    this.pendingDelete.set(coupon);
  }

  cancelDelete(): void {
    if (this.deleting()) {
      return;
    }
    this.pendingDelete.set(null);
  }

  confirmDelete(): void {
    const coupon = this.pendingDelete();
    if (!coupon || this.deleting()) {
      return;
    }

    this.actionError.set(null);
    this.deleting.set(true);
    this.couponsApi
      .deleteCoupon(coupon.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.coupons.update((list) => list.filter((item) => item.id !== coupon.id));
          this.deleting.set(false);
          this.pendingDelete.set(null);
        },
        error: (error: unknown) => {
          this.deleting.set(false);
          this.pendingDelete.set(null);
          this.actionError.set(couponErrorMessage(error, 'تعذر حذف الكوبون.'));
        },
      });
  }
}
