import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

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

export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  roleId: string;
  language: string;
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

  createUser(input: CreateUserInput): Promise<{ id: string }> {
    return firstValueFrom(this.http.post<{ id: string }>('/api/users', input));
  }

  updateUser(id: string, input: UpdateUserInput): Promise<void> {
    return firstValueFrom(this.http.patch<void>(`/api/users/${id}`, input));
  }
}
