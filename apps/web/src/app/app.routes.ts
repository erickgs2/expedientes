import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';
import { permissionGuard } from './auth/permission.guard';
import { legacyPatientRedirect, patientRouteGuard } from './patient-drive/patient-route.guards';

/**
 * Patient screens live under `/pacientes/:patientId/...`, so the URL always says whose record is
 * open. The flat paths that predate that (`/valoracion`, `/treatments/:id`...) are kept as
 * redirects at the bottom, because internal links and bookmarks still point at them.
 */
const patientChildren: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'historia-clinica' },
  {
    path: 'historia-clinica',
    canActivate: [permissionGuard('historia-clinica', 'view')],
    loadComponent: () =>
      import('./historia-clinica/historia-clinica-form.component').then(
        (m) => m.HistoriaClinicaFormComponent
      ),
  },
  {
    path: 'valoracion',
    canActivate: [permissionGuard('valoracion', 'view')],
    loadComponent: () =>
      import('./valoracion/valoracion-list.component').then((m) => m.ValoracionListComponent),
  },
  {
    path: 'valoracion/:id',
    canActivate: [permissionGuard('valoracion', 'view')],
    loadComponent: () =>
      import('./valoracion/valoracion-detail.component').then((m) => m.ValoracionDetailComponent),
  },
  {
    path: 'photos',
    canActivate: [permissionGuard('valoracion', 'view')],
    loadComponent: () =>
      import('./photo-timeline/photo-timeline.component').then((m) => m.PhotoTimelineComponent),
  },
  {
    path: 'treatments',
    canActivate: [permissionGuard('treatments', 'view')],
    loadComponent: () =>
      import('./treatments/treatment-list.component').then((m) => m.TreatmentListComponent),
  },
  {
    path: 'treatments/:id',
    canActivate: [permissionGuard('treatments', 'view')],
    loadComponent: () =>
      import('./treatments/treatment-detail.component').then((m) => m.TreatmentDetailComponent),
  },
  {
    path: 'treatments/items/:itemId/consent',
    canActivate: [permissionGuard('treatments', 'view')],
    loadComponent: () =>
      import('./treatments/consent-sign.component').then((m) => m.ConsentSignComponent),
  },
  {
    path: 'treatments/items/:itemId/diagram',
    canActivate: [permissionGuard('treatments', 'view')],
    loadComponent: () =>
      import('./treatments/treatment-diagram.component').then((m) => m.TreatmentDiagramComponent),
  },
  {
    path: 'treatments/items/:itemId/photos',
    canActivate: [permissionGuard('treatments', 'view')],
    loadComponent: () =>
      import('./treatments/treatment-photo.component').then((m) => m.TreatmentPhotoComponent),
  },
  {
    path: 'treatments/items/:itemId/products',
    canActivate: [permissionGuard('treatments', 'view')],
    loadComponent: () =>
      import('./treatments/treatment-products.component').then(
        (m) => m.TreatmentProductsComponent
      ),
  },
  {
    path: 'export',
    canActivate: [permissionGuard('export', 'view')],
    loadComponent: () => import('./export/export.component').then((m) => m.ExportComponent),
  },
];

/** A flat legacy path that forwards to the same screen inside the active patient's workspace. */
const legacy = (path: string, suffix: (params: Record<string, string>) => string[]) => ({
  path,
  canActivate: [authGuard, legacyPatientRedirect(suffix)],
  children: [],
});

export const appRoutes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [authGuard],
    loadComponent: () => import('./today/today.component').then((m) => m.TodayComponent),
  },
  { path: 'login', loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent) },
  {
    path: 'pacientes',
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./patient-drive/patient-search.component').then((m) => m.PatientSearchComponent),
      },
      {
        path: ':patientId',
        canActivate: [patientRouteGuard],
        loadComponent: () =>
          import('./patient-drive/patient-workspace.component').then(
            (m) => m.PatientWorkspaceComponent
          ),
        children: patientChildren,
      },
    ],
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
    path: 'admin/clinic',
    canActivate: [authGuard, permissionGuard('clinic-settings', 'view')],
    loadComponent: () =>
      import('./admin/clinic-settings.component').then((m) => m.ClinicSettingsComponent),
  },
  {
    path: 'calendar',
    canActivate: [authGuard, permissionGuard('appointments', 'view')],
    loadComponent: () =>
      import('./appointments/appointment-calendar.component').then(
        (m) => m.AppointmentCalendarComponent
      ),
  },

  // Legacy flat URLs, kept so existing links and bookmarks keep working.
  { path: 'patients', pathMatch: 'full', redirectTo: 'pacientes' },
  legacy('historia-clinica', () => ['historia-clinica']),
  legacy('valoracion', () => ['valoracion']),
  legacy('valoracion/:id', (p) => ['valoracion', p['id']]),
  legacy('photos', () => ['photos']),
  legacy('treatments', () => ['treatments']),
  legacy('treatments/items/:itemId/consent', (p) => ['treatments', 'items', p['itemId'], 'consent']),
  legacy('treatments/items/:itemId/diagram', (p) => ['treatments', 'items', p['itemId'], 'diagram']),
  legacy('treatments/items/:itemId/photos', (p) => ['treatments', 'items', p['itemId'], 'photos']),
  legacy('treatments/items/:itemId/products', (p) => ['treatments', 'items', p['itemId'], 'products']),
  legacy('treatments/:id', (p) => ['treatments', p['id']]),
  legacy('export', () => ['export']),
];
