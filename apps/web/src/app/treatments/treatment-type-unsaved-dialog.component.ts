import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * Asked when the treatment form is about to close with unsaved changes. Closes with `true` to
 * discard them, `false`/`undefined` (Escape, backdrop) to keep editing — the safe choice is the
 * default.
 */
@Component({
  selector: 'app-treatment-type-unsaved-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, TranslocoModule],
  template: `
    <h2 mat-dialog-title>{{ 'treatmentCatalog.form.unsavedDialog.title' | transloco }}</h2>
    <mat-dialog-content>{{ 'treatmentCatalog.form.unsavedDialog.message' | transloco }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="true">
        {{ 'treatmentCatalog.form.unsavedDialog.discard' | transloco }}
      </button>
      <button mat-flat-button color="primary" type="button" [mat-dialog-close]="false" cdkFocusInitial>
        {{ 'treatmentCatalog.form.unsavedDialog.keepEditing' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
})
export class TreatmentTypeUnsavedDialogComponent {}
