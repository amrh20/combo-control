import { Component, DestroyRef, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe, DecimalPipe, NgClass } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { PasswordToggleDirective } from '../../../core/directives/password-toggle.directive';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import {
  OpsOrderRow,
  SUB_ORDER_STATUS_CONFIG,
  SubOrderStatus,
  egpFromPiastres,
} from '../../../core/models/ops-order.model';
import { Permission } from '../../../core/models/permission.model';
import { AuthService } from '../../../core/services/auth.service';
import { HubService } from '../../../core/services/hub.service';
import { OpsOrderService } from '../../../core/services/ops-order.service';
import { categoryIconSrc, VendorCategoryService } from '../../../core/services/vendor-category.service';
import { VendorService, vendorErrorMessage } from '../../../core/services/vendor.service';
import {
  STORE_USER_ROLE_OPTIONS,
  StoreUser,
  StoreUserRole,
  storeUserRoleLabel,
  storeUserStatusLabel,
} from '../../../core/models/store-user.model';
import { StoreUsersService, storeUserErrorMessage } from '../../../core/services/store-users.service';
import {
  getEffectiveLiveStatus,
  getVendorInitials,
  LIVE_OVERRIDE_CONFIG,
  LIVE_STATUS_CONFIG,
  VendorProfile,
} from '../data/vendors.mock';

const ORDERS_PAGE_SIZE = 20;

