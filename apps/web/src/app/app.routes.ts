import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

export const appRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent) },
  {
    path: 'admin/users',
    canActivate: [authGuard],
    loadComponent: () => import('./rbac-admin/users/user-list.component').then((m) => m.UserListComponent),
  },
];
