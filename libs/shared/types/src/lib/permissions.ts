export type PermissionModule =
  | 'patients'
  | 'historia-clinica'
  | 'valoracion'
  | 'treatments'
  | 'appointments'
  | 'export'
  | 'rbac-admin'
  | 'clinic-settings';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';

export function permissionKey(module: PermissionModule, action: PermissionAction): string {
  return `${module}:${action}`;
}
