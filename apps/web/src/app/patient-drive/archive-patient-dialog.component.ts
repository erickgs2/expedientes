import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * Asked before a patient is archived. Archiving replaces deleting (NOM-004-SSA3-2012 5.4: a record
 * is kept at least five years after the last care), so the dialog says what happens to the record
 * and asks why, since the reason is shown on the archived record and kept in the audit log. Closes
 * with the reason, or `null` on Cancel, Escape or the backdrop; Cancel keeps initial focus.
 */
@Component({
  selector: 'app-archive-patient-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, TranslocoModule],
  template: `
    <h2 mat-dialog-title>{{ 'patientDrive.archive.title' | transloco: { name: data.fullName } }}</h2>
    <mat-dialog-content>
      <ul class="effects">
        <li>{{ 'patientDrive.archive.kept' | transloco }}</li>
        <li>{{ 'patientDrive.archive.lists' | transloco }}</li>
        <li>{{ 'patientDrive.archive.appointments' | transloco }}</li>
        <li>{{ 'patientDrive.archive.restore' | transloco }}</li>
      </ul>
      <mat-form-field appearance="outline" class="reason" subscriptSizing="dynamic">
        <mat-label>{{ 'patientDrive.archive.reason' | transloco }}</mat-label>
        <textarea
          matInput
          rows="3"
          maxlength="500"
          required
          [ngModel]="reason()"
          (ngModelChange)="reason.set($event)"
          [placeholder]="'patientDrive.archive.reasonHint' | transloco"
        ></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="null" cdkFocusInitial>
        {{ 'common.cancel' | transloco }}
      </button>
      <button mat-flat-button type="button" [disabled]="!reason().trim()" (click)="confirm()">
        {{ 'patientDrive.archive.confirm' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .effects {
        margin: 0 0 16px;
        padding-left: 20px;
        color: var(--mat-sys-on-surface-variant);
        line-height: 1.5;
      }
      .effects li + li {
        margin-top: 4px;
      }
      .reason {
        width: 100%;
      }
    `,
  ],
})
export class ArchivePatientDialogComponent {
  protected readonly data = inject<{ fullName: string }>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ArchivePatientDialogComponent, string | null>);
  protected readonly reason = signal('');

  protected confirm(): void {
    const reason = this.reason().trim();
    if (reason) this.dialogRef.close(reason);
  }
}
