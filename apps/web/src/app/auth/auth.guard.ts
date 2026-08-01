import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.currentUser()) {
    await auth.restoreSession();
  }

  if (auth.currentUser()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};
