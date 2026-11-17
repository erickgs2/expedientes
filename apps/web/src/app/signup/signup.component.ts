import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators, type AbstractControl } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { CurrentLegalDocuments } from '@expedientes/shared-types';
import { AuthService } from '../auth/auth.service';
import { AuthShellComponent } from '../public/auth-shell.component';
import { LegalService } from '../legal/legal.service';
import { LegalConsentComponent } from '../legal/legal-consent.component';
import { LegalDocumentViewComponent } from '../legal/legal-document-view.component';
import { CodeStepComponent } from './code-step.component';
import { TurnstileComponent } from './turnstile.component';
import { apiErrorOf } from './api-error';

type Step = 'details' | 'legal' | 'code';

const passwordsMatch = (group: AbstractControl) =>
  group.get('password')?.value === group.get('confirm')?.value ? null : { mismatch: true };

/**
 * Self-service sign-up in three steps: the person and the clinic; the privacy notice and terms,
 * read and accepted; the 6-digit code sent to the email. Nothing exists on the server until the code
 * is confirmed, and confirming signs the new owner straight in.
 */
@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    TranslocoModule,
    AuthShellComponent,
    LegalConsentComponent,
    LegalDocumentViewComponent,
    CodeStepComponent,
    TurnstileComponent,
  ],
  template: `
    <app-auth-shell [width]="step() === 'legal' ? 640 : 440">
      <ol class="steps" [attr.aria-label]="'signup.steps.label' | transloco">
        @for (s of steps; track s; let i = $index) {
          <li [class.current]="step() === s" [class.done]="stepIndex() > i">
            <span class="num">{{ i + 1 }}</span>{{ 'signup.steps.' + s | transloco }}
          </li>
        }
      </ol>

      @switch (step()) {
        @case ('details') {
          <h1>{{ 'signup.title' | transloco }}</h1>
          <p class="lead">{{ 'signup.lead' | transloco }}</p>
          <form [formGroup]="form" (ngSubmit)="toLegal()">
            <mat-form-field appearance="outline" class="full">
              <mat-label>{{ 'signup.fullName' | transloco }}</mat-label>
              <input matInput formControlName="fullName" autocomplete="name" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="full">
              <mat-label>{{ 'signup.clinicName' | transloco }}</mat-label>
              <input matInput formControlName="clinicName" autocomplete="organization" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="full">
              <mat-label>{{ 'signup.phone' | transloco }}</mat-label>
              <input matInput formControlName="phone" type="tel" inputmode="tel" autocomplete="tel" />
              <mat-hint>{{ 'signup.phoneHint' | transloco }}</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="full">
              <mat-label>{{ 'auth.email' | transloco }}</mat-label>
              <input matInput formControlName="email" type="email" autocomplete="email" />
            </mat-form-field>
            <mat-form-field appearance="outline" class="full">
              <mat-label>{{ 'auth.password' | transloco }}</mat-label>
              <input matInput formControlName="password" type="password" autocomplete="new-password" />
              <mat-hint>{{ 'signup.passwordHint' | transloco }}</mat-hint>
            </mat-form-field>
            <mat-form-field appearance="outline" class="full">
              <mat-label>{{ 'signup.confirmPassword' | transloco }}</mat-label>
              <input matInput formControlName="confirm" type="password" autocomplete="new-password" />
            </mat-form-field>
            @if (form.hasError('mismatch') && form.get('confirm')?.touched) {
              <p class="error" role="alert">{{ 'signup.passwordMismatch' | transloco }}</p>
            }
            <button mat-flat-button type="submit" class="full submit" [disabled]="form.invalid">
              {{ 'signup.continue' | transloco }}
            </button>
          </form>
          <p class="alt">
            {{ 'signup.haveAccount' | transloco }} <a routerLink="/login">{{ 'auth.login' | transloco }}</a>
          </p>
        }

        @case ('legal') {
          <h1>{{ 'signup.legalTitle' | transloco }}</h1>
          <p class="lead">{{ 'signup.legalLead' | transloco }}</p>
          @if (legal(); as docs) {
            <div class="tabs" role="tablist">
              <button type="button" role="tab" [class.on]="legalTab() === 'privacy'" (click)="legalTab.set('privacy')">
                {{ 'legal.privacyNotice' | transloco }}
              </button>
              <button type="button" role="tab" [class.on]="legalTab() === 'terms'" (click)="legalTab.set('terms')">
                {{ 'legal.terms' | transloco }}
              </button>
            </div>
            <div class="legal-panel" tabindex="0">
              <app-legal-document-view [markdown]="legalTab() === 'privacy' ? docs.privacy.body : docs.terms.body" />
            </div>
            <app-legal-consent #consent [docs]="docs" />
            @if (turnstileKey(); as key) {
              <app-turnstile #captcha [siteKey]="key" (token)="captchaToken.set($event)" />
            }
            @if (error()) {
              <p class="error" role="alert">{{ error() }}</p>
            }
            <div class="actions">
              <button mat-button type="button" (click)="step.set('details')">{{ 'common.back' | transloco }}</button>
              <button
                mat-flat-button
                type="button"
                [disabled]="!consent.complete() || (turnstileKey() && !captchaToken()) || busy()"
                (click)="sendCode(consent.marketing())"
              >
                @if (busy()) {
                  <mat-spinner diameter="20" />
                } @else {
                  {{ 'signup.createAccount' | transloco }}
                }
              </button>
            </div>
          } @else {
            <p>{{ (legalFailed() ? 'common.loadError' : 'common.loading') | transloco }}</p>
          }
        }

        @case ('code') {
          <h1>{{ 'signup.code.title' | transloco }}</h1>
          <app-code-step
            #codeStep
            [email]="form.value.email ?? ''"
            [error]="error()"
            (codeChange)="code.set($event)"
            (resend)="resend()"
            (back)="step.set('details')"
          />
          <button mat-flat-button type="button" class="full submit" [disabled]="code().length !== 6 || busy()" (click)="verify()">
            @if (busy()) {
              <mat-spinner diameter="20" />
            } @else {
              {{ 'signup.code.confirm' | transloco }}
            }
          </button>
        }
      }
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
      mat-form-field {
        margin-bottom: 4px;
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
        font-weight: 600;
      }
      .steps {
        display: flex;
        gap: 12px;
        list-style: none;
        padding: 0;
        margin: 0 0 20px;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
        justify-content: center;
        flex-wrap: wrap;
      }
      .steps li {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .num {
        display: inline-grid;
        place-items: center;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 1px solid var(--plate-line-strong);
        font-size: 11px;
      }
      .steps .current {
        color: var(--mat-sys-on-surface);
        font-weight: 600;
      }
      .steps .current .num {
        border-color: var(--plate-mark);
        background: var(--plate-mark);
        color: var(--mat-sys-on-primary, #fff);
      }
      .steps .done .num {
        border-color: var(--mat-sys-on-surface-variant);
      }
      .tabs {
        display: flex;
        gap: 4px;
        border-bottom: 1px solid var(--plate-line);
        margin-bottom: 0;
      }
      .tabs button {
        border: 0;
        background: none;
        padding: 8px 12px;
        font: inherit;
        color: var(--mat-sys-on-surface-variant);
        cursor: pointer;
        border-bottom: 2px solid transparent;
      }
      .tabs button.on {
        color: var(--mat-sys-on-surface);
        border-bottom-color: var(--plate-mark);
        font-weight: 600;
      }
      .legal-panel {
        max-height: 320px;
        overflow-y: auto;
        border: 1px solid var(--plate-line);
        border-top: 0;
        border-radius: 0 0 var(--plate-radius) var(--plate-radius);
        padding: 12px 16px;
        margin-bottom: 12px;
      }
      .actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
    `,
  ],
})
export class SignupComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly legalService = inject(LegalService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  protected readonly steps: Step[] = ['details', 'legal', 'code'];
  protected readonly step = signal<Step>('details');
  protected readonly stepIndex = computed(() => this.steps.indexOf(this.step()));
  protected readonly legal = signal<CurrentLegalDocuments | null>(null);
  protected readonly legalFailed = signal(false);
  protected readonly legalTab = signal<'privacy' | 'terms'>('privacy');
  protected readonly turnstileKey = signal<string | null>(null);
  protected readonly captchaToken = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly code = signal('');

  private readonly codeStep = viewChild<CodeStepComponent>('codeStep');
  private readonly captcha = viewChild<TurnstileComponent>('captcha');
  private marketingConsent = false;

  protected readonly form = this.fb.nonNullable.group(
    {
      fullName: ['', [Validators.required, Validators.maxLength(120)]],
      clinicName: ['', [Validators.required, Validators.maxLength(120)]],
      phone: ['', [Validators.required, Validators.pattern(/^(\+?52)?[\s\-()]*(\d[\s\-()]*){10}$/)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(10)]],
      confirm: ['', Validators.required],
    },
    { validators: passwordsMatch }
  );

  async ngOnInit(): Promise<void> {
    this.auth.signupConfig().then(
      (config) => this.turnstileKey.set(config.turnstileSiteKey),
      () => this.turnstileKey.set(null)
    );
    await this.loadLegal();
  }

  private async loadLegal(): Promise<void> {
    this.legalFailed.set(false);
    try {
      this.legal.set(await this.legalService.current());
    } catch {
      this.legalFailed.set(true);
    }
  }

  protected toLegal(): void {
    this.error.set(null);
    this.step.set('legal');
  }

  protected async sendCode(marketing: boolean): Promise<void> {
    const docs = this.legal();
    if (!docs) return;
    this.marketingConsent = marketing;
    this.busy.set(true);
    this.error.set(null);
    const value = this.form.getRawValue();
    try {
      const result = await this.auth.startSignup({
        email: value.email,
        password: value.password,
        fullName: value.fullName,
        clinicName: value.clinicName,
        phone: value.phone,
        privacyDocumentId: docs.privacy.id,
        termsDocumentId: docs.terms.id,
        marketingConsent: this.marketingConsent,
        turnstileToken: this.captchaToken() ?? undefined,
      });
      this.code.set('');
      this.step.set('code');
      queueMicrotask(() => this.codeStep()?.startCooldown(result.retryAfterSeconds));
    } catch (error) {
      const { code, details } = apiErrorOf(error);
      if (code === 'LEGAL_OUTDATED') await this.loadLegal();
      if (code === 'INVALID_INPUT' && details?.['field']) this.step.set('details');
      this.error.set(this.message(code));
      this.captcha()?.reset();
    } finally {
      this.busy.set(false);
    }
  }

  protected async resend(): Promise<void> {
    this.error.set(null);
    try {
      const result = await this.auth.resendSignupCode(this.form.getRawValue().email);
      this.codeStep()?.startCooldown(result.retryAfterSeconds);
    } catch (error) {
      this.error.set(this.message(apiErrorOf(error).code));
    }
  }

  protected async verify(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.verifySignup(this.form.getRawValue().email, this.code());
      await this.router.navigate(['/']);
    } catch (error) {
      const { code, details } = apiErrorOf(error);
      this.error.set(this.message(code, details));
    } finally {
      this.busy.set(false);
    }
  }

  private message(code: string, details?: Record<string, unknown>): string {
    const known = [
      'CODE_INVALID',
      'CODE_EXPIRED',
      'CODE_LOCKED',
      'LEGAL_OUTDATED',
      'CAPTCHA_FAILED',
      'EMAIL_TAKEN',
      'TOO_MANY_ATTEMPTS',
      'INVALID_INPUT',
      'EMAIL_FAILED',
    ];
    const key = known.includes(code) ? code : 'UNKNOWN';
    return this.transloco.translate(`signup.errors.${key}`, { left: details?.['attemptsLeft'] ?? '' });
  }
}
