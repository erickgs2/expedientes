import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * Asked before a patient is permanently deleted. Closes with `true` only on the explicit delete
 * button; Escape, the backdrop and Cancel all leave the patient alone, and Cancel has initial
 * focus so a stray Enter cannot confirm an irreversible action.
 */
@Component({
  selector: 'app-delete-patient-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, TranslocoModule],
  template: `
    <h2 mat-dialog-title>{{ 'patientDrive.delete.title' | transloco }}</h2>
    <mat-dialog-content>
      {{ 'patientDrive.delete.message' | transloco: { name: data.fullName } }}
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="false" cdkFocusInitial>
        {{ 'common.cancel' | transloco }}
      </button>
      <button mat-flat-button color="warn" type="button" [mat-dialog-close]="true">
        {{ 'patientDrive.delete.confirm' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
})
export class DeletePatientDialogComponent {
  protected readonly data = inject<{ fullName: string }>(MAT_DIALOG_DATA);
}
