import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, throwError } from 'rxjs';
import { SUPPRESS_404_TOAST } from '../historia-clinica/historia-clinica.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const snackBar = inject(MatSnackBar);

  return next(req).pipe(
    catchError((error) => {
      // A 404 the caller declared expected (e.g. "this patient has no historia clínica yet") is
      // still propagated so the caller can handle it — it just isn't reported to the user.
      const expected404 = error.status === 404 && req.context.get(SUPPRESS_404_TOAST);

      if (error.status === 401) {
        router.navigate(['/login']);
      } else if (!expected404) {
        const message = error.error?.error?.message ?? 'Unexpected error';
        snackBar.open(message, undefined, { duration: 4000 });
      }
      return throwError(() => error);
    })
  );
};
