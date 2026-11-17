import { HttpInterceptorFn } from '@angular/common/http';
import { HANDLES_OWN_ERRORS } from './http-context';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { PlanUpgradeDialogComponent } from '../plan/plan-upgrade-dialog.component';
import { catchError, throwError } from 'rxjs';
import { SUPPRESS_404_TOAST } from '../historia-clinica/historia-clinica.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const snackBar = inject(MatSnackBar);
  const dialog = inject(MatDialog);

  return next(req).pipe(
    catchError((error) => {
      // The signed-out screens show every failure inline, including 401 (a wrong password while
      // accepting an invitation must not bounce to the sign-in page) and 402.
      if (req.context.get(HANDLES_OWN_ERRORS)) return throwError(() => error);

      // A 404 the caller declared expected (e.g. "this patient has no historia clínica yet") is
      // still propagated so the caller can handle it — it just isn't reported to the user.
      const expected404 = error.status === 404 && req.context.get(SUPPRESS_404_TOAST);

      // The login screen reports a blocked source, and a member of a clinic now on Free, itself, in
      // the user's language.
      const handledByLogin =
        (error.status === 429 || error.status === 403) && req.url.endsWith('/api/auth/login');
      // Restoring a session that the plan no longer allows just ends it; the guard sends to login.
      const planEndedSession =
        error.error?.error?.code === 'PLAN_MEMBER_INACTIVE' && !req.url.endsWith('/api/auth/login');

      if (error.status === 401 && req.url.startsWith('/api/plataforma')) {
        // The platform portal has its own sign-in.
        router.navigate(['/plataforma/login']);
      } else if (error.status === 401 || planEndedSession) {
        router.navigate(['/login']);
      } else if (error.status === 402 && error.error?.error?.code === 'PLAN_LIMIT') {
        // What the plan does not include gets an explanation and a way to Premium, not an error.
        if (dialog.openDialogs.every((ref) => !(ref.componentInstance instanceof PlanUpgradeDialogComponent))) {
          dialog.open(PlanUpgradeDialogComponent, { data: error.error.error.details, maxWidth: 440 });
        }
      } else if (!expected404 && !handledByLogin) {
        const message = error.error?.error?.message ?? 'Unexpected error';
        snackBar.open(message, undefined, { duration: 4000 });
      }
      return throwError(() => error);
    })
  );
};
