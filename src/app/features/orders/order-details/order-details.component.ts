import { DatePipe, DecimalPipe, NgClass } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { EMPTY, Observable, catchError, debounceTime, filter, map, switchMap, timer } from 'rxjs';
import { PermissionDirective } from '../../../core/directives/permission.directive';
import {
  AddOrderItemModalSubmit,
  CANCELLABLE_ORDER_STATUSES,
  ORDER_STATUS_CONFIG,
  OpsOrder,
  OpsOrderItem,
  OpsSubOrder,
  OpsTrip,
  OrderStatus,
  SUB_ORDER_STATUS_CONFIG,
  ShopStatusAction,
  TASK_STATUS_CONFIG,
  actorTypeLabel,
  assignmentModeLabel,
  canForceCompleteOrder,
  canReassignTrip,
  egpFromPiastres,
  eventNoteLabel,
  eventTypeLabel,
  formatAddress,
  isActiveTrip,
  isPhoneMasked,
  itemsEditable,
  lineTotalPiastres,
  orderStatusLabel,
  paymentMethodLabel,
  shopStatusActions,
  shopSubtotalPiastres,
  tripCaptainLabel,
  tripDeclineReason,
  tripOfferDeclined,
} from '../../../core/models/ops-order.model';
import { AuthService } from '../../../core/services/auth.service';
import {
  OrderDispatchService,
  taskCancelFailureMessage,
} from '../../../core/services/order-dispatch.service';
import {
  OpsCatalogProduct,
  catalogPrimaryVariantSelection,
  catalogUnitPricePiastres,
  catalogVariantFieldLabel,
} from '../../../core/models/ops-create-order.model';
import { egpToPiastres, piastresToEgp } from '../../../core/models/zone.model';
import { displayImage } from '../../../core/services/product.service';
import { OpsCreateOrderService } from '../../../core/services/ops-create-order.service';
import {
  OpsOrderService,
  isStaleVersion,
  orderMutationMessage,
} from '../../../core/services/ops-order.service';
import { AddOrderItemModalComponent } from '../add-order-item-modal/add-order-item-modal.component';
import { AssignCaptainModalComponent } from '../assign-captain-modal/assign-captain-modal.component';

/** Silent refresh of the open order on the live board. */
const LIVE_ORDER_POLL_MS = 5_000;

type DetailSection = 'shops' | 'delivery' | 'trips' | 'finance' | 'history';

interface OrderPriority {
  icon: string;
  title: string;
  hint: string;
  section: DetailSection;
  tone: 'primary' | 'warning' | 'success' | 'danger' | 'neutral';
}

const ORDER_PRIORITIES: Record<OrderStatus, OrderPriority> = {
  PLACED: {
    icon: 'pi-shopping-cart',
    title: 'ابدأ متابعة المتاجر',
    hint: 'راجع الأصناف وأكّد بدء التحضير لكل متجر.',
    section: 'shops',
    tone: 'primary',
  },
  CONSOLIDATING: {
    icon: 'pi-box',
    title: 'تابع اكتمال التجميع',
    hint: 'حدّث المتاجر الجاهزة وتحقق من وصول الطلبات إلى المكان.',
    section: 'shops',
    tone: 'warning',
  },
  READY_AT_HUB: {
    icon: 'pi-user-plus',
    title: 'الطلب جاهز للتوصيل',
    hint: 'عيّن كابتن متاح وابدأ رحلة التوصيل.',
    section: 'trips',
    tone: 'primary',
  },
  ASSIGNED: {
    icon: 'pi-clock',
    title: 'بانتظار تحرك الكابتن',
    hint: 'راجع حالة الرحلة وتابع قبول الكابتن.',
    section: 'trips',
    tone: 'warning',
  },
  EN_ROUTE: {
    icon: 'pi-truck',
    title: 'الطلب في الطريق',
    hint: 'تابع الكابتن وبيانات التسليم.',
    section: 'trips',
    tone: 'primary',
  },
  DELIVERED: {
    icon: 'pi-check-circle',
    title: 'تم تسليم الطلب',
    hint: 'لا توجد إجراءات تشغيلية مطلوبة.',
    section: 'history',
    tone: 'success',
  },
  CANCELLED: {
    icon: 'pi-ban',
    title: 'الطلب ملغي',
    hint: 'راجع سبب الإلغاء والرسوم عند الحاجة.',
    section: 'delivery',
    tone: 'danger',
  },
  FAILED: {
    icon: 'pi-exclamation-triangle',
    title: 'فشل تسليم الطلب',
    hint: 'راجع الرحلة وسجل الأحداث لمعرفة السبب.',
    section: 'trips',
    tone: 'danger',
  },
};

