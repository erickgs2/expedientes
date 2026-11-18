import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PlatformService } from './platform.service';

/** Platform screens need a full platform session (password and TOTP). */
export const platformGuard: CanActivateFn = async () => {
  const platform = inject(PlatformService);
  if (!platform.admin()) await platform.restore();
  return platform.admin() ? true : inject(Router).createUrlTree(['/plataforma/login']);
};
