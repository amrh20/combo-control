import { HttpErrorResponse } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, effect, inject, input, output, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import {
  AssignCaptainPayload,
  AssignableCaptain,
  AssignmentOption,
  CaptainAssignedEvent,
  assignmentReasonLabel,
} from '../../../core/models/order-dispatch.model';
import { assignmentModeLabel } from '../../../core/models/ops-order.model';
import {
  OrderDispatchService,
  assignmentFailureMessage,
} from '../../../core/services/order-dispatch.service';

const DEFAULT_ASSIGNMENT_ERROR = 'تعذر تعيين الكابتن. حاول مرة أخرى.';
const SAME_ORDER_OFFER_MESSAGE = 'الكابتن لديه عرض معلق لهذا الطلب بالفعل';

type CaptainAvailability = 'available' | 'offer' | 'busy' | 'offline';

@Component({
  selector: 'ctrl-assign-captain-modal',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet, ToastModule],
  providers: [MessageService],
  templateUrl: './assign-captain-modal.component.html',
  styleUrl: './assign-captain-modal.component.scss',
})
export class AssignCaptainModalComponent {
  private readonly dispatch = inject(OrderDispatchService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly messages = inject(MessageService);
  private loadRequest = 0;

  readonly orderId = input('');
  /** When set, the confirm action reassigns this trip instead of creating one. */
  readonly taskId = input<string | null>(null);
  /**
   * Captain who already holds the pending offer on this trip (from order details).
   * Used when the assignable-captains payload lacks offer order/task ids.
   */
  readonly offerCaptainId = input<string | null>(null);
  readonly open = input(false);

  readonly closed = output<void>();
  readonly assigned = output<CaptainAssignedEvent>();

  /** Captains returned for this order. Order is the API order — the dispatcher picks. */
  readonly captains = signal<AssignableCaptain[]>([]);
  readonly selectedCaptainId = signal<string | null>(null);
  /** Full-trip override. Sent as `overrideRole: 'BOTH'` only when checked. */
  delegateFullTrip = false;

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  /** Backend rejection from the assign request, shown in the modal banner. */
  readonly assignError = signal<string | null>(null);
  readonly submitting = signal(false);

  constructor() {
    effect(() => {
      const isOpen = this.open();
      const orderId = this.orderId().trim();
      if (!isOpen || !orderId) {
        return;
      }
      untracked(() => this.loadCaptains(orderId));
    });
  }

  isCaptainSelected(captainId: string): boolean {
    return this.selectedCaptainId() === captainId;
  }

  /**
   * True when this captain's pending offer is for the order/trip we are assigning right now.
   * Prefer API `offerOrderId` / `offerTaskId`; fall back to the parent-supplied offer captain.
   */
  hasOfferForCurrentOrder(captain: AssignableCaptain): boolean {
    if (!captain.hasOffer) {
      return false;
    }

    const orderId = this.orderId().trim();
    const taskId = this.taskId()?.trim() ?? '';
    const offerOrderId = captain.offerOrderId?.trim() ?? '';
    const offerTaskId = captain.offerTaskId?.trim() ?? '';

    if (offerOrderId && orderId && offerOrderId === orderId) {
      return true;
    }
    if (offerTaskId && taskId && offerTaskId === taskId) {
      return true;
    }

    const pendingCaptainId = this.offerCaptainId()?.trim() ?? '';
    return Boolean(pendingCaptainId && pendingCaptainId === captain.id);
  }

  /**
   * True when the API accepts at least one assignment mode for this captain.
   * External captains (`hasApp === false`) have no app presence — online/offline must not block them.
   */
  isCaptainSelectable(captain: AssignableCaptain): boolean {
    if (this.hasOfferForCurrentOrder(captain)) {
      return false;
    }
    if (this.requiresFullTrip(captain)) {
      const both = this.bothOption(captain);
      return Boolean(both && (both.ok || both.reason === 'CAPTAIN_OFFLINE'));
    }
    if (!captain.options.some((option) => option.ok)) {
      return false;
    }
    return captain.isOnline;
  }

  /** The full-trip override is offered only when that option is accepted. */
  canDelegateFullTrip(captain: AssignableCaptain): boolean {
    return this.bothOption(captain)?.ok === true;
  }

  /** Non-app captains cannot update stop statuses, so ops always assign the full trip. */
  requiresFullTrip(captain: AssignableCaptain): boolean {
    return captain.hasApp === false;
  }

  /** The label names the duty this captain does not already have. */
  delegateLabel(captain: AssignableCaptain): string {
    if (captain.role === 'DELIVERY') {
      return 'تفويض الكابتن بتجميع الطلب (الرحلة كاملة)';
    }
    return 'تفويض الكابتن بتوصيل الطلب (الرحلة كاملة)';
  }

  selectedModeLabel(captain: AssignableCaptain): string {
    const fullTrip = this.requiresFullTrip(captain) || this.delegateFullTrip;
    const option = fullTrip ? this.bothOption(captain) : this.standardOption(captain);
    return assignmentModeLabel(option?.mode);
  }

  /**
   * Arabic reason shown when every option is rejected.
   * Scenario A (same-order offer) uses only the dedicated warning — no other validation codes.
   * Offline captains are explained by the availability badge only.
   */
  getCaptainDisabledReason(captain: AssignableCaptain): string {
    if (this.hasOfferForCurrentOrder(captain)) {
      return SAME_ORDER_OFFER_MESSAGE;
    }
    // Offline is shown via the availability badge for app captains only.
    if (captain.hasApp !== false && !captain.isOnline) {
      return '';
    }

    const rejected = captain.options.find((option) => !option.ok && option.reason);
    if (captain.hasApp === false && rejected?.reason === 'CAPTAIN_OFFLINE') {
      return '';
    }
    return assignmentReasonLabel(rejected?.reason) || 'غير متاح للتعيين';
  }

  /** Warning style for Scenario A; error style for other rejection reasons. */
  isSameOrderOfferReason(captain: AssignableCaptain): boolean {
    return this.hasOfferForCurrentOrder(captain);
  }

  availability(captain: AssignableCaptain): CaptainAvailability {
    // Non-app captains have no live presence; never treat them as offline for UI.
    if (captain.hasApp !== false && !captain.isOnline) {
      return 'offline';
    }
    if (captain.busyTaskId != null) {
      return 'busy';
    }
    // Scenario A: hide the generic "لديه عرض" badge — the dedicated message covers it.
    if (captain.hasOffer && !this.hasOfferForCurrentOrder(captain)) {
      return 'offer';
    }
    return 'available';
  }

  availabilityLabel(captain: AssignableCaptain): string {
    switch (this.availability(captain)) {
      case 'available':
        return 'متاح';
      case 'offer':
        return 'لديه عرض';
      case 'busy':
        return 'مشغول';
      case 'offline':
        return 'أوفلاين';
    }
  }

  selectCaptain(captain: AssignableCaptain): void {
    if (!this.isCaptainSelectable(captain) || this.submitting()) {
      return;
    }

    if (this.selectedCaptainId() === captain.id) {
      this.selectedCaptainId.set(null);
      this.delegateFullTrip = false;
      return;
    }

    this.selectedCaptainId.set(captain.id);
    this.delegateFullTrip = this.requiresFullTrip(captain);
    this.assignError.set(null);
  }

  confirmAssignment(): void {
    const captainId = this.selectedCaptainId();
    const orderId = this.orderId().trim();
    const captain = this.captains().find((item) => item.id === captainId);
    if (!orderId || !captainId || !captain || !this.isCaptainSelectable(captain) || this.submitting()) {
      return;
    }

    const fullTrip =
      this.requiresFullTrip(captain) ||
      (this.delegateFullTrip && this.canDelegateFullTrip(captain));
    const payload: AssignCaptainPayload = { captainId };
    if (fullTrip) {
      payload.overrideRole = 'BOTH';
    }

    const taskId = this.taskId()?.trim() ?? '';
    const request = taskId
      ? this.dispatch.reassignTask(taskId, payload)
      : this.dispatch.assignCaptain(orderId, payload);

    this.submitting.set(true);
    this.assignError.set(null);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => {
          this.submitting.set(false);
          this.assignError.set(null);
          this.messages.add({
            severity: 'success',
            summary: 'تم التعيين',
            detail: taskId ? 'تم إرسال عرض الرحلة للكابتن الجديد.' : 'تم تعيين الكابتن على الطلب.',
            life: 4000,
          });
          this.assigned.emit({
            captain,
            overrideRole: payload.overrideRole ?? null,
          });
          this.closed.emit();
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.assignError.set(assignmentErrorText(error));
        },
      });
  }

  close(): void {
    if (this.submitting()) {
      return;
    }
    this.closed.emit();
  }

  retry(): void {
    const orderId = this.orderId().trim();
    if (orderId) {
      this.loadCaptains(orderId);
    }
  }

  private loadCaptains(orderId: string): void {
    const requestId = ++this.loadRequest;
    this.loading.set(true);
    this.loadError.set(null);
    this.assignError.set(null);
    this.captains.set([]);
    this.selectedCaptainId.set(null);
    this.delegateFullTrip = false;

    this.dispatch
      .getAssignableCaptains(orderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (captains) => {
          if (requestId !== this.loadRequest) {
            return;
          }
          this.captains.set(captains);
          this.loading.set(false);
        },
        error: () => {
          if (requestId !== this.loadRequest) {
            return;
          }
          this.loading.set(false);
          this.loadError.set('تعذر تحميل قائمة الكباتن.');
        },
      });
  }

  private standardOption(captain: AssignableCaptain): AssignmentOption | undefined {
    return captain.options.find((option) => option.kind === 'STANDARD');
  }

  private bothOption(captain: AssignableCaptain): AssignmentOption | undefined {
    return captain.options.find((option) => option.kind === 'BOTH');
  }
}

/**
 * Banner copy for a failed assign call.
 * On `HttpErrorResponse`, the 422 sentence is `error.error.error.message`.
 * That sentence is shown as returned.
 */
function assignmentErrorText(error: unknown): string {
  const message = backendAssignmentMessage(error);
  if (message) {
    return message;
  }
  return assignmentFailureMessage(error) ?? DEFAULT_ASSIGNMENT_ERROR;
}

function backendAssignmentMessage(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse) || !error.error || typeof error.error !== 'object') {
    return null;
  }

  const body = error.error as {
    message?: unknown;
    error?: { message?: unknown };
  };
  const message = body.error?.message ?? body.message;
  if (typeof message !== 'string') {
    return null;
  }

  const text = message.trim();
  return text || null;
}
