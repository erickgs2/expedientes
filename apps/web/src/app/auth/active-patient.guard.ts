import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ActivePatientStore } from '../patient-drive/active-patient.store';

/**
 * Guards routes that need a patient already selected in the Patient Drive (e.g. Historia
 * Clínica). Pairs with `authGuard` the same way `permissionGuard` does — this one only checks
 * `ActivePatientStore`, not authentication.
 */
export const activePatientGuard: CanActivateFn = () => {
  const activePatient = inject(ActivePatientStore);
  const router = inject(Router);

  if (activePatient.patient()) {
    return true;
  }

  return router.createUrlTree(['/patients']);
};
