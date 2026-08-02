import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { permissionGuard } from './auth/permission.guard';
import { activePatientGuard } from './auth/active-patient.guard';

export const appRoutes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'patients' },
  { path: 'login', loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent) },
  {
    path: 'patients',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./patient-drive/patient-search.component').then((m) => m.PatientSearchComponent),
  },
  {
    path: 'admin/users',
    canActivate: [authGuard, permissionGuard('rbac-admin', 'view')],
    loadComponent: () => import('./rbac-admin/users/user-list.component').then((m) => m.UserListComponent),
  },
  {
    path: 'admin/roles',
    canActivate: [authGuard, permissionGuard('rbac-admin', 'view')],
    loadComponent: () => import('./rbac-admin/roles/role-list.component').then((m) => m.RoleListComponent),
  },
  {
    path: 'historia-clinica',
    canActivate: [authGuard, permissionGuard('historia-clinica', 'view'), activePatientGuard],
    loadComponent: () =>
      import('./historia-clinica/historia-clinica-form.component').then(
        (m) => m.HistoriaClinicaFormComponent
      ),
  },
  {
    path: 'valoracion',
    canActivate: [authGuard, permissionGuard('valoracion', 'view'), activePatientGuard],
    loadComponent: () =>
      import('./valoracion/valoracion-list.component').then((m) => m.ValoracionListComponent),
  },
  {
    path: 'valoracion/:id',
    canActivate: [authGuard, permissionGuard('valoracion', 'view'), activePatientGuard],
    loadComponent: () =>
      import('./valoracion/valoracion-detail.component').then((m) => m.ValoracionDetailComponent),
  },
];
