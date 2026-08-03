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
    path: 'admin/treatments',
    canActivate: [authGuard, permissionGuard('treatments', 'view')],
    loadComponent: () =>
      import('./treatments/treatment-type-list.component').then(
        (m) => m.TreatmentTypeListComponent
      ),
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
  {
    path: 'photos',
    canActivate: [authGuard, permissionGuard('valoracion', 'view'), activePatientGuard],
    loadComponent: () =>
      import('./photo-timeline/photo-timeline.component').then(
        (m) => m.PhotoTimelineComponent
      ),
  },
  {
    path: 'treatments',
    canActivate: [authGuard, permissionGuard('treatments', 'view'), activePatientGuard],
    loadComponent: () =>
      import('./treatments/treatment-list.component').then((m) => m.TreatmentListComponent),
  },
  {
    path: 'treatments/:id',
    canActivate: [authGuard, permissionGuard('treatments', 'view'), activePatientGuard],
    loadComponent: () =>
      import('./treatments/treatment-detail.component').then((m) => m.TreatmentDetailComponent),
  },
  {
    path: 'treatments/items/:itemId/consent',
    canActivate: [authGuard, permissionGuard('treatments', 'view'), activePatientGuard],
    loadComponent: () =>
      import('./treatments/consent-sign.component').then((m) => m.ConsentSignComponent),
  },
  {
    path: 'treatments/items/:itemId/diagram',
    canActivate: [authGuard, permissionGuard('treatments', 'view'), activePatientGuard],
    loadComponent: () =>
      import('./treatments/treatment-diagram.component').then((m) => m.TreatmentDiagramComponent),
  },
  {
    path: 'treatments/items/:itemId/photos',
    canActivate: [authGuard, permissionGuard('treatments', 'view'), activePatientGuard],
    loadComponent: () =>
      import('./treatments/treatment-photo.component').then((m) => m.TreatmentPhotoComponent),
  },
  {
    path: 'calendar',
    canActivate: [authGuard, permissionGuard('appointments', 'view')],
    loadComponent: () =>
      import('./appointments/appointment-calendar.component').then(
        (m) => m.AppointmentCalendarComponent
      ),
  },
  {
    path: 'export',
    canActivate: [authGuard, permissionGuard('export', 'view'), activePatientGuard],
    loadComponent: () => import('./export/export.component').then((m) => m.ExportComponent),
  },
];
