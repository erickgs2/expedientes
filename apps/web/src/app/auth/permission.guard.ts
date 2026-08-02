import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Route guard for a single `module:action` permission. Pairs with `authGuard`, which handles the
 * "not logged in at all" case; this one decides whether an authenticated user may see the screen,
 * and sends them back to the patient drive if not.
 *
 * It restores the session itself rather than relying on `authGuard` having already done so: Angular
 * runs the guards in a `canActivate` array concurrently, not in sequence, so on a direct page load
 * of a guarded URL this guard would otherwise read an empty permission list and redirect a user who
 * is in fact allowed. `restoreSession()` de-duplicates the overlapping calls.
 */
export function permissionGuard(module: string, action: string): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.currentUser()) {
      await auth.restoreSession();
    }

    if (auth.hasPermission(module, action)) {
      return true;
    }

    return router.createUrlTree(['/patients']);
  };
}
