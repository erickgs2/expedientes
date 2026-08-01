import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { AuthUser, LoginRequest, LoginResponse } from '@expedientes/shared-types';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly currentUser = signal<AuthUser | null>(null);

  async login(credentials: LoginRequest): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<LoginResponse>('/api/auth/login', credentials)
    );
    this.currentUser.set(response.user);
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/logout', {}));
    this.currentUser.set(null);
  }

  async restoreSession(): Promise<void> {
    try {
      const response = await firstValueFrom(this.http.get<LoginResponse>('/api/auth/me'));
      this.currentUser.set(response.user);
    } catch {
      this.currentUser.set(null);
    }
  }

  hasPermission(module: string, action: string): boolean {
    return this.currentUser()?.permissions.includes(`${module}:${action}`) ?? false;
  }
}
