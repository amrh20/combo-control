import { DecimalPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MenuItem, MessageService } from 'primeng/api';
import { StepsModule } from 'primeng/steps';
import { ToastModule } from 'primeng/toast';
import {
  CartProblem,
  OpsOrderingHub,
  OpsOrderingSubZone,
  OpsOrderCalculateResponse,
  OpsPlaceOrderPayload,
} from '../../../core/models/ops-create-order.model';
import { piastresToEgp } from '../../../core/models/zone.model';
import {
  OpsCreateOrderService,
  createOrderErrorMessage,
  readCartProblemsFromError,
  readConflictCustomerId,
} from '../../../core/services/ops-create-order.service';
import { formatCartProblems } from '../../../core/utils/cart-problem.utils';
import { OrderSetupStepComponent } from './order-setup-step/order-setup-step.component';
import { OrderShoppingStepComponent } from './order-shopping-step/order-shopping-step.component';
import { OpsOrderWizardService } from './ops-order-wizard.service';

@Component({
  selector: 'ctrl-create-order',
  standalone: true,
  imports: [DecimalPipe, StepsModule, ToastModule, OrderSetupStepComponent, OrderShoppingStepComponent],
  providers: [MessageService, OpsOrderWizardService],
  templateUrl: './create-order.component.html',
})
export class CreateOrderComponent {
  private readonly ops = inject(OpsCreateOrderService);
  private readonly wizard = inject(OpsOrderWizardService);
  private readonly messages = inject(MessageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly setup = viewChild(OrderSetupStepComponent);
  private calculateGeneration = 0;

  readonly steps: MenuItem[] = [{ label: 'الإعداد' }, { label: 'التسوق' }, { label: 'المراجعة' }];
  readonly activeStep = signal(0);

  readonly hubs = signal<OpsOrderingHub[]>([]);
  readonly subZones = signal<OpsOrderingSubZone[]>([]);
  readonly lookupsLoading = signal(true);
  readonly submitting = signal(false);
  readonly setupAttempted = signal(false);
  readonly cartProblems = signal<CartProblem[]>([]);

  readonly calculating = signal(false);
  readonly calculateError = signal<string | null>(null);
  readonly quote = signal<OpsOrderCalculateResponse | null>(null);

  readonly draft = toSignal(this.wizard.draft$, { initialValue: this.wizard.snapshot() });
  readonly cartProblemMessage = computed(() => formatCartProblems(this.cartProblems()));

  readonly canSubmit = computed(
    () => !this.submitting() && !this.calculating() && !!this.quote() && !this.calculateError(),
  );

  constructor() {
    this.loadLookups();
  }

  cartGroups() {
    return Object.values(this.draft().cartByShopId);
  }

  egp(piastres: number): number {
    return piastresToEgp(piastres);
  }

  goNext(): void {
    if (this.activeStep() === 0) {
      this.setupAttempted.set(true);
      const setup = this.setup();
      if (!setup?.valid()) {
        setup?.markTouched();
        this.toast('error', 'أكمل بيانات العميل والموقع قبل المتابعة.');
        return;
      }
    }
    if (this.activeStep() === 1 && this.cartGroups().every((group) => group.items.length === 0)) {
      this.toast('error', 'أضف صنفاً واحداً على الأقل.');
      return;
    }
    const next = Math.min(this.activeStep() + 1, 2);
    this.activeStep.set(next);
    if (next === 2) {
      this.refreshQuote();
    }
  }

  goBack(): void {
    const prev = Math.max(this.activeStep() - 1, 0);
    this.activeStep.set(prev);
    if (prev !== 2) {
      this.clearQuote();
    }
  }

  dispatch(): void {
    if (!this.canSubmit()) {
      return;
    }
    const payload = this.buildPayload();
    if (!payload) {
      this.toast('error', 'الطلب غير مكتمل.');
      return;
    }
    this.submitting.set(true);
    this.cartProblems.set([]);
    this.ops
      .placeOrder(payload, crypto.randomUUID())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (order) => {
          this.submitting.set(false);
          this.toast('success', `تم إرسال الطلب ${order.orderNumber} إلى التشغيل.`);
          this.wizard.reset();
          this.activeStep.set(0);
          this.setupAttempted.set(false);
          this.clearQuote();
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          const conflictId = readConflictCustomerId(error);
          if (conflictId) {
            this.wizard.patchCustomer({ customerId: conflictId });
          }
          const problems = readCartProblemsFromError(error);
          if (problems.length > 0) {
            this.cartProblems.set(problems);
          }
          this.toast('error', createOrderErrorMessage(error));
        },
      });
  }

  private refreshQuote(): void {
    const payload = this.buildPayload();
    if (!payload) {
      this.calculating.set(false);
      this.quote.set(null);
      this.calculateError.set('الطلب غير مكتمل.');
      return;
    }
    const generation = ++this.calculateGeneration;
    this.calculating.set(true);
    this.calculateError.set(null);
    this.quote.set(null);
    this.cartProblems.set([]);
    this.ops
      .calculateOrder(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (quote) => {
          if (generation !== this.calculateGeneration) {
            return;
          }
          this.calculating.set(false);
          this.quote.set(quote);
          this.calculateError.set(null);
        },
        error: (error: unknown) => {
          if (generation !== this.calculateGeneration) {
            return;
          }
          this.calculating.set(false);
          this.quote.set(null);
          const problems = readCartProblemsFromError(error);
          if (problems.length > 0) {
            this.cartProblems.set(problems);
          }
          this.calculateError.set(createOrderErrorMessage(error));
        },
      });
  }

  private clearQuote(): void {
    this.calculateGeneration++;
    this.calculating.set(false);
    this.quote.set(null);
    this.calculateError.set(null);
  }

  private buildPayload(): OpsPlaceOrderPayload | null {
    const draft = this.wizard.snapshot();
    const items = Object.values(draft.cartByShopId).flatMap((group) =>
      group.items.map((item) => ({
        productId: item.productId,
        vendorId: group.vendorId,
        quantity: item.quantity,
        options: item.optionIds,
      })),
    );
    if (items.length === 0 || !draft.location.subZoneId || !draft.location.hubId) {
      return null;
    }
    const customerId = draft.customer.customerId.trim();
    return {
      dropOffAddress: draft.location.addressDetails.trim(),
      subZoneId: draft.location.subZoneId,
      hubId: draft.location.hubId,
      items,
      ...(customerId
        ? { customerId }
        : {
            customerName: draft.customer.name.trim(),
            customerPhone: draft.customer.phone.trim(),
          }),
    };
  }

  private loadLookups(): void {
    this.lookupsLoading.set(true);
    let hubsLoaded = false;
    let zonesLoaded = false;
    const finish = () => {
      if (hubsLoaded && zonesLoaded) {
        this.lookupsLoading.set(false);
      }
    };
    this.ops
      .getHubs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (hubs) => {
          this.hubs.set(hubs);
          hubsLoaded = true;
          finish();
        },
        error: () => {
          hubsLoaded = true;
          finish();
          this.toast('error', 'تعذر تحميل الشوارع.');
        },
      });
    this.ops
      .getSubZones()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (zones) => {
          this.subZones.set(zones);
          zonesLoaded = true;
          finish();
        },
        error: () => {
          zonesLoaded = true;
          finish();
          this.toast('error', 'تعذر تحميل مناطق التوصيل.');
        },
      });
  }

  private toast(severity: 'success' | 'error', detail: string): void {
    this.messages.add({ severity, summary: severity === 'success' ? 'تم' : 'تنبيه', detail, life: 5000 });
  }
}
