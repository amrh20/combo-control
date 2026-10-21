import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.whenReady().pipe(
    map(() => auth.isAuthenticated() || router.createUrlTree(['/login'])),
  );
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.whenReady().pipe(
    map(() => !auth.isAuthenticated() || router.createUrlTree(['/'])),
  );
};
