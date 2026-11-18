import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import type { UserProfile } from '@expedientes/shared-types';
import { NoteSignatureService } from '../shared/note-signature/note-signature.service';

/**
 * The user's own profile: the title and professional licence (cédula) that print with every note
 * they sign, and the 6-digit PIN they sign with (NOM-004-SSA3-2012 5.10). Setting the PIN asks for
 * the account password.
 */
@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, TranslocoModule],
  template: `
    <header class="page-head">
      <h1>{{ 'profile.title' | transloco }}</h1>
      @if (profile(); as p) {
        <p>{{ p.fullName }} · {{ p.email }}</p>
      }
    </header>

    @if (profile(); as p) {
      <section class="card">
        <h2>{{ 'profile.signsAs' | transloco }}</h2>
        <p class="hint">{{ 'profile.signsAsHelp' | transloco }}</p>
        <form class="row" (ngSubmit)="saveIdentity()">
          <mat-form-field appearance="outline" class="title-field" subscriptSizing="dynamic">
            <mat-label>{{ 'profile.professionalTitle' | transloco }}</mat-label>
            <input matInput name="title" maxlength="60" placeholder="Dra." [(ngModel)]="title" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="grow" subscriptSizing="dynamic">
            <mat-label>{{ 'profile.professionalLicense' | transloco }}</mat-label>
            <input matInput name="license" maxlength="60" inputmode="numeric" [(ngModel)]="license" />
          </mat-form-field>
          <button mat-flat-button type="submit" [disabled]="savingIdentity()">{{ 'common.save' | transloco }}</button>
        </form>
        <p class="preview">
          {{ 'profile.preview' | transloco }}
          <strong>{{ signerLine(p.fullName) }}</strong>
          @if (license.trim()) {
            · {{ 'noteSignature.license' | transloco: { license: license.trim() } }}
          }
        </p>
      </section>

      <section class="card">
        <h2>{{ 'profile.pinTitle' | transloco }}</h2>
        <p class="state">
          @if (p.hasSigningPin) {
            <mat-icon aria-hidden="true">check</mat-icon>{{ 'profile.pinSet' | transloco }}
          } @else {
            <span class="dot" aria-hidden="true"></span>{{ 'profile.pinMissing' | transloco }}
          }
        </p>
        <p class="hint">{{ 'profile.pinHelp' | transloco }}</p>
        <form class="pin-form" (ngSubmit)="savePin()">
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'profile.newPin' | transloco }}</mat-label>
            <input matInput name="pin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" [(ngModel)]="pin" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'profile.confirmPin' | transloco }}</mat-label>
            <input matInput name="pin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" [(ngModel)]="pin2" />
          </mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic">
            <mat-label>{{ 'profile.currentPassword' | transloco }}</mat-label>
            <input matInput name="password" type="password" autocomplete="current-password" [(ngModel)]="password" />
          </mat-form-field>
          @if (pinError(); as key) {
            <p class="error" role="alert">{{ key | transloco }}</p>
          }
          <div>
            <button mat-flat-button type="submit" [disabled]="savingPin() || !pinReady()">
              {{ (p.hasSigningPin ? 'profile.changePin' : 'profile.setPin') | transloco }}
            </button>
          </div>
        </form>
      </section>
    } @else if (failed()) {
      <p>{{ 'common.loadError' | transloco }}</p>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 720px;
      }
      .page-head h1 {
        margin: 0;
      }
      .page-head p {
        margin: 2px 0 20px;
        color: var(--mat-sys-on-surface-variant);
      }
      .card {
        padding: 16px 20px 20px;
        margin-bottom: 16px;
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
        background: var(--mat-sys-surface);
      }
      h2 {
        margin: 0 0 4px;
        font-size: 1.125rem;
        font-weight: 600;
      }
      .hint {
        margin: 0 0 16px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
        max-width: 60ch;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
      }
      .title-field {
        width: 120px;
      }
      .grow {
        flex: 1 1 220px;
      }
      .preview {
        margin: 12px 0 0;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .preview strong {
        color: var(--mat-sys-on-surface);
        font-weight: 600;
      }
      .state {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 4px 0 8px;
        font-weight: 500;
      }
      .state mat-icon {
        width: 18px;
        height: 18px;
        font-size: 18px;
      }
      .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--plate-mark);
      }
      .pin-form {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }
      .pin-form > div,
      .pin-form .error {
        grid-column: 1 / -1;
      }
      .error {
        margin: 0;
        color: var(--mat-sys-error);
      }
    `,
  ],
})
export class ProfileComponent implements OnInit {
  private readonly service = inject(NoteSignatureService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);

  protected readonly profile = signal<UserProfile | null>(null);
  protected readonly failed = signal(false);
  protected readonly savingIdentity = signal(false);
  protected readonly savingPin = signal(false);
  protected readonly pinError = signal<string | null>(null);
  protected title = '';
  protected license = '';
  protected pin = '';
  protected pin2 = '';
  protected password = '';

  async ngOnInit(): Promise<void> {
    try {
      this.apply(await this.service.profile());
    } catch {
      this.failed.set(true);
    }
  }

  private apply(profile: UserProfile): void {
    this.profile.set(profile);
    this.title = profile.professionalTitle ?? '';
    this.license = profile.professionalLicense ?? '';
  }

  protected signerLine(fullName: string): string {
    return [this.title.trim(), fullName].filter(Boolean).join(' ');
  }

  protected pinReady(): boolean {
    return /^\d{6}$/.test(this.pin) && !!this.pin2 && !!this.password;
  }

  protected async saveIdentity(): Promise<void> {
    this.savingIdentity.set(true);
    try {
      this.apply(await this.service.updateProfile({ professionalTitle: this.title, professionalLicense: this.license }));
      this.snackBar.open(this.transloco.translate('profile.saved'), undefined, { duration: 3000 });
    } finally {
      this.savingIdentity.set(false);
    }
  }

  protected async savePin(): Promise<void> {
    this.pinError.set(null);
    if (this.pin !== this.pin2) {
      this.pinError.set('profile.errors.mismatch');
      return;
    }
    this.savingPin.set(true);
    try {
      await this.service.setPin(this.password, this.pin);
      this.pin = this.pin2 = this.password = '';
      this.profile.update((p) => (p ? { ...p, hasSigningPin: true } : p));
      this.snackBar.open(this.transloco.translate('profile.pinSaved'), undefined, { duration: 3000 });
    } catch (error) {
      const code = error instanceof HttpErrorResponse ? error.error?.error?.code : undefined;
      this.pinError.set(
        code === 'WRONG_PASSWORD' || code === 'TOO_MANY_ATTEMPTS' ? `profile.errors.${code}` : 'profile.errors.UNKNOWN'
      );
    } finally {
      this.savingPin.set(false);
    }
  }
}
