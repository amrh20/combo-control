import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { LANDING_PAGES } from '../models/permission.model';
import { AuthService } from '../services/auth.service';

/** Where to send someone who is signed in but cannot open the requested page. */
export function landingPath(auth: AuthService): string {
  const page = LANDING_PAGES.find((entry) => auth.hasPermission(entry.permission));
  return page?.path ?? '/no-access';
}

/** Opens the first page this account is allowed to see. */
export const landingGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.whenReady().pipe(map(() => router.createUrlTree([landingPath(auth)])));
};

/**
 * Route `data.permission` is one key or a list (any match).
 * `data.permissionFallback` is used when the user is signed in but lacks the grant.
 */
export const permissionGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.whenReady().pipe(
    map(() => {
      if (!auth.isAuthenticated()) {
        return router.createUrlTree(['/login']);
      }
      const required = route.data['permission'] as string | string[] | undefined;
      if (!required || auth.allows(required)) {
        return true;
      }
      const fallback = route.data['permissionFallback'];
      const target = typeof fallback === 'string' ? fallback : landingPath(auth);
      return router.createUrlTree([target]);
    }),
  );
};
