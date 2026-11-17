import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpContext } from '@angular/common/http';
import { HANDLES_OWN_ERRORS } from './http-context';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import type {
  AcceptInvitationRequest,
  AuthUser,
  CodeSentResponse,
  InvitationPreview,
  LoginRequest,
  LoginResponse,
  PasswordResetConfirmRequest,
  PlanFeature,
  SignupConfig,
  SignupStartRequest,
} from '@expedientes/shared-types';

const SUPPORTED_LANGS = ['es', 'en'];

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly transloco = inject(TranslocoService);

  readonly currentUser = signal<AuthUser | null>(null);

  /** The clinic's effective plan, as of the last sign-in or session restore. */
  readonly plan = computed(() => this.currentUser()?.plan ?? null);

  private restoreInFlight: Promise<void> | null = null;

  /** For the signed-out screens, which show their errors inline. */
  private readonly inline = { context: new HttpContext().set(HANDLES_OWN_ERRORS, true) };

  async login(credentials: LoginRequest): Promise<void> {
    const response = await firstValueFrom(
      this.http.post<LoginResponse>('/api/auth/login', credentials)
    );
    this.currentUser.set(response.user);
    this.applyUserLanguage(response.user);
  }

  /** Starts a sign-up; the code arrives by email. */
  signupConfig(): Promise<SignupConfig> {
    return firstValueFrom(this.http.get<SignupConfig>('/api/auth/signup/config'));
  }

  startSignup(input: SignupStartRequest): Promise<CodeSentResponse> {
    return firstValueFrom(this.http.post<CodeSentResponse>('/api/auth/signup', input, this.inline));
  }

  resendSignupCode(email: string): Promise<CodeSentResponse> {
    return firstValueFrom(this.http.post<CodeSentResponse>('/api/auth/signup/resend', { email }, this.inline));
  }

  /** Confirms the code: the clinic and the account are created and the owner is signed in. */
  async verifySignup(email: string, code: string): Promise<void> {
    this.signedIn(
      await firstValueFrom(this.http.post<LoginResponse>('/api/auth/signup/verify', { email, code }, this.inline))
    );
  }

  requestPasswordReset(email: string): Promise<CodeSentResponse> {
    return firstValueFrom(this.http.post<CodeSentResponse>('/api/auth/password-reset', { email }, this.inline));
  }

  async confirmPasswordReset(input: PasswordResetConfirmRequest): Promise<void> {
    this.signedIn(
      await firstValueFrom(this.http.post<LoginResponse>('/api/auth/password-reset/confirm', input, this.inline))
    );
  }

  previewInvitation(token: string): Promise<InvitationPreview> {
    return firstValueFrom(
      this.http.get<InvitationPreview>(`/api/invitations/accept/${encodeURIComponent(token)}`, this.inline)
    );
  }

  async acceptInvitation(token: string, input: AcceptInvitationRequest): Promise<void> {
    this.signedIn(
      await firstValueFrom(
        this.http.post<LoginResponse>(`/api/invitations/accept/${encodeURIComponent(token)}`, input, this.inline)
      )
    );
  }

  /** Clears legal versions the user just accepted from the session. */
  setPendingLegal(pendingLegal: AuthUser['pendingLegal']): void {
    const user = this.currentUser();
    if (user) this.currentUser.set({ ...user, pendingLegal });
  }

  private signedIn(response: LoginResponse): void {
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

  /**
   * Whether the clinic's plan includes a feature. Only for what the screen shows: the API enforces
   * the plan on every request regardless.
   */
  hasFeature(feature: PlanFeature): boolean {
    return this.currentUser()?.plan.features[feature] ?? false;
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
