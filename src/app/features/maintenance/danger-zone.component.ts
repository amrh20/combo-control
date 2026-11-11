import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { finalize } from 'rxjs';
import { httpErrorToastMessage } from '../../core/utils/api-error-message';
import { ERASE_CONFIRMATION, MaintenanceService } from '../../core/services/maintenance.service';

@Component({
  selector: 'ctrl-danger-zone',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './danger-zone.component.html',
})
export class DangerZoneComponent {
  private readonly maintenance = inject(MaintenanceService);
  private readonly messages = inject(MessageService);

  readonly confirmationPhrase = ERASE_CONFIRMATION;
  readonly confirm = new FormControl('', { nonNullable: true });
  readonly submitting = signal(false);

  get canReset(): boolean {
    return this.confirm.value === this.confirmationPhrase && !this.submitting();
  }

  resetDatabase(): void {
    if (!this.canReset) {
      return;
    }

    this.submitting.set(true);
    this.maintenance
      .resetDatabase()
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          this.confirm.setValue('');
          this.messages.add({
            severity: 'success',
            summary: 'منطقة الخطر',
            detail: 'تم مسح قاعدة البيانات بنجاح',
            life: 5000,
          });
        },
        error: (error: unknown) => {
          // HTTP 400 is already toasted by the error interceptor.
          if (error instanceof HttpErrorResponse && error.status === 400) {
            return;
          }
          this.messages.add({
            severity: 'error',
            summary: 'منطقة الخطر',
            detail: httpErrorToastMessage(error, 'تعذر مسح قاعدة البيانات. حاول مرة أخرى.'),
            life: 6000,
          });
        },
      });
  }
}
