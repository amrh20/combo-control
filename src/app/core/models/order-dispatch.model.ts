import { CaptainRole } from './captain.model';
import { AssignmentMode } from './ops-order.model';

/** Default duty vs the full-trip override offered for one order. */
export type AssignmentOptionKind = 'STANDARD' | 'BOTH';

/**
 * One way this captain can be assigned.
 * `STANDARD` is the captain's normal duty. `BOTH` is the manual full-trip override.
 */
export interface AssignmentOption {
  kind: AssignmentOptionKind;
  ok: boolean;
  reason: string | null;
  /** Present when the API accepts this option. */
  mode: AssignmentMode | null;
}

/** Captain row from `GET /v1/orders/{orderId}/assignable-captains`. */
export interface AssignableCaptain {
  id: string;
  fullName: string;
  phone: string;
  role: CaptainRole;
  isOnline: boolean;
  busyTaskId: string | null;
  hasOffer: boolean;
  options: AssignmentOption[];
}

/** Body for `POST /v1/orders/{orderId}/assign`. `overrideRole` is sent only for a full trip. */
export interface AssignCaptainPayload {
  captainId: string;
  overrideRole?: 'BOTH' | null;
}

/** Emitted after a dispatcher confirms a manual assignment. */
export interface CaptainAssignedEvent {
  captain: AssignableCaptain;
  overrideRole: 'BOTH' | null;
}

const ASSIGNMENT_REASON_LABELS: Readonly<Record<string, string>> = {
  ORDER_NOT_ASSIGNABLE: 'كابتن التوصيل والطلب لسه بيتجمع',
  CAPTAIN_CANNOT_DELIVER: 'دور الكابتن ما يغطيش الرحلة',
  CAPTAIN_OFFLINE: 'أوفلاين',
  CAPTAIN_BUSY: 'مشغول في رحلة',
  CAPTAIN_HAS_OFFER: 'لديه عرض معلق',
  CAPTAIN_BLOCKED: 'الحساب موقوف',
  OTHER_HUB: 'الكابتن تبع هب تاني',
  NOTHING_TO_COLLECT: 'كل المحلات سلّمت شنطها',
  NO_CAPTAIN_AVAILABLE: 'مفيش كابتن متاح',
};

/** Arabic label for an assignment rejection code. Unknown text is returned as-is. */
export function assignmentReasonLabel(reason: string | null | undefined): string {
  const value = reason?.trim() ?? '';
  if (!value) {
    return '';
  }
  return ASSIGNMENT_REASON_LABELS[value] ?? value;
}
