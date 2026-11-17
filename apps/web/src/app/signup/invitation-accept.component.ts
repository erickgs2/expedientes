import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { CurrentLegalDocuments, InvitationPreview } from '@expedientes/shared-types';
import { AuthService } from '../auth/auth.service';
import { AuthShellComponent } from '../public/auth-shell.component';
import { LegalService } from '../legal/legal.service';
import { LegalConsentComponent } from '../legal/legal-consent.component';
import { apiErrorOf } from './api-error';

/**
 * The page an invitation email links to. A new person sets their name and password; someone who
 * already has a MedCloud account confirms with their password and gains the new clinic. Both accept
 * the privacy notice and terms, then land signed in to the clinic that invited them.
 */
@Component({
  selector: 'app-invitation-accept',
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
    LegalConsentComponent,
  ],
  template: `
    <app-auth-shell>
      @if (gone()) {
        <h1>{{ 'invitation.goneTitle' | transloco }}</h1>
        <p class="lead">{{ 'invitation.gone' | transloco }}</p>
        <p class="alt"><a routerLink="/login">{{ 'legal.backToLogin' | transloco }}</a></p>
      } @else if (preview() && legal()) {
        @let invite = preview()!;
        <h1>{{ 'invitation.title' | transloco: { clinic: invite.clinicName } }}</h1>
        <p class="lead">
          {{ 'invitation.lead' | transloco: { inviter: invite.inviterName, role: invite.roleName } }}
        </p>
        <p class="email">{{ invite.email }}</p>
        <form (ngSubmit)="accept(consent.marketing())">
          @if (!invite.accountExists) {
            <mat-form-field appearance="outline" class="full">
              <mat-label>{{ 'signup.fullName' | transloco }}</mat-label>
              <input matInput name="fullName" autocomplete="name" [(ngModel)]="fullName" />
            </mat-form-field>
          }
          <mat-form-field appearance="outline" class="full">
            <mat-label>
              {{ (invite.accountExists ? 'invitation.currentPassword' : 'auth.password') | transloco }}
            </mat-label>
            <input
              matInput
              type="password"
              name="password"
              [autocomplete]="invite.accountExists ? 'current-password' : 'new-password'"
              [(ngModel)]="password"
            />
            @if (!invite.accountExists) {
              <mat-hint>{{ 'signup.passwordHint' | transloco }}</mat-hint>
            }
          </mat-form-field>
          @if (!invite.accountExists) {
            <mat-form-field appearance="outline" class="full">
              <mat-label>{{ 'signup.confirmPassword' | transloco }}</mat-label>
              <input matInput type="password" name="confirm" autocomplete="new-password" [(ngModel)]="confirm" />
            </mat-form-field>
          }
          <app-legal-consent #consent [docs]="legal()!" />
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <button mat-flat-button type="submit" class="full submit" [disabled]="!canSubmit(consent.complete()) || busy()">
            @if (busy()) {
              <mat-spinner diameter="20" />
            } @else {
              {{ 'invitation.accept' | transloco }}
            }
          </button>
        </form>
        @if (invite.accountExists) {
          <p class="alt"><a routerLink="/recuperar">{{ 'auth.forgotPassword' | transloco }}</a></p>
        }
      } @else {
        <p>{{ 'common.loading' | transloco }}</p>
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
        margin: 0 0 8px;
        color: var(--mat-sys-on-surface-variant);
      }
      .email {
        margin: 0 0 16px;
        font-weight: 600;
      }
      .full {
        width: 100%;
      }
      .submit {
        height: 44px;
        margin-top: 4px;
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
export class InvitationAcceptComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly legalService = inject(LegalService);
  private readonly transloco = inject(TranslocoService);

  protected readonly preview = signal<InvitationPreview | null>(null);
  protected readonly legal = signal<CurrentLegalDocuments | null>(null);
  protected readonly gone = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected fullName = '';
  protected password = '';
  protected confirm = '';
  private token = '';

  async ngOnInit(): Promise<void> {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    try {
      const [preview, legal] = await Promise.all([
        this.auth.previewInvitation(this.token),
        this.legalService.current(),
      ]);
      this.preview.set(preview);
      this.legal.set(legal);
    } catch {
      this.gone.set(true);
    }
  }

  protected canSubmit(legalComplete: boolean): boolean {
    if (!legalComplete) return false;
    if (this.preview()?.accountExists) return this.password.length > 0;
    return this.fullName.trim().length > 0 && this.password.length >= 10 && this.password === this.confirm;
  }

  protected async accept(marketing: boolean): Promise<void> {
    const legal = this.legal();
    if (!legal) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.acceptInvitation(this.token, {
        fullName: this.preview()?.accountExists ? undefined : this.fullName.trim(),
        password: this.password,
        privacyDocumentId: legal.privacy.id,
        termsDocumentId: legal.terms.id,
        marketingConsent: marketing,
      });
      await this.router.navigate(['/']);
    } catch (error) {
      const { code } = apiErrorOf(error);
      if (code === 'INVITATION_INVALID') this.gone.set(true);
      if (code === 'LEGAL_OUTDATED') this.legal.set(await this.legalService.current());
      const known = ['INVALID_CREDENTIALS', 'LEGAL_OUTDATED', 'INVALID_INPUT', 'TOO_MANY_ATTEMPTS', 'PLAN_LIMIT', 'ACCOUNT_INACTIVE'];
      this.error.set(this.transloco.translate(`invitation.errors.${known.includes(code) ? code : 'UNKNOWN'}`));
    } finally {
      this.busy.set(false);
    }
  }
}