@Component({
  selector: 'ctrl-vendor-details',
  standalone: true,
  imports: [
    NgClass,
    DatePipe,
    DecimalPipe,
    RouterLink,
    ReactiveFormsModule,
    TableModule,
    StatCardComponent,
    PasswordToggleDirective,
  ],
  templateUrl: './vendor-details.component.html',
  styleUrl: './vendor-details.component.scss',
})
export class VendorDetailsComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly categoryService = inject(VendorCategoryService);
  private readonly hubService = inject(HubService);
  private readonly vendorService = inject(VendorService);
  private readonly ordersApi = inject(OpsOrderService);
  private readonly storeUsersApi = inject(StoreUsersService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly orders = signal<OpsOrderRow[]>([]);
  readonly ordersLoading = signal(false);
  readonly ordersError = signal<string | null>(null);
  readonly ordersNextCursor = signal<string | null>(null);
  private readonly ordersCursor = signal<string | undefined>(undefined);
  private readonly ordersBackStack = signal<(string | undefined)[]>([]);
  private ordersRequest = 0;

  readonly liveStatusConfig = LIVE_STATUS_CONFIG;
  readonly liveOverrideConfig = LIVE_OVERRIDE_CONFIG;
  readonly subOrderStatusConfig = SUB_ORDER_STATUS_CONFIG;
  readonly currency = 'ج.م';
  readonly canReadOrders = computed(() => this.auth.hasPermission(Permission.OrdersRead));
  readonly ordersPageNumber = computed(() => this.ordersBackStack().length + 1);

  private readonly vendorSignal = signal<VendorProfile | null>(null);
  readonly vendor = this.vendorSignal.asReadonly();

  readonly liveStatus = computed(() => {
    const v = this.vendor();
    return v ? getEffectiveLiveStatus(v) : 'closed';
  });

  readonly detailsTab = signal<'profile' | 'accounts'>('profile');
  readonly storeUsers = signal<StoreUser[]>([]);
  readonly storeUsersLoading = signal(false);
  readonly storeUsersError = signal<string | null>(null);
  readonly userModalOpen = signal(false);
  readonly editingUser = signal<StoreUser | null>(null);
  readonly userSaving = signal(false);
  readonly userFormError = signal<string | null>(null);
  readonly userActionId = signal<string | null>(null);
  readonly pendingDelete = signal<StoreUser | null>(null);
  readonly roleOptions = STORE_USER_ROLE_OPTIONS;
  readonly roleLabel = storeUserRoleLabel;
  readonly statusLabel = storeUserStatusLabel;
  private storeUsersRequest = 0;

  readonly userForm = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    phone: ['', [Validators.required, Validators.pattern(/^01[0125]\d{8}$/)]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    role: ['CASHIER' as StoreUserRole, Validators.required],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/vendors']);
      return;
    }
    this.vendorService
      .getCategories()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
    this.loadVendor(id);
  }

  getInitials(name: string): string {
    return getVendorInitials(name);
  }

  categoryName(categoryId: string): string {
    return (
      this.categoryService.nameOf(categoryId) ||
      this.vendor()?.categoryName ||
      '—'
    );
  }

  hubName(hubId: string): string {
    return this.hubService.nameOf(hubId) || '—';
  }

  logoSrc(url: string): string {
    return categoryIconSrc(url);
  }

  ratingLabel(score: number | null | undefined): string {
    if (score === null || score === undefined || Number.isNaN(score)) {
      return 'لا يوجد';
    }
    return score.toFixed(2);
  }

  goBack(): void {
    this.router.navigate(['/vendors']);
  }

  selectTab(tab: 'profile' | 'accounts'): void {
    this.detailsTab.set(tab);
    if (tab === 'accounts') {
      this.loadStoreUsers();
    }
  }

  reloadStoreUsers(): void {
    this.loadStoreUsers();
  }

  openCreateUser(): void {
    this.editingUser.set(null);
    this.userFormError.set(null);
    this.userForm.reset({ fullName: '', phone: '', password: '', role: 'CASHIER' });
    this.userForm.controls.password.setValidators([Validators.required, Validators.minLength(6)]);
    this.userForm.controls.password.updateValueAndValidity();
    this.userModalOpen.set(true);
  }

  openEditUser(user: StoreUser): void {
    this.editingUser.set(user);
    this.userFormError.set(null);
    this.userForm.reset({
      fullName: user.fullName,
      phone: user.phone,
      password: '',
      role: user.role,
    });
    this.userForm.controls.password.setValidators([Validators.minLength(6)]);
    this.userForm.controls.password.updateValueAndValidity();
    this.userModalOpen.set(true);
  }

  closeUserModal(): void {
    if (this.userSaving()) {
      return;
    }
    this.userModalOpen.set(false);
    this.editingUser.set(null);
    this.userFormError.set(null);
  }

  saveUser(): void {
    const storeId = this.vendor()?.id;
    if (!storeId || this.userForm.invalid || this.userSaving()) {
      this.userForm.markAllAsTouched();
      return;
    }

    const value = this.userForm.getRawValue();
    const editing = this.editingUser();
    this.userSaving.set(true);
    this.userFormError.set(null);

    const request = editing
      ? this.storeUsersApi.updateUser(storeId, editing.id, {
          fullName: value.fullName.trim(),
          phone: value.phone.trim(),
          role: value.role,
          password: value.password.trim() || undefined,
        })
      : this.storeUsersApi.createUser(storeId, {
          fullName: value.fullName.trim(),
          phone: value.phone.trim(),
          password: value.password,
          role: value.role,
        });

    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.userSaving.set(false);
        this.userModalOpen.set(false);
        this.editingUser.set(null);
        this.loadStoreUsers();
      },
      error: (error: unknown) => {
        this.userSaving.set(false);
        this.userFormError.set(
          storeUserErrorMessage(error, editing ? 'تعذر حفظ الحساب.' : 'تعذر إضافة المستخدم.'),
        );
      },
    });
  }

  askDeleteUser(user: StoreUser): void {
    this.pendingDelete.set(user);
  }

  cancelDeleteUser(): void {
    this.pendingDelete.set(null);
  }

  confirmDeleteUser(): void {
    const storeId = this.vendor()?.id;
    const user = this.pendingDelete();
    if (!storeId || !user || this.userActionId()) {
      return;
    }
    this.userActionId.set(user.id);
    this.storeUsersApi
      .deleteUser(storeId, user.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.userActionId.set(null);
          this.pendingDelete.set(null);
          this.loadStoreUsers();
        },
        error: (error: unknown) => {
          this.userActionId.set(null);
          this.storeUsersError.set(storeUserErrorMessage(error, 'تعذر حذف الحساب.'));
        },
      });
  }

  toggleSuspend(user: StoreUser): void {
    const storeId = this.vendor()?.id;
    if (!storeId || this.userActionId()) {
      return;
    }
    const next = user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    this.userActionId.set(user.id);
    this.storeUsersApi
      .updateStatus(storeId, user.id, next)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.userActionId.set(null);
          this.loadStoreUsers();
        },
        error: (error: unknown) => {
          this.userActionId.set(null);
          this.storeUsersError.set(storeUserErrorMessage(error, 'تعذر تحديث حالة الحساب.'));
        },
      });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.pendingDelete() && !this.userActionId()) {
      this.pendingDelete.set(null);
      return;
    }
    this.closeUserModal();
  }

  orderTotal(order: OpsOrderRow): number {
    return egpFromPiastres(order.subOrderTotal ?? 0);
  }

  shopStatusLabel(status: SubOrderStatus | null | undefined): string {
    if (!status || !(status in this.subOrderStatusConfig)) {
      return '—';
    }
    return this.subOrderStatusConfig[status].labelAr;
  }

  shopStatusTone(status: SubOrderStatus | null | undefined): string {
    if (!status || !(status in this.subOrderStatusConfig)) {
      return 'neutral';
    }
    return this.subOrderStatusConfig[status].tone;
  }

  openOrder(orderId: string): void {
    void this.router.navigate(['/orders', orderId]);
  }

  reloadOrders(): void {
    const vendorId = this.vendor()?.id;
    if (!vendorId) {
      return;
    }
    this.loadOrders(vendorId, this.ordersCursor());
  }

  ordersNext(): void {
    const vendorId = this.vendor()?.id;
    const next = this.ordersNextCursor();
    if (!vendorId || !next || this.ordersLoading()) {
      return;
    }
    this.ordersBackStack.update((stack) => [...stack, this.ordersCursor()]);
    this.ordersCursor.set(next);
    this.loadOrders(vendorId, next);
  }

  ordersPrevious(): void {
    const vendorId = this.vendor()?.id;
    const stack = this.ordersBackStack();
    if (!vendorId || stack.length === 0 || this.ordersLoading()) {
      return;
    }
    const previous = stack[stack.length - 1];
    this.ordersBackStack.set(stack.slice(0, -1));
    this.ordersCursor.set(previous);
    this.loadOrders(vendorId, previous);
  }

  private loadVendor(id: string): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.vendorService
      .getVendorById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (found) => {
          this.loading.set(false);
          this.vendorSignal.set(structuredClone(found));
          this.ordersCursor.set(undefined);
          this.ordersBackStack.set([]);
          this.storeUsers.set([]);
          this.pendingDelete.set(null);
          this.closeUserModal();
          this.loadOrders(found.id);
          if (this.detailsTab() === 'accounts') {
            this.loadStoreUsers();
          }
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.vendorSignal.set(null);
          this.orders.set([]);
          this.storeUsers.set([]);
          this.loadError.set(vendorErrorMessage(error, 'تعذر تحميل المتجر.'));
        },
      });
  }

  private loadOrders(vendorId: string, cursor?: string): void {
    if (!this.canReadOrders()) {
      return;
    }
    const request = ++this.ordersRequest;
    this.ordersLoading.set(true);
    this.ordersError.set(null);
    this.ordersApi
      .listOrders({ vendorId, cursor, limit: ORDERS_PAGE_SIZE })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          if (request !== this.ordersRequest) {
            return;
          }
          this.orders.set(page.items);
          this.ordersNextCursor.set(page.nextCursor);
          this.ordersLoading.set(false);
        },
        error: () => {
          if (request !== this.ordersRequest) {
            return;
          }
          this.orders.set([]);
          this.ordersNextCursor.set(null);
          this.ordersLoading.set(false);
          this.ordersError.set('تعذر تحميل سجل الطلبات.');
        },
      });
  }

  fieldInvalid(name: 'fullName' | 'phone' | 'password' | 'role'): boolean {
    const control = this.userForm.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  private loadStoreUsers(): void {
    const storeId = this.vendor()?.id;
    if (!storeId) {
      return;
    }
    const request = ++this.storeUsersRequest;
    this.storeUsersLoading.set(true);
    this.storeUsersError.set(null);
    this.storeUsersApi
      .listUsers(storeId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (users) => {
          if (request !== this.storeUsersRequest) {
            return;
          }
          this.storeUsers.set(users);
          this.storeUsersLoading.set(false);
        },
        error: () => {
          if (request !== this.storeUsersRequest) {
            return;
          }
          this.storeUsers.set([]);
          this.storeUsersLoading.set(false);
          this.storeUsersError.set('تعذر تحميل حسابات الدخول.');
        },
      });
  }
}
