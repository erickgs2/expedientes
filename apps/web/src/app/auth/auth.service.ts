import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import type { AuthUser, LoginRequest, LoginResponse } from '@expedientes/shared-types';

const SUPPORTED_LANGS = ['es', 'en'];

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly transloco = inject(TranslocoService);

  readonly currentUser = signal<AuthUser | null>(null);

  private restoreInFlight: Promise<void> | null = null;

  async login(credentials: LoginRequest): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<LoginResponse>('/api/auth/login', credentials)
    );
    this.currentUser.set(response.user);
    this.applyUserLanguage(response.user);
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/logout', {}));
    this.currentUser.set(null);
  }

  /**
   * Loads the current user from the session cookie. Concurrent callers share one request: the
   * route guards on a single navigation run in parallel and would otherwise each hit
   * `/api/auth/me`.
   */
  restoreSession(): Promise<void> {
    this.restoreInFlight ??= this.fetchCurrentUser().finally(() => {
      this.restoreInFlight = null;
    });
    return this.restoreInFlight;
  }

  private async fetchCurrentUser(): Promise<void> {
    try {
      const response = await firstValueFrom(this.http.get<LoginResponse>('/api/auth/me'));
      this.currentUser.set(response.user);
      this.applyUserLanguage(response.user);
    } catch {
      this.currentUser.set(null);
    }
  }

  hasPermission(module: string, action: string): boolean {
    return this.currentUser()?.permissions.includes(`${module}:${action}`) ?? false;
  }

  /**
   * Applies the user's stored language preference. Done on session restore as well as login, so a
   * page reload doesn't silently drop the preference back to the default `es`. Unknown values are
   * ignored rather than passed to Transloco, which would fail to load a non-existent bundle.
   */
  private applyUserLanguage(user: AuthUser): void {
    if (SUPPORTED_LANGS.includes(user.language)) {
      this.transloco.setActiveLang(user.language);
    }
  }
}
