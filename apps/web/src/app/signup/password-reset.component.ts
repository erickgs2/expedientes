import { Component, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../auth/auth.service';
import { AuthShellComponent } from '../public/auth-shell.component';
import { CodeStepComponent } from './code-step.component';
import { apiErrorOf } from './api-error';

/**
 * Forgotten password: the email gets a 6-digit code; the code and a new password (typed twice) set
 * it and sign the user in. The first step answers the same whether or not the email has an account.
 */
@Component({
  selector: 'app-password-reset',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    TranslocoModule,
    AuthShellComponent,
    CodeStepComponent,
  ],
  template: `
    <app-auth-shell>
      <h1>{{ 'reset.title' | transloco }}</h1>
      @if (step() === 'email') {
        <p class="lead">{{ 'reset.lead' | transloco }}</p>
        <form (ngSubmit)="send()">
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ 'auth.email' | transloco }}</mat-label>
            <input matInput type="email" name="email" autocomplete="email" [(ngModel)]="email" required />
          </mat-form-field>
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <button mat-flat-button type="submit" class="full submit" [disabled]="!email.includes('@') || busy()">
            {{ 'reset.send' | transloco }}
          </button>
        </form>
      } @else {
        <app-code-step
          #codeStep
          [email]="email"
          [error]="error()"
          (codeChange)="code.set($event)"
          (resend)="send(true)"
          (back)="step.set('email')"
        >
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ 'reset.newPassword' | transloco }}</mat-label>
            <input matInput type="password" name="pw" autocomplete="new-password" [(ngModel)]="password" />
            <mat-hint>{{ 'signup.passwordHint' | transloco }}</mat-hint>
          </mat-form-field>
          <mat-form-field appearance="outline" class="full">
            <mat-label>{{ 'signup.confirmPassword' | transloco }}</mat-label>
            <input matInput type="password" name="pw2" autocomplete="new-password" [(ngModel)]="confirm" />
          </mat-form-field>
          @if (confirm && confirm !== password) {
            <p class="error" role="alert">{{ 'signup.passwordMismatch' | transloco }}</p>
          }
        </app-code-step>
        <button
          mat-flat-button
          type="button"
          class="full submit"
          [disabled]="code().length !== 6 || password.length < 10 || password !== confirm || busy()"
          (click)="confirmReset()"
        >
          @if (busy()) {
            <mat-spinner diameter="20" />
          } @else {
            {{ 'reset.save' | transloco }}
          }
        </button>
      }
      <p class="alt"><a routerLink="/login">{{ 'legal.backToLogin' | transloco }}</a></p>
    </app-auth-shell>
  `,
  styles: [
    `
      h1 {
        font-size: 20px;
        margin: 0 0 4px;
      }
      .lead {
        margin: 0 0 16px;
        color: var(--mat-sys-on-surface-variant);
      }
      .full {
        width: 100%;
      }
      .submit {
        height: 44px;
        margin-top: 8px;
      }
      .error {
        color: var(--mat-sys-error, #b91c1c);
        margin: 0 0 12px;
      }
      .alt {
        margin: 16px 0 0;
        text-align: center;
        font-size: 14px;
      }
      .alt a {
        color: inherit;
      }
    `,
  ],
})
export class PasswordResetComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly codeStep = viewChild<CodeStepComponent>('codeStep');

  protected readonly step = signal<'email' | 'code'>('email');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly code = signal('');
  protected email = '';
  protected password = '';
  protected confirm = '';

  protected async send(again = false): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.auth.requestPasswordReset(this.email.trim());
      if (!again) this.step.set('code');
      queueMicrotask(() => this.codeStep()?.startCooldown(result.retryAfterSeconds));
    } catch (error) {
      this.error.set(this.message(apiErrorOf(error).code));
    } finally {
      this.busy.set(false);
    }
  }

  protected async confirmReset(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.confirmPasswordReset({
        email: this.email.trim(),
        code: this.code(),
        newPassword: this.password,
      });
      await this.router.navigate(['/']);
    } catch (error) {
      const { code, details } = apiErrorOf(error);
      this.error.set(this.message(code, details));
    } finally {
      this.busy.set(false);
    }
  }

  private message(code: string, details?: Record<string, unknown>): string {
    const known = ['CODE_INVALID', 'CODE_EXPIRED', 'CODE_LOCKED', 'TOO_MANY_ATTEMPTS', 'INVALID_INPUT', 'EMAIL_FAILED'];
    const key = known.includes(code) ? code : 'UNKNOWN';
    return this.transloco.translate(`signup.errors.${key}`, { left: details?.['attemptsLeft'] ?? '' });
  }
}
