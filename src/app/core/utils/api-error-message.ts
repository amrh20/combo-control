import { HttpErrorResponse } from '@angular/common/http';

interface ApiErrorDetail {
  path?: string;
  message?: string;
  code?: string;
}

interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  message?: string;
}

/** Known English API validation messages → Arabic for toast display. */
const API_MESSAGE_AR: Record<string, string> = {
  'Must be an Egyptian mobile number': 'رقم الموبايل غير صحيح. تأكد من إدخال 11 رقماً (مثال: 01XXXXXXXXX).',
};

/** Prefers `error.details[].message`, then `error.message`, then top-level `message`. */
export function httpErrorToastMessage(error: unknown, fallback = 'طلب غير صالح. راجع البيانات وحاول مرة أخرى.'): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }

  const body = (error.error ?? null) as ApiErrorPayload | null;
  const details = body?.error?.details;
  if (Array.isArray(details) && details.length > 0) {
    const messages = details
      .map((item) => detailMessage(item))
      .filter((text): text is string => !!text)
      .map(localizeApiMessage);
    if (messages.length > 0) {
      return messages.join(' — ');
    }
  }

  const nested = body?.error?.message?.trim() ?? '';
  if (nested) {
    return localizeApiMessage(nested);
  }

  const top = body?.message?.trim() ?? '';
  if (top) {
    return localizeApiMessage(top);
  }

  return fallback;
}

function detailMessage(item: unknown): string | null {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const message = (item as ApiErrorDetail).message?.trim();
  return message || null;
}

function localizeApiMessage(message: string): string {
  return API_MESSAGE_AR[message] ?? message;
}
