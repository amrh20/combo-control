import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CouponInput } from '../../../core/models/coupon.model';
import { CouponService, couponErrorMessage } from '../../../core/services/coupon.service';

const CODE_PATTERN = /^[A-Z0-9_-]+$/;

@Component({
  selector: 'ctrl-coupon-form',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './coupon-form.component.html',
  styleUrl: './coupon-form.component.scss',
})
export class CouponFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly couponsApi = inject(CouponService);
  private readonly destroyRef = inject(DestroyRef);

  readonly couponId = signal<string | null>(this.route.snapshot.paramMap.get('id'));
  readonly loading = signal(this.couponId() !== null);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);

  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(32), Validators.pattern(CODE_PATTERN)]],
    discountPercent: [null as number | null, [Validators.required, Validators.min(1), Validators.max(100)]],
    maxDiscountAmount: [null as number | null, [Validators.required, Validators.min(0)]],
    minOrderValue: [null as number | null, [Validators.required, Validators.min(0)]],
    expiresAt: ['', [notBeforeToday]],
    usageLimit: [null as number | null, [Validators.required, Validators.min(1), wholeNumber]],
    isActive: [true],
  });

  constructor() {
    this.form.controls.code.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      const normalized = (value ?? '').toUpperCase().replace(/\s+/g, '');
      if (normalized !== value) {
        this.form.controls.code.setValue(normalized, { emitEvent: false });
      }
    });

    const id = this.couponId();
    if (!id) {
      return;
    }

    this.couponsApi
      .getCoupon(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (coupon) => {
          this.form.setValue({
            code: coupon.code,
            discountPercent: coupon.discountPercent,
            maxDiscountAmount: coupon.maxDiscountAmount,
            minOrderValue: coupon.minOrderValue,
            expiresAt: coupon.expiresAt ?? '',
            usageLimit: coupon.usageLimit,
            isActive: coupon.isActive,
          });
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.loadError.set(couponErrorMessage(error, 'تعذر تحميل الكوبون.'));
        },
      });
  }

  get editing(): boolean {
    return this.couponId() !== null;
  }

  invalid(name: 'code' | 'discountPercent' | 'maxDiscountAmount' | 'minOrderValue' | 'expiresAt' | 'usageLimit'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  cancel(): void {
    void this.router.navigate(['/coupons']);
  }

  save(): void {
    this.submitted.set(true);
    this.saveError.set(null);
    if (this.form.invalid || this.saving() || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const payload: CouponInput = {
      code: (raw.code ?? '').trim().toUpperCase(),
      discountPercent: Number(raw.discountPercent),
      maxDiscountAmount: Number(raw.maxDiscountAmount),
      minOrderValue: Number(raw.minOrderValue),
      expiresAt: raw.expiresAt || null,
      usageLimit: Number(raw.usageLimit),
      isActive: raw.isActive ?? true,
    };

    const id = this.couponId();
    const request = id ? this.couponsApi.updateCoupon(id, payload) : this.couponsApi.createCoupon(payload);

    this.saving.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.saving.set(false);
        void this.router.navigate(['/coupons']);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(couponErrorMessage(error, 'تعذر حفظ الكوبون.'));
      },
    });
  }
}

function wholeNumber(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  if (value === null || value === '') {
    return null;
  }
  return Number.isInteger(Number(value)) ? null : { integer: true };
}

function notBeforeToday(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '');
  if (!value) {
    return null;
  }
  const picked = new Date(`${value}T00:00:00`);
  if (Number.isNaN(picked.getTime())) {
    return { date: true };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return picked < today ? { past: true } : null;
}
