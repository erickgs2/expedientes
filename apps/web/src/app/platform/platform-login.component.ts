import { Component, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthShellComponent } from '../public/auth-shell.component';
import type { PlatformTotpSetup } from '@expedientes/shared-types';
import { PlatformService } from './platform.service';

type Step = 'password' | 'totp' | 'setup';

/**
 * Platform sign-in: email and password, then a code from an authenticator app. The first time, the
 * second step enrols the app (secret to type in, or a link that opens the app on a phone).
 */
@Component({
  selector: 'app-platform-login',
  standalone: true,
  imports: [NgTemplateOutlet, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, AuthShellComponent],
  template: `
    <app-auth-shell>
      @switch (step()) {
        @case ('password') {
          <h1>Entrar a la plataforma</h1>
          <p class="lead">Solo para la administración de MedCloud. Las clínicas entran desde la página principal.</p>
          <form (ngSubmit)="signIn()">
            <mat-form-field appearance="outline" class="full">
              <mat-label>Correo</mat-label>
              <input matInput type="email" name="email" autocomplete="username" [(ngModel)]="email" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="full">
              <mat-label>Contraseña</mat-label>
              <input matInput type="password" name="password" autocomplete="current-password" [(ngModel)]="password" />
            </mat-form-field>
            @if (error()) {
              <p class="error" role="alert">{{ error() }}</p>
            }
            <button mat-flat-button class="full submit" type="submit" [disabled]="!email || !password || busy()">
              Continuar
            </button>
          </form>
        }
        @case ('setup') {
          <h1>Activa la verificación en dos pasos</h1>
          <p class="lead">
            Agrega esta cuenta a tu app autenticadora (Google Authenticator, 1Password, Authy) y escribe el
            código de 6 dígitos que muestra.
          </p>
          @if (setup(); as s) {
            <p class="label">Clave para escribir en la app</p>
            <p class="secret">{{ grouped(s.secret) }}</p>
            <p class="hint">
              En el teléfono puedes <a [href]="s.otpauthUri">abrirla directo en la app</a>. Tipo: basada en
              tiempo, 6 dígitos.
            </p>
          }
          <ng-container *ngTemplateOutlet="codeForm" />
        }
        @case ('totp') {
          <h1>Código de verificación</h1>
          <p class="lead">Escribe el código de 6 dígitos de tu app autenticadora.</p>
          <ng-container *ngTemplateOutlet="codeForm" />
        }
      }

      <ng-template #codeForm>
        <form (ngSubmit)="verify()">
          <mat-form-field appearance="outline" class="full">
            <mat-label>Código</mat-label>
            <input
              matInput
              class="code"
              name="code"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              [(ngModel)]="code"
            />
          </mat-form-field>
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <button mat-flat-button class="full submit" type="submit" [disabled]="code.length !== 6 || busy()">
            Entrar
          </button>
        </form>
      </ng-template>
    </app-auth-shell>
  `,
  styles: [
    `
      h1 {
        font-size: 18px;
        margin: 0 0 6px;
      }
      .lead,
      .hint {
        margin: 0 0 12px;
        color: var(--mat-sys-on-surface-variant);
        font-size: 14px;
      }
      .label {
        margin: 0;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .secret {
        margin: 4px 0 8px;
        font-family: Menlo, Consolas, monospace;
        font-size: 17px;
        letter-spacing: 1px;
        word-break: break-all;
        user-select: all;
      }
      .full {
        width: 100%;
      }
      .submit {
        height: 44px;
      }
      .code {
        font-size: 22px;
        letter-spacing: 6px;
      }
      .error {
        color: var(--mat-sys-error, #b91c1c);
        margin: 0 0 12px;
      }
      a {
        color: inherit;
        font-weight: 600;
      }
    `,
  ],
})
export class PlatformLoginComponent {
  private readonly platform = inject(PlatformService);
  private readonly router = inject(Router);

  protected readonly step = signal<Step>('password');
  protected readonly setup = signal<PlatformTotpSetup | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected email = '';
  protected password = '';
  protected code = '';

  protected grouped(secret: string): string {
    return secret.replace(/(.{4})/g, '$1 ').trim();
  }

  protected async signIn(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      const { next } = await this.platform.login(this.email, this.password);
      this.password = '';
      if (next === 'setup') this.setup.set(await this.platform.totpSetup());
      this.step.set(next);
    } catch (error) {
      const status = (error as { status?: number }).status;
      this.error.set(status === 429 ? 'Demasiados intentos. Espera unos minutos.' : 'Correo o contraseña incorrectos.');
    } finally {
      this.busy.set(false);
    }
  }

  protected async verify(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.platform.verifyTotp(this.code);
      await this.router.navigate(['/plataforma']);
    } catch (error) {
      const status = (error as { status?: number }).status;
      this.code = '';
      if (status === 401) {
        this.step.set('password');
        this.error.set('La sesión venció. Vuelve a escribir tu contraseña.');
      } else {
        this.error.set(status === 429 ? 'Demasiados intentos. Espera unos minutos.' : 'El código no es correcto.');
      }
    } finally {
      this.busy.set(false);
    }
  }
}
