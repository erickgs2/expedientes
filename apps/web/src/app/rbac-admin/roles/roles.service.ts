import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface AdminRoleDetail {
  id: string;
  name: string;
  permissions: string[];
}

export interface AdminPermission {
  id: string;
  module: string;
  action: string;
}

@Injectable({ providedIn: 'root' })
export class RolesService {
  private readonly http = inject(HttpClient);

  listRoles(): Promise<AdminRoleDetail[]> {
    return firstValueFrom(this.http.get<{ roles: AdminRoleDetail[] }>('/api/roles')).then((r) => r.roles);
  }

  listPermissions(): Promise<AdminPermission[]> {
    return firstValueFrom(this.http.get<{ permissions: AdminPermission[] }>('/api/permissions')).then(
      (r) => r.permissions
    );
  }

  createRole(name: string): Promise<{ id: string }> {
    return firstValueFrom(this.http.post<{ id: string }>('/api/roles', { name }));
  }

  updateRole(id: string, input: { name?: string; permissionIds?: string[] }): Promise<void> {
    return firstValueFrom(this.http.patch<void>(`/api/roles/${id}`, input));
  }
}
