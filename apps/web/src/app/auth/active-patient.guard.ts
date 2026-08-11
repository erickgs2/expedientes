import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoService } from '@jsverse/transloco';
import { ActivePatientStore } from '../patient-drive/active-patient.store';
import { PatientsService } from '../patient-drive/patients.service';

/**
 * Guards routes that need a patient already selected in the Patient Drive (e.g. Historia
 * Clínica). Pairs with `authGuard` the same way `permissionGuard` does — this one only checks
 * `ActivePatientStore`, not authentication.
 *
 * The in-memory selection does not survive a page reload, so when it is empty the guard re-fetches
 * the patient id persisted for this browser session rather than bouncing the user out of a page
 * they were working on. It re-fetches instead of restoring a cached record so the recovered
 * patient is never stale, and drops the persisted id if the patient can no longer be read.
 *
 * A redirect always explains itself. Silently bouncing back to the patient list makes a perfectly
 * healthy screen — Exportar, Valoración, Tratamientos — look broken, which is exactly how it was
 * first reported.
 */
export const activePatientGuard: CanActivateFn = async () => {
  const activePatient = inject(ActivePatientStore);
  const patientsService = inject(PatientsService);
  const router = inject(Router);
  const snackBar = inject(MatSnackBar);
  const transloco = inject(TranslocoService);

  if (activePatient.patient()) {
    return true;
  }

  const restoredPatientId = activePatient.restoredPatientId();
  if (restoredPatientId) {
    try {
      activePatient.select(await patientsService.getById(restoredPatientId));
      return true;
    } catch {
      activePatient.clear();
    }
  }

  snackBar.open(transloco.translate('patientDrive.selectPatientFirst'), undefined, {
    duration: 5000,
  });
  return router.createUrlTree(['/patients']);
};
