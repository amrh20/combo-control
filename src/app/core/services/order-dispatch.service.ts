import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../api-config';
import { CaptainRole } from '../models/captain.model';
import {
  AssignCaptainPayload,
  AssignableCaptain,
  AssignmentOption,
  AssignmentOptionKind,
  assignmentReasonLabel,
} from '../models/order-dispatch.model';
import { AssignmentMode } from '../models/ops-order.model';

const ROLES = new Set<CaptainRole>(['COLLECTOR', 'DELIVERY', 'BOTH']);
const MODES = new Set<AssignmentMode>(['COLLECT_ONLY', 'DELIVER_ONLY', 'COLLECT_AND_DELIVER']);

interface AssignmentOptionRecord {
  kind?: string | null;
  type?: string | null;
  code?: string | null;
  role?: string | null;
  /** `null` is the captain's normal duty. `'BOTH'` is the full-trip override. */
  overrideRole?: 'BOTH' | null;
  standard?: boolean | null;
  mode?: string | null;
  ok?: boolean | null;
  reason?: string | null;
}

interface AssignableCaptainRecord {
  id?: string | null;
  fullName?: string | null;
  name?: string | null;
  phone?: string | null;
  role?: string | null;
  isOnline?: boolean | null;
  busyTaskId?: string | null;
  hasOffer?: boolean | null;
  options?: AssignmentOptionRecord[] | null;
}

interface AssignmentErrorDetails {
  message?: string;
  reason?: string;
}

interface AssignmentErrorBody {
  code?: string;
  message?: string;
  details?: string | AssignmentErrorDetails;
  error?: {
    code?: string;
    message?: string;
    details?: string | AssignmentErrorDetails;
  };
}

@Injectable({ providedIn: 'root' })
export class OrderDispatchService {
  private readonly http = inject(HttpClient);

  /**
   * Captains a dispatcher may assign by hand.
   * The list is returned in API order. Nothing here ranks or auto-picks a captain.
   */
  getAssignableCaptains(orderId: string): Observable<AssignableCaptain[]> {
    return this.http
      .get<unknown>(`${API_BASE_URL}/v1/orders/${encodeURIComponent(orderId)}/assignable-captains`)
      .pipe(map(unwrapAssignableCaptains));
  }

  /** `POST /v1/orders/{orderId}/assign` */
  assignCaptain(orderId: string, payload: AssignCaptainPayload): Observable<void> {
    return this.http.post<void>(
      `${API_BASE_URL}/v1/orders/${encodeURIComponent(orderId)}/assign`,
      payload,
    );
  }

  /** `POST /v1/tasks/{taskId}/reassign` — offers the same trip to another captain. */
  reassignTask(taskId: string, payload: AssignCaptainPayload): Observable<void> {
    return this.http.post<void>(
      `${API_BASE_URL}/v1/tasks/${encodeURIComponent(taskId)}/reassign`,
      payload,
    );
  }

  /** `POST /v1/tasks/{taskId}/cancel` */
  cancelTask(taskId: string, reason: string): Observable<void> {
    return this.http.post<void>(`${API_BASE_URL}/v1/tasks/${encodeURIComponent(taskId)}/cancel`, {
      reason: reason.trim(),
    });
  }
}

/**
 * Copy for a failed manual assignment.
 * Prefers the backend sentence (`message`, or `details` when it is already text).
 * `null` when the body has neither a sentence nor a known rejection.
 */
export function assignmentFailureMessage(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }

  const body = error.error;
  const sentence = assignmentErrorSentence(body);
  if (sentence) {
    return sentence;
  }

  if (!body || typeof body !== 'object') {
    return null;
  }

  const record = body as AssignmentErrorBody;
  const code = record.error?.code ?? record.code ?? '';
  const reason = detailsReason(record.error?.details) || detailsReason(record.details);

  if (code === 'CONFLICT' || (error.status === 409 && !code)) {
    return 'هذا الطلب له رحلة نشطة بالفعل';
  }

  if (code === 'INVALID_STATE') {
    return 'لا يمكن تنفيذ هذا الإجراء في الحالة الحالية.';
  }

  if (error.status === 422 || code === 'ASSIGNMENT_REJECTED') {
    const label = assignmentReasonLabel(reason);
    return label && label !== reason ? label : 'تم رفض التعيين.';
  }

  return null;
}

/** Human text from `error.message` or `error.details`. Codes are left for the caller to replace. */
function assignmentErrorSentence(body: unknown): string {
  if (typeof body === 'string') {
    return displayText(body);
  }
  if (!body || typeof body !== 'object') {
    return '';
  }

  const record = body as AssignmentErrorBody;
  return (
    displayText(record.error?.message) ||
    displayText(record.message) ||
    displayText(record.details) ||
    displayText(record.error?.details)
  );
}

