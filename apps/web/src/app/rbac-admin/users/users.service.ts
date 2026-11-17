import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { InvitationInput, PendingInvitation } from '@expedientes/shared-types';

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  language: string;
  active: boolean;
  roleId: string;
  roleName: string;
}

export interface AdminRole {
  id: string;
  name: string;
}

export interface UpdateUserInput {
  fullName?: string;
  roleId?: string;
  language?: string;
  active?: boolean;
  newPassword?: string;
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);

  listUsers(): Promise<AdminUser[]> {
    return firstValueFrom(this.http.get<{ users: AdminUser[] }>('/api/users')).then((r) => r.users);
  }

  listRoles(): Promise<AdminRole[]> {
    return firstValueFrom(this.http.get<{ roles: AdminRole[] }>('/api/roles')).then((r) => r.roles);
  }

  listInvitations(): Promise<PendingInvitation[]> {
    return firstValueFrom(
      this.http.get<{ invitations: PendingInvitation[] }>('/api/invitations')
    ).then((r) => r.invitations);
  }

  /** People join a clinic by accepting an emailed invitation; there is no direct creation. */
  invite(input: InvitationInput): Promise<PendingInvitation> {
    return firstValueFrom(
      this.http.post<{ invitation: PendingInvitation }>('/api/invitations', input)
    ).then((r) => r.invitation);
  }

  revokeInvitation(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/invitations/${id}`));
  }

  updateUser(id: string, input: UpdateUserInput): Promise<void> {
    return firstValueFrom(this.http.patch<void>(`/api/users/${id}`, input));
  }
}
