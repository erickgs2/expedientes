import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PlatformService } from './platform.service';

/** Platform screens need a full platform session (password and TOTP). */
export const platformGuard: CanActivateFn = async () => {
  // inject() only works before the first await: everything the guard needs is taken here.
  const platform = inject(PlatformService);
  const router = inject(Router);
  if (!platform.admin()) await platform.restore();
  return platform.admin() ? true : router.createUrlTree(['/plataforma/login']);
};
