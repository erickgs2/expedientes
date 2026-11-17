import { Component, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@jsverse/transloco';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslocoModule,
    RouterLink,
  ],
  template: `
    <div class="login-container">
      <mat-card class="login-card">
        <mat-card-content>
          <div class="login-brand">
            <svg class="login-mark" viewBox="0 0 48 48" aria-hidden="true">
                <path class="petal" d="M24 34C14 36 6 31 6 22C14 22 21 27 24 34Z" />
                <path class="petal" d="M24 34C34 36 42 31 42 22C34 22 27 27 24 34Z" />
                <path class="petal" d="M24 34C15 30 10 22 13 14C21 17 25 25 24 34Z" />
                <path class="petal" d="M24 34C33 30 38 22 35 14C27 17 23 25 24 34Z" />
                <path class="petal" d="M6 39c0 4 4 6 8 5.5 3-.4 4-1.5 10-1.5s7 1.1 10 1.5c4 .5 8-1.5 8-5.5" />
                <path class="accent" d="M24 34C17 28 17 16 24 9.5C31 16 31 28 24 34Z" />
                <circle class="dot" cx="24" cy="6.6" r="2.3" />
              </svg>
            <h1>MedCloud</h1>
          </div>
          <form [formGroup]="form" (ngSubmit)="submit()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'auth.email' | transloco }}</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="email" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'auth.password' | transloco }}</mat-label>
              <input matInput type="password" formControlName="password" autocomplete="current-password" />
            </mat-form-field>
            @if (error()) {
              <p class="error" role="alert">{{ errorKey() | transloco }}</p>
            }
            <button
              mat-flat-button
              color="primary"
              type="submit"
              class="full-width submit-button"
              [disabled]="form.invalid || loading()"
            >
              @if (loading()) {
                <mat-spinner diameter="20"></mat-spinner>
              } @else {
                {{ 'auth.login' | transloco }}
              }
            </button>
          </form>
          <div class="links">
            <a routerLink="/recuperar">{{ 'auth.forgotPassword' | transloco }}</a>
            <span>
              {{ 'auth.noAccount' | transloco }}
              <a routerLink="/registro" class="strong">{{ 'auth.createAccount' | transloco }}</a>
            </span>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .login-container {
        display: flex;
        justify-content: center;
        align-items: flex-start;
        padding: 12vh 16px 32px;
      }
      .login-card {
        width: 100%;
        max-width: 400px;
        padding: 12px 8px 8px;
      }
      .login-brand {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        margin: 12px 0 28px;
      }
      .login-mark {
        width: 44px;
        height: 44px;
        fill: none;
        stroke: color-mix(in srgb, var(--mat-sys-secondary) 60%, var(--mat-sys-surface));
        stroke-width: 2;
        stroke-linejoin: round;
        stroke-linecap: round;
      }
      .login-mark .accent {
        stroke: color-mix(in srgb, var(--plate-mark) 55%, var(--mat-sys-surface));
        stroke-width: 2.2;
      }
      .login-mark .dot {
        fill: var(--plate-mark);
        stroke: none;
      }
      .login-brand h1 {
        margin: 0;
      }
      .full-width {
        width: 100%;
      }
      .submit-button {
        margin-top: 8px;
        height: 44px;
      }
      .error {
        color: var(--mat-sys-error, #b91c1c);
        margin: 0 0 12px;
      }
      .links {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        margin-top: 20px;
        font-size: 14px;
        color: var(--mat-sys-on-surface-variant);
      }
      .links a {
        color: inherit;
      }
      .links .strong {
        color: var(--mat-sys-on-surface);
        font-weight: 600;
      }
    `,
  ],
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly error = signal<'invalid' | 'locked' | 'planInactive' | null>(null);
  protected readonly errorKey = computed(() => {
    switch (this.error()) {
      case 'locked':
        return 'auth.tooManyAttempts';
      case 'planInactive':
        return 'auth.planMemberInactive';
      default:
        return 'auth.invalidCredentials';
    }
  });

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      await this.auth.login({
        email: this.form.value.email ?? '',
        password: this.form.value.password ?? '',
      });
      await this.router.navigate(['/']);
    } catch (e) {
      // 429 means this source is temporarily blocked, which "wrong password" would misreport.
      const failure = e as { status?: number; error?: { error?: { code?: string } } };
      if (failure?.status === 429) this.error.set('locked');
      // The password was right, but the clinic is on Free, where only its owner can sign in.
      else if (failure?.error?.error?.code === 'PLAN_MEMBER_INACTIVE') this.error.set('planInactive');
      else this.error.set('invalid');
    } finally {
      this.loading.set(false);
    }
  }
}
