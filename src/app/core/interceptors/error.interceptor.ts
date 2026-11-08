import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { catchError, throwError } from 'rxjs';
import { httpErrorToastMessage } from '../utils/api-error-message';

/**
 * Shows a toast for HTTP 400 responses using `error.details[].message`
 * (falls back to `error.message`).
 */
export const errorInterceptor: HttpInterceptorFn = (request, next) => {
  const messages = inject(MessageService);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 400) {
        messages.add({
          severity: 'error',
          summary: 'خطأ في البيانات',
          detail: httpErrorToastMessage(error),
          life: 6000,
        });
      }
      return throwError(() => error);
    }),
  );
};
