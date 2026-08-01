import { Routes } from '@angular/router';
// authGuard (./auth/auth.guard) is not yet applied to any route — Task 17 adds the first
// protected route (Patient Drive) and applies `canActivate: [authGuard]` there. Not imported
// here since an unused import would fail this repo's `noUnusedLocals` build setting.

export const appRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent) },
];
