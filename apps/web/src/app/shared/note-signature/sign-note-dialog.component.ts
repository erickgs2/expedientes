import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoModule } from '@jsverse/transloco';
import type { NoteKind, NoteSignature } from '@expedientes/shared-types';
import { NoteSignatureService } from './note-signature.service';

export interface SignNoteDialogData {
  kind: NoteKind;
  id: string;
}

/**
 * Signs a note with the author's 6-digit PIN (NOM-004-SSA3-2012 5.10). Says plainly what signing
 * means, and when signing is not possible yet (no PIN, no licence) points to the profile.
 * Closes with the new signature, or nothing.
 */
@Component({
  selector: 'app-sign-note-dialog',
  standalone: true,
  imports: [FormsModule, RouterLink, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, TranslocoModule],
  template: `
    <h2 mat-dialog-title>{{ 'noteSignature.dialog.title' | transloco }}</h2>
    <form (ngSubmit)="sign()">
      <mat-dialog-content>
        <p class="lead">{{ 'noteSignature.dialog.lead' | transloco }}</p>
        @if (setupNeeded(); as key) {
          <p class="setup" role="alert">{{ key | transloco }}</p>
        } @else {
          <mat-form-field appearance="outline" class="pin" subscriptSizing="dynamic">
            <mat-label>{{ 'noteSignature.dialog.pin' | transloco }}</mat-label>
            <input
              matInput
              name="pin"
              type="password"
              inputmode="numeric"
              autocomplete="off"
              maxlength="6"
              pattern="[0-9]*"
              cdkFocusInitial
              [ngModel]="pin()"
              (ngModelChange)="pin.set($event); error.set(null)"
            />
          </mat-form-field>
          @if (error(); as key) {
            <p class="error" role="alert">{{ key | transloco }}</p>
          }
        }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" [mat-dialog-close]="null">{{ 'common.cancel' | transloco }}</button>
        @if (setupNeeded()) {
          <a mat-flat-button routerLink="/perfil" [mat-dialog-close]="null">{{ 'noteSignature.dialog.goToProfile' | transloco }}</a>
        } @else {
          <button mat-flat-button type="submit" [disabled]="busy() || !validPin()">
            {{ 'noteSignature.dialog.sign' | transloco }}
          </button>
        }
      </mat-dialog-actions>
    </form>
  `,
  styles: [
    `
      .lead {
        margin: 0 0 16px;
        color: var(--mat-sys-on-surface-variant);
        max-width: 52ch;
      }
      .pin {
        width: 220px;
      }
      .pin input {
        font-size: 1.25rem;
        letter-spacing: 0.3em;
        font-variant-numeric: tabular-nums;
      }
      .error,
      .setup {
        margin: 8px 0 0;
        color: var(--mat-sys-error);
      }
      .setup {
        color: var(--mat-sys-on-surface);
      }
    `,
  ],
})
export class SignNoteDialogComponent {
  private readonly data = inject<SignNoteDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<SignNoteDialogComponent, NoteSignature | null>);
  private readonly service = inject(NoteSignatureService);

  protected readonly pin = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly setupNeeded = signal<string | null>(null);

  protected validPin(): boolean {
    return /^\d{6}$/.test(this.pin());
  }

  protected async sign(): Promise<void> {
    if (!this.validPin() || this.busy()) return;
    this.busy.set(true);
    try {
      this.dialogRef.close(await this.service.sign(this.data.kind, this.data.id, this.pin()));
    } catch (error) {
      const code = error instanceof HttpErrorResponse ? error.error?.error?.code : undefined;
      if (code === 'NO_SIGNING_PIN' || code === 'LICENSE_REQUIRED') {
        this.setupNeeded.set(`noteSignature.errors.${code}`);
      } else {
        this.pin.set('');
        this.error.set(
          code === 'WRONG_PIN' || code === 'TOO_MANY_ATTEMPTS' || code === 'ALREADY_SIGNED'
            ? `noteSignature.errors.${code}`
            : 'noteSignature.errors.UNKNOWN'
        );
      }
    } finally {
      this.busy.set(false);
    }
  }
}