@Component({
  selector: 'ctrl-order-details',
  standalone: true,
  imports: [
    NgClass,
    DatePipe,
    DecimalPipe,
    FormsModule,
    PermissionDirective,
    ToastModule,
    SelectModule,
    InputNumberModule,
    AssignCaptainModalComponent,
    AddOrderItemModalComponent,
  ],
  providers: [MessageService],
  templateUrl: './order-details.component.html',
  styleUrl: './order-details.component.scss',
  host: {
    class: 'order-details-host',
    '[class.order-details-host--embedded]': 'embedded()',
  },
})
export class OrderDetailsComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly ordersApi = inject(OpsOrderService);
  private readonly catalogApi = inject(OpsCreateOrderService);
  private editCatalogGeneration = 0;
  private readonly dispatch = inject(OrderDispatchService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly messages = inject(MessageService);
  private loadGeneration = 0;

  /** When set (from the live board), takes precedence over the route param. */
  readonly orderId = input<string | null>(null);
  readonly embedded = input(false);
  /** Poll the open order so a captain decline shows without a manual refresh. */
  readonly live = input(false);
  readonly orderChanged = output<OpsOrder>();

  readonly orderStatusConfig = ORDER_STATUS_CONFIG;
  readonly subOrderStatusConfig = SUB_ORDER_STATUS_CONFIG;
  readonly taskStatusConfig = TASK_STATUS_CONFIG;
  readonly currency = 'ج.م';
  readonly egp = egpFromPiastres;
  readonly invoiceHref = (url: string | null): string => (url ? displayImage(url) : '');
  readonly shopActions = shopStatusActions;
  readonly canEditItems = itemsEditable;
  readonly tripIsActive = isActiveTrip;
  readonly tripDeclined = tripOfferDeclined;
  readonly declineReason = tripDeclineReason;
  readonly canReassign = canReassignTrip;
  readonly captainLabel = tripCaptainLabel;
  readonly modeLabel = assignmentModeLabel;
  readonly eventLabel = eventTypeLabel;
  readonly actorLabel = actorTypeLabel;
  readonly noteLabel = eventNoteLabel;
  readonly statusLabel = orderStatusLabel;
  readonly payLabel = paymentMethodLabel;
  readonly addressText = formatAddress;
  readonly lineTotal = lineTotalPiastres;
  readonly shopTotal = shopSubtotalPiastres;

  private readonly routeId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('id'))),
    { initialValue: null as string | null },
  );

  readonly order = signal<OpsOrder | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly pending = signal(false);
  readonly editingItemId = signal<string | null>(null);
  readonly rejectingSubOrderId = signal<string | null>(null);
  readonly showCancel = signal(false);
  readonly cancellingTaskId = signal<string | null>(null);
  readonly isDriverModalOpen = signal(false);
  readonly reassignTaskId = signal<string | null>(null);
  readonly addItemSubOrderId = signal<string | null>(null);
  readonly addItemError = signal<string | null>(null);
  readonly editCatalogProduct = signal<OpsCatalogProduct | null>(null);
  readonly editCatalogLoading = signal(false);
  readonly activeSection = signal<DetailSection>('shops');
  /** Shop cards opened from «عرض التفاصيل» or by the operator. */
  readonly openShopIds = signal<ReadonlySet<string>>(new Set());
  private readonly shopDetails = viewChild<ElementRef<HTMLElement>>('shopDetails');

  editQuantity = 1;
  editPriceEgp = 0;
  /** option id per variant group while editing a line item */
  editVariantOptions: Record<string, string> = {};
  readonly variantFieldLabel = catalogVariantFieldLabel;
  rejectReason = '';
  cancelReason = '';
  chargeFee = false;
  taskCancelReason = '';

  readonly resolvedOrderId = computed(() => this.orderId() || this.routeId() || null);

  readonly itemCount = computed(() => {
    const order = this.order();
    if (!order) {
      return 0;
    }
    return order.subOrders.reduce(
      (sum, sub) =>
        sum + sub.items.reduce((count, item) => (item.isRemoved ? count : count + item.quantity), 0),
      0,
    );
  });

  readonly consolidationProgress = computed(() => {
    const order = this.order();
    if (!order) {
      return { verified: 0, total: 0, percent: 0 };
    }
    const active = order.subOrders.filter(
      (sub) => sub.status !== 'REJECTED' && sub.status !== 'CANCELLED',
    );
    const verified = active.filter((sub) =>
      sub.status === 'VERIFIED' || sub.status === 'HANDED_TO_DRIVER' || sub.status === 'DELIVERED',
    ).length;
    const total = active.length;
    return {
      verified,
      total,
      percent: total === 0 ? 0 : Math.round((verified / total) * 100),
    };
  });

  readonly activeTrip = computed(
    () => this.order()?.trips.find((trip) => isActiveTrip(trip)) ?? null,
  );

  readonly phoneMasked = computed(() => isPhoneMasked(this.order()?.customer.phone));

  readonly canOfferCaptain = computed(() => {
    const order = this.order();
    return (
      !!order &&
      CANCELLABLE_ORDER_STATUSES.includes(order.status) &&
      !order.trips.some((trip) => canReassignTrip(trip))
    );
  });

  /** Trip that needs a captain offer again (declined offer or live trip). Shown in the priority bar. */
  readonly priorityDispatchTrip = computed((): OpsTrip | null => {
    const order = this.order();
    if (!order || !CANCELLABLE_ORDER_STATUSES.includes(order.status)) {
      return null;
    }
    if (!order.trips.some((trip) => canReassignTrip(trip))) {
      return null;
    }
    return (
      order.trips.find((trip) => tripOfferDeclined(trip)) ??
      order.trips.find((trip) => canReassignTrip(trip)) ??
      null
    );
  });

  readonly canCancelOrder = computed(() => {
    const order = this.order();
    return (
      !!order &&
      this.auth.hasPermission('orders.cancel') &&
      CANCELLABLE_ORDER_STATUSES.includes(order.status)
    );
  });

  readonly canForceComplete = computed(() => {
    const order = this.order();
    return !!order && this.auth.hasPermission('orders.assign') && canForceCompleteOrder(order);
  });

  readonly displayTotal = computed(() => {
    const order = this.order();
    if (!order) {
      return 0;
    }
    return egpFromPiastres(order.finalTotal ?? order.estimatedTotal);
  });

  readonly priority = computed(() => {
    const order = this.order();
    return order ? ORDER_PRIORITIES[order.status] : null;
  });

  /** True when every shop that still needs an action is expanded. */
  readonly shopDetailsOpen = computed(() => {
    const order = this.order();
    if (!order?.subOrders.length) {
      return false;
    }
    const open = this.openShopIds();
    return this.detailShopIds(order).every((id) => open.has(id));
  });

  constructor() {
    effect(() => {
      const id = this.resolvedOrderId();
      untracked(() => {
        if (!id) {
          this.order.set(null);
          this.loading.set(false);
          this.loadError.set(null);
          return;
        }
        this.load(id);
      });
    });

    timer(0, LIVE_ORDER_POLL_MS)
      .pipe(
        switchMap(() => {
          if (!this.live() || this.pending() || this.loading()) {
            return EMPTY;
          }
          const id = this.resolvedOrderId();
          if (!id || this.order()?.id !== id) {
            return EMPTY;
          }
          return this.fetchLiveSnapshot(id);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((order) => {
        if (this.pending()) {
          return;
        }
        this.apply(order);
      });

    this.ordersApi.orderTouched$
      .pipe(
        debounceTime(80),
        filter((touchedId) => {
          if (this.loading() || this.pending()) {
            return false;
          }
          const id = this.resolvedOrderId();
          return Boolean(id) && touchedId === id;
        }),
        switchMap((id) => this.fetchLiveSnapshot(id)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((order) => {
        if (this.pending()) {
          return;
        }
        this.apply(order);
      });
  }

  goBack(): void {
    void this.router.navigate(['/orders']);
  }

  showSection(section: DetailSection): void {
    this.activeSection.set(section);
  }

  /** Opens the shops that still need an action. Collapses them when they are already open. */
  toggleShopDetails(): void {
    const order = this.order();
    if (!order?.subOrders.length) {
      return;
    }
    this.activeSection.set('shops');
    if (this.shopDetailsOpen()) {
      this.openShopIds.set(new Set());
      return;
    }
    this.openShopIds.set(new Set(this.detailShopIds(order)));
    setTimeout(() => {
      this.shopDetails()?.nativeElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  isShopOpen(shopId: string): boolean {
    return this.openShopIds().has(shopId);
  }

  onShopToggle(shopId: string, event: Event): void {
    const open = event.target instanceof HTMLDetailsElement && event.target.open;
    this.openShopIds.update((current) => {
      if (current.has(shopId) === open) {
        return current;
      }
      const next = new Set(current);
      if (open) {
        next.add(shopId);
      } else {
        next.delete(shopId);
      }
      return next;
    });
  }

  retry(): void {
    const id = this.resolvedOrderId();
    if (id) {
      this.load(id);
    }
  }

  optionLabels(item: OpsOrderItem): string {
    return item.options.map((option) => option.option).filter(Boolean).join(' · ');
  }

  isEditing(itemId: string): boolean {
    return this.editingItemId() === itemId;
  }

  startEdit(item: OpsOrderItem, sub: OpsSubOrder): void {
    this.editingItemId.set(item.id);
    this.editQuantity = item.quantity;
    this.editPriceEgp = piastresToEgp(item.unitPrice);
    this.editCatalogProduct.set(null);
    this.editVariantOptions = Object.fromEntries(
      item.options.map((option) => [option.variantId, option.optionId]),
    );
    this.loadEditCatalogProduct(sub.vendorId, item);
  }

  cancelEdit(): void {
    this.editingItemId.set(null);
    this.editCatalogProduct.set(null);
    this.editVariantOptions = {};
  }

  editOptionForVariant(variantId: string): string {
    return this.editVariantOptions[variantId] ?? '';
  }

  setEditVariantOption(variantId: string, optionId: string): void {
    this.editVariantOptions = { ...this.editVariantOptions, [variantId]: optionId };
    this.syncEditPriceFromCatalog();
  }

  saveEdit(item: OpsOrderItem): void {
    const order = this.order();
    const quantity = Math.round(Number(this.editQuantity));
    if (!order || quantity < 1 || quantity > 50) {
      this.toast('error', 'الكمية يجب أن تكون بين 1 و 50.');
      return;
    }
    const priceEgp = Number(this.editPriceEgp);
    if (!Number.isFinite(priceEgp) || priceEgp < 0) {
      this.toast('error', 'أدخل سعراً صالحاً.');
      return;
    }
    const product = this.editCatalogProduct();
    const payload: {
      version: number;
      quantity: number;
      customPrice: number;
      options?: string[];
      variantId?: string;
      optionId?: string;
    } = {
      version: order.version,
      quantity,
      customPrice: egpToPiastres(priceEgp),
    };
    if (product) {
      const options = product.variants
        .map((variant) => this.editVariantOptions[variant.id])
        .filter((id): id is string => Boolean(id));
      const complete = product.variants.every((variant) => {
        if (variant.options.length === 0) {
          return true;
        }
        const picked = this.editVariantOptions[variant.id];
        return Boolean(picked && variant.options.some((option) => option.id === picked));
      });
      if (!complete) {
        this.toast('error', 'اختر جميع خيارات المنتج.');
        return;
      }
      const withOptions = product.variants.filter((row) => row.options.length > 0);
      if (withOptions.length > 1) {
        payload.options = options;
      } else if (withOptions.length === 1) {
        const primary = catalogPrimaryVariantSelection(product, this.editVariantOptions);
        if (primary) {
          payload.variantId = primary.variantId;
          payload.optionId = primary.optionId;
        }
      }
    }
    this.mutate(this.ordersApi.editItem(order.id, item.id, payload), 'تم تحديث الصنف.');
  }

  openAddProduct(sub: OpsSubOrder): void {
    this.addItemError.set(null);
    this.addItemSubOrderId.set(sub.id);
  }

  closeAddProduct(): void {
    if (this.pending()) {
      return;
    }
    this.addItemSubOrderId.set(null);
    this.addItemError.set(null);
  }

  addProductSubOrder(): OpsSubOrder | null {
    const id = this.addItemSubOrderId();
    const order = this.order();
    if (!id || !order) {
      return null;
    }
    return order.subOrders.find((sub) => sub.id === id) ?? null;
  }

  confirmAddProduct(payload: AddOrderItemModalSubmit): void {
    const order = this.order();
    const sub = this.addProductSubOrder();
    if (!order || !sub) {
      return;
    }
    this.addItemError.set(null);
    this.mutate(
      this.ordersApi.addShopItem(order.id, sub.vendorId, {
        version: order.version,
        productId: payload.productId,
        quantity: payload.quantity,
        options: payload.options,
        customPrice: payload.customPrice,
        variantId: payload.variantId,
        optionId: payload.optionId,
      }),
      'تمت إضافة المنتج.',
      () => {
        this.addItemSubOrderId.set(null);
        this.addItemError.set(null);
      },
      (message) => this.addItemError.set(message),
    );
  }

  removeItem(item: OpsOrderItem): void {
    const order = this.order();
    if (!order || !window.confirm('إزالة هذا الصنف من الطلب؟')) {
      return;
    }
    this.mutate(
      this.ordersApi.editItem(order.id, item.id, { version: order.version, isRemoved: true }),
      'تمت إزالة الصنف.',
    );
  }

  restoreItem(item: OpsOrderItem): void {
    const order = this.order();
    if (!order) {
      return;
    }
    this.mutate(
      this.ordersApi.editItem(order.id, item.id, { version: order.version, isRemoved: false }),
      'تمت استعادة الصنف.',
    );
  }

  runShopAction(sub: OpsSubOrder, action: ShopStatusAction): void {
    if (action.needsReason) {
      this.rejectingSubOrderId.set(sub.id);
      this.rejectReason = '';
      return;
    }
    const order = this.order();
    if (!order) {
      return;
    }
    this.mutate(
      this.ordersApi.setSubOrderStatus(order.id, sub.id, { status: action.status }),
      'تم تحديث حالة المتجر.',
    );
  }

  confirmReject(sub: OpsSubOrder): void {
    const order = this.order();
    const reason = this.rejectReason.trim();
    if (!order) {
      return;
    }
    if (reason.length < 2) {
      this.toast('error', 'اكتب سبب الرفض (حرفان على الأقل).');
      return;
    }
    this.mutate(
      this.ordersApi.setSubOrderStatus(order.id, sub.id, { status: 'REJECTED', reason }),
      'تم رفض طلب المتجر.',
    );
  }

  cancelReject(): void {
    this.rejectingSubOrderId.set(null);
    this.rejectReason = '';
  }

  openCancel(): void {
    this.showCancel.set(true);
    this.cancelReason = '';
    this.chargeFee = false;
  }

  closeCancel(): void {
    this.showCancel.set(false);
  }

  confirmCancel(): void {
    const order = this.order();
    const reason = this.cancelReason.trim();
    if (!order) {
      return;
    }
    if (reason.length < 2 || reason.length > 300) {
      this.toast('error', 'سبب الإلغاء من حرفين إلى 300 حرف.');
      return;
    }
    this.mutate(
      this.ordersApi.cancelOrder(order.id, { reason, chargeFee: this.chargeFee }),
      'تم إلغاء الطلب.',
    );
  }

  forceComplete(): void {
    const order = this.order();
    if (!order || !this.canForceComplete()) {
      return;
    }
    if (
      !window.confirm(
        'هل أنت متأكد من إنهاء الطلب وتسجيل العهدة على الكابتن يدوياً؟',
      )
    ) {
      return;
    }
    this.mutate(this.ordersApi.forceComplete(order.id), 'تم إنهاء التوصيل وتسجيل الطلب كمُسلّم.');
  }

  openAssign(): void {
    this.reassignTaskId.set(null);
    this.isDriverModalOpen.set(true);
  }

  openReassign(trip: OpsTrip): void {
    this.reassignTaskId.set(trip.id);
    this.isDriverModalOpen.set(true);
  }

  closeDriverModal(): void {
    this.isDriverModalOpen.set(false);
    this.reassignTaskId.set(null);
  }

  onCaptainAssigned(): void {
    this.closeDriverModal();
    this.reload();
  }

  startCancelTrip(trip: OpsTrip): void {
    this.cancellingTaskId.set(trip.id);
    this.taskCancelReason = '';
  }

  closeCancelTrip(): void {
    this.cancellingTaskId.set(null);
  }

  confirmCancelTrip(trip: OpsTrip): void {
    const reason = this.taskCancelReason.trim();
    if (reason.length < 2 || reason.length > 500) {
      this.toast('error', 'سبب إلغاء الرحلة من حرفين إلى 500 حرف.');
      return;
    }
    if (this.pending()) {
      return;
    }
    this.pending.set(true);
    this.dispatch
      .cancelTask(trip.id, reason)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.pending.set(false);
          this.cancellingTaskId.set(null);
          this.reload();
          this.toast('success', 'تم إلغاء الرحلة.');
        },
        error: (error: unknown) => {
          this.pending.set(false);
          this.toast('error', taskCancelFailureMessage(error));
        },
      });
  }

  private load(id: string): void {
    const generation = ++this.loadGeneration;
    this.loading.set(true);
    this.loadError.set(null);
    this.order.set(null);
    this.resetForms();
    this.ordersApi
      .getOrder(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (order) => {
          if (generation !== this.loadGeneration) {
            return;
          }
          this.loading.set(false);
          this.apply(order);
        },
        error: () => {
          if (generation !== this.loadGeneration) {
            return;
          }
          this.loading.set(false);
          this.loadError.set('تعذر تحميل الطلب.');
        },
      });
  }

  private reload(): void {
    const id = this.order()?.id ?? this.resolvedOrderId();
    if (!id) {
      return;
    }
    const generation = ++this.loadGeneration;
    this.ordersApi
      .getOrder(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (order) => {
          if (generation !== this.loadGeneration) {
            return;
          }
          this.apply(order);
        },
        error: () => {
          if (generation !== this.loadGeneration) {
            return;
          }
          this.toast('error', 'تعذر تحديث الطلب.');
        },
      });
  }

  /** Background refresh for the live board; drops stale responses after navigation. */
  private fetchLiveSnapshot(orderId: string): Observable<OpsOrder> {
    const generation = this.loadGeneration;
    return this.ordersApi.getOrder(orderId).pipe(
      map((order) => ({ order, generation })),
      filter(({ generation: seen }) => seen === this.loadGeneration),
      map(({ order }) => order),
      catchError(() => EMPTY),
    );
  }

  private mutate(
    request: Observable<OpsOrder>,
    success: string,
    onSuccess?: () => void,
    onErrorMessage?: (message: string) => void,
  ): void {
    if (this.pending()) {
      return;
    }
    this.pending.set(true);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (order) => {
        this.pending.set(false);
        this.resetForms();
        this.apply(order);
        onSuccess?.();
        this.toast('success', success);
      },
      error: (error: unknown) => {
        this.pending.set(false);
        if (isStaleVersion(error)) {
          this.toast('warn', orderMutationMessage(error));
          this.reload();
          return;
        }
        const message = orderMutationMessage(error);
        if (onErrorMessage) {
          onErrorMessage(message);
        } else {
          this.toast('error', message);
        }
      },
    });
  }

  private syncEditPriceFromCatalog(): void {
    const product = this.editCatalogProduct();
    if (!product) {
      return;
    }
    this.editPriceEgp = piastresToEgp(catalogUnitPricePiastres(product, this.editVariantOptions));
  }

  private loadEditCatalogProduct(shopId: string, item: OpsOrderItem): void {
    const generation = ++this.editCatalogGeneration;
    this.editCatalogLoading.set(true);
    const search = item.productId?.trim() || item.name.trim();
    this.catalogApi
      .searchShopProducts(shopId, search)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (products) => {
          if (generation !== this.editCatalogGeneration) {
            return;
          }
          this.editCatalogLoading.set(false);
          const product =
            (item.productId
              ? products.find((row) => row.id === item.productId)
              : undefined) ??
            products.find((row) => row.name.trim() === item.name.trim()) ??
            products[0] ??
            null;
          this.editCatalogProduct.set(product);
          if (product && item.options.length === 0) {
            this.editVariantOptions = Object.fromEntries(
              product.variants
                .map((variant) => [variant.id, variant.options[0]?.id] as const)
                .filter((entry): entry is [string, string] => Boolean(entry[1])),
            );
          }
        },
        error: () => {
          if (generation !== this.editCatalogGeneration) {
            return;
          }
          this.editCatalogLoading.set(false);
          this.editCatalogProduct.set(null);
        },
      });
  }

  private apply(order: OpsOrder): void {
    const changedOrder = this.order()?.id !== order.id;
    this.order.set(order);
    if (changedOrder) {
      this.activeSection.set(ORDER_PRIORITIES[order.status].section);
      this.openShopIds.set(new Set());
    }
    this.orderChanged.emit(order);
  }

  private resetForms(): void {
    this.editingItemId.set(null);
    this.editCatalogProduct.set(null);
    this.editVariantOptions = {};
    this.addItemSubOrderId.set(null);
    this.addItemError.set(null);
    this.rejectingSubOrderId.set(null);
    this.showCancel.set(false);
    this.cancellingTaskId.set(null);
    this.isDriverModalOpen.set(false);
    this.reassignTaskId.set(null);
  }

  /** Shops the operator still has to act on. Falls back to every shop when none are actionable. */
  private detailShopIds(order: OpsOrder): string[] {
    const actionable = order.subOrders.filter((sub) => shopStatusActions(sub.status).length > 0);
    const shops = actionable.length ? actionable : order.subOrders;
    return shops.map((sub) => sub.id);
  }

  private toast(severity: 'success' | 'error' | 'warn', detail: string): void {
    this.messages.add({
      severity,
      summary: severity === 'success' ? 'تم' : severity === 'warn' ? 'تنبيه' : 'تعذر التنفيذ',
      detail,
      life: 5000,
    });
  }
}
