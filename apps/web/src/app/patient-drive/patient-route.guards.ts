import { inject } from '@angular/core';
import { CanActivateFn, Params, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoService } from '@jsverse/transloco';
import { ActivePatientStore } from './active-patient.store';
import { PatientsService } from './patients.service';

/**
 * The URL names the patient (`/pacientes/:patientId/...`), and this guard makes the rest of the app
 * agree with it: it loads that patient into `ActivePatientStore`, which every patient screen and
 * the banner read from. A reload, a bookmark or a link shared between staff therefore lands on the
 * right record instead of depending on hidden in-memory selection.
 *
 * An unreadable id (deleted patient, mistyped link) sends the user to the patient list with a
 * message rather than leaving a blank workspace.
 */
export const patientRouteGuard: CanActivateFn = async (route) => {
  const patientId = route.paramMap.get('patientId');
  // Everything is injected up front: `inject()` only works synchronously, not after the await below.
  const store = inject(ActivePatientStore);
  const router = inject(Router);
  const patientsService = inject(PatientsService);
  const snackBar = inject(MatSnackBar);
  const transloco = inject(TranslocoService);

  if (patientId && store.patient()?.id === patientId) return true;

  try {
    if (!patientId) throw new Error('missing patient id');
    store.select(await patientsService.getById(patientId));
    return true;
  } catch {
    store.clear();
    snackBar.open(transloco.translate('patientDrive.notFound'), undefined, { duration: 5000 });
    return router.createUrlTree(['/pacientes']);
  }
};

/**
 * Keeps the old flat URLs (`/valoracion`, `/treatments/:id`, `/export`...) working. Those paths
 * never named a patient, so they forward to the same screen under the active patient's workspace;
 * with no active patient there is nowhere to forward to, so the user lands on the patient list and
 * is told why.
 */
export function legacyPatientRedirect(suffix: (params: Params) => string[]): CanActivateFn {
  return (route) => {
    const store = inject(ActivePatientStore);
    const router = inject(Router);
    const patientId = store.patient()?.id ?? store.restoredPatientId();

    if (!patientId) {
      inject(MatSnackBar).open(
        inject(TranslocoService).translate('patientDrive.selectPatientFirst'),
        undefined,
        { duration: 5000 }
      );
      return router.createUrlTree(['/pacientes']);
    }
    return router.createUrlTree(['/pacientes', patientId, ...suffix(route.params)]);
  };
}
