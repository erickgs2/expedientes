import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoModule } from '@jsverse/transloco';

export interface PurgePatientDialogData {
  fullName: string;
  /** Formatted date of the last care, the start of the five-year retention. */
  lastCare: string;
}

/**
 * The one irreversible step: deleting an archived record for good, offered only to the clinic's
 * owner once the five-year retention has passed. The patient's full name must be typed to enable
 * the button; Cancel keeps initial focus. Closes with the typed name, or `null`.
 */
@Component({
  selector: 'app-purge-patient-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, TranslocoModule],
  template: `
    <h2 mat-dialog-title>{{ 'patientDrive.purge.title' | transloco }}</h2>
    <mat-dialog-content>
      <p>{{ 'patientDrive.purge.message' | transloco: { name: data.fullName, date: data.lastCare } }}</p>
      <mat-form-field appearance="outline" class="confirm" subscriptSizing="dynamic">
        <mat-label>{{ 'patientDrive.purge.typeName' | transloco }}</mat-label>
        <input matInput autocomplete="off" [ngModel]="typed()" (ngModelChange)="typed.set($event)" />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="null" cdkFocusInitial>
        {{ 'common.cancel' | transloco }}
      </button>
      <button mat-flat-button color="warn" type="button" [disabled]="!matches()" (click)="confirm()">
        {{ 'patientDrive.purge.confirm' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      p {
        margin: 0 0 16px;
      }
      .confirm {
        width: 100%;
      }
    `,
  ],
})
export class PurgePatientDialogComponent {
  protected readonly data = inject<PurgePatientDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<PurgePatientDialogComponent, string | null>);
  protected readonly typed = signal('');

  protected matches(): boolean {
    return this.typed().trim() === this.data.fullName.trim();
  }

  protected confirm(): void {
    if (this.matches()) this.dialogRef.close(this.typed().trim());
  }
}
