import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { PasswordToggleDirective } from '../../../core/directives/password-toggle.directive';
import { AuthService, MfaRequiredError, isInvalidCredentials } from '../../../core/services/auth.service';

@Component({
  selector: 'ctrl-login',
  standalone: true,
  imports: [ReactiveFormsModule, PasswordToggleDirective],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  submit(): void {
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: () => {
        void this.router.navigateByUrl('/');
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(this.messageFor(error));
      },
    });
  }

  private messageFor(error: unknown): string {
    if (isInvalidCredentials(error)) {
      return 'بيانات الدخول غير صحيحة';
    }
    if (error instanceof MfaRequiredError) {
      return 'الحساب يحتاج رمز التحقق بخطوتين قبل الدخول.';
    }
    return 'تعذر إتمام تسجيل الدخول. حاول مرة أخرى.';
  }
}
