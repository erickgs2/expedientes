import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, throwError } from 'rxjs';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const snackBar = inject(MatSnackBar);

  return next(req).pipe(
    catchError((error) => {
      if (error.status === 401) {
        router.navigate(['/login']);
      } else {
        const message = error.error?.error?.message ?? 'Unexpected error';
        snackBar.open(message, undefined, { duration: 4000 });
      }
      return throwError(() => error);
    })
  );
};
