import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
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
  ],
  template: `
    <div class="login-container">
      <mat-card class="login-card">
        <mat-card-content>
          <div class="login-brand">
            <svg class="login-mark" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="8" />
              <path d="M12 1.5v6M12 16.5v6M1.5 12h6M16.5 12h6" />
              <circle cx="12" cy="12" r="2" class="dot" />
            </svg>
            <h1>Expedientes</h1>
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
              <p class="error" role="alert">{{ 'auth.invalidCredentials' | transloco }}</p>
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
        stroke: var(--mat-sys-on-surface);
        stroke-width: 1.1;
        stroke-linecap: round;
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
    `,
  ],
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly loading = signal(false);
  protected readonly error = signal(false);

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(false);
    try {
      await this.auth.login({
        email: this.form.value.email ?? '',
        password: this.form.value.password ?? '',
      });
      await this.router.navigate(['/']);
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
