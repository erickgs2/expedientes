import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
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
    MatProgressSpinnerModule,
    TranslocoModule,
  ],
  template: `
    <div class="login-container">
      <mat-card>
        <mat-card-content>
          <form [formGroup]="form" (ngSubmit)="submit()">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'auth.email' | transloco }}</mat-label>
              <input matInput type="email" formControlName="email" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>{{ 'auth.password' | transloco }}</mat-label>
              <input matInput type="password" formControlName="password" />
            </mat-form-field>
            @if (error()) {
              <p class="error">{{ 'auth.invalidCredentials' | transloco }}</p>
            }
            <button mat-flat-button color="primary" type="submit" [disabled]="form.invalid || loading()">
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
        margin-top: 10vh;
      }
      .full-width {
        width: 100%;
      }
      .error {
        color: var(--mat-sys-error, #b91c1c);
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