function detailsReason(details: string | AssignmentErrorDetails | undefined): string {
  if (!details || typeof details === 'string') {
    return '';
  }
  return details.reason?.trim() ?? '';
}

function displayText(value: unknown): string {
  if (typeof value === 'string') {
    const text = value.trim();
    return text && !/^[A-Z0-9_]+$/.test(text) ? text : '';
  }
  if (!value || typeof value !== 'object') {
    return '';
  }
  const record = value as AssignmentErrorDetails;
  return displayText(record.message) || displayText(record.reason);
}

/** Toast copy when cancelling a trip is rejected. */
export function taskCancelFailureMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'تعذر إلغاء الرحلة. حاول مرة أخرى.';
  }
  const body = (error.error ?? null) as AssignmentErrorBody | null;
  const code = body?.error?.code ?? body?.code ?? '';
  if (code === 'INVALID_STATE') {
    return 'لا يمكن إلغاء الرحلة بعد استلام أي شنطة. أعد تعيين الكابتن بدل الإلغاء.';
  }
  return 'تعذر إلغاء الرحلة. حاول مرة أخرى.';
}

function unwrapAssignableCaptains(body: unknown): AssignableCaptain[] {
  return asRows(body).flatMap((row) => {
    const captain = toAssignableCaptain(row);
    return captain ? [captain] : [];
  });
}

function asRows(body: unknown): AssignableCaptainRecord[] {
  if (Array.isArray(body)) {
    return body as AssignableCaptainRecord[];
  }
  if (!body || typeof body !== 'object') {
    return [];
  }

  const record = body as { items?: unknown; captains?: unknown; data?: unknown };
  if (Array.isArray(record.items)) {
    return record.items as AssignableCaptainRecord[];
  }
  if (Array.isArray(record.captains)) {
    return record.captains as AssignableCaptainRecord[];
  }
  if (Array.isArray(record.data)) {
    return record.data as AssignableCaptainRecord[];
  }
  return [];
}

function toAssignableCaptain(row: AssignableCaptainRecord): AssignableCaptain | null {
  const id = row.id?.trim() ?? '';
  if (!id) {
    return null;
  }

  const role = asRole(row.role);
  const busyTaskId = row.busyTaskId?.trim() || null;

  return {
    id,
    fullName: row.fullName?.trim() || row.name?.trim() || '',
    phone: row.phone?.trim() ?? '',
    role,
    isOnline: row.isOnline === true,
    busyTaskId,
    hasOffer: row.hasOffer === true,
    options: toOptions(row.options, role),
  };
}

function toOptions(
  records: AssignmentOptionRecord[] | null | undefined,
  captainRole: CaptainRole,
): AssignmentOption[] {
  let standard: AssignmentOption | undefined;
  let both: AssignmentOption | undefined;

  for (const record of records ?? []) {
    const kind = optionKind(record, captainRole);
    if (!kind) {
      continue;
    }

    const option: AssignmentOption = {
      kind,
      ok: record.ok === true,
      reason: record.reason?.trim() || null,
      mode: asMode(record.mode),
    };

    if (kind === 'STANDARD' && !standard) {
      standard = option;
    }
    if (kind === 'BOTH' && !both) {
      both = option;
    }
  }

  return [standard, both].filter((option): option is AssignmentOption => option !== undefined);
}

function optionKind(
  record: AssignmentOptionRecord,
  captainRole: CaptainRole,
): AssignmentOptionKind | null {
  const marker = `${record.kind ?? record.type ?? record.code ?? ''}`.trim().toUpperCase();

  if (record.overrideRole === 'BOTH' || marker === 'BOTH') {
    return 'BOTH';
  }
  if (record.overrideRole === null || record.standard === true || marker === 'STANDARD') {
    return 'STANDARD';
  }
  if (record.role === 'BOTH' && captainRole !== 'BOTH') {
    return 'BOTH';
  }
  if ((record.role && record.role === captainRole) || marker === captainRole) {
    return 'STANDARD';
  }
  return null;
}

function asRole(value: string | null | undefined): CaptainRole {
  return value && ROLES.has(value as CaptainRole) ? (value as CaptainRole) : 'DELIVERY';
}

function asMode(value: string | null | undefined): AssignmentMode | null {
  return value && MODES.has(value as AssignmentMode) ? (value as AssignmentMode) : null;
}
