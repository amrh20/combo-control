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

  /** True when the captain is online and at least one assignment option is accepted. */
  isCaptainSelectable(captain: AssignableCaptain): boolean {
    return captain.isOnline && captain.options.some((option) => option.ok);
  }

  /** The full-trip override is offered only when that option is accepted. */
  canDelegateFullTrip(captain: AssignableCaptain): boolean {
    return this.bothOption(captain)?.ok === true;
  }

  /** The label names the duty this captain does not already have. */
  delegateLabel(captain: AssignableCaptain): string {
    if (captain.role === 'DELIVERY') {
      return 'تفويض الكابتن بتجميع الطلب (الرحلة كاملة)';
    }
    return 'تفويض الكابتن بتوصيل الطلب (الرحلة كاملة)';
  }

  selectedModeLabel(captain: AssignableCaptain): string {
    const option = this.delegateFullTrip ? this.bothOption(captain) : this.standardOption(captain);
    return assignmentModeLabel(option?.mode);
  }

  /**
   * Arabic reason shown when every option is rejected.
   * Offline captains are explained by the availability badge only.
   */
  getCaptainDisabledReason(captain: AssignableCaptain): string {
    if (!captain.isOnline) {
      return '';
    }

    const rejected = captain.options.find((option) => !option.ok && option.reason);
    return assignmentReasonLabel(rejected?.reason) || 'غير متاح للتعيين';
  }

  availability(captain: AssignableCaptain): CaptainAvailability {
    if (!captain.isOnline) {
      return 'offline';
    }
    if (captain.busyTaskId != null) {
      return 'busy';
    }
    if (captain.hasOffer) {
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
    this.delegateFullTrip = false;
    this.assignError.set(null);
  }

  confirmAssignment(): void {
    const captainId = this.selectedCaptainId();
    const orderId = this.orderId().trim();
    const captain = this.captains().find((item) => item.id === captainId);
    if (!orderId || !captainId || !captain || !this.isCaptainSelectable(captain) || this.submitting()) {
      return;
    }

    const fullTrip = this.delegateFullTrip && this.canDelegateFullTrip(captain);
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
