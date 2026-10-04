import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * Asked when the diagram editor is about to close with unsaved changes. Closes with `true` to
 * discard them and leave, or `false`/`undefined` (Escape, backdrop) to keep editing — so the safe
 * choice is always the default.
 */
@Component({
  selector: 'app-diagram-unsaved-changes-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, TranslocoModule],
  template: `
    <h2 mat-dialog-title>{{ 'valoracion.diagram.unsaved.title' | transloco }}</h2>
    <mat-dialog-content>{{ 'valoracion.diagram.unsaved.message' | transloco }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" [mat-dialog-close]="true">
        {{ 'valoracion.diagram.unsaved.discard' | transloco }}
      </button>
      <button mat-flat-button color="primary" type="button" [mat-dialog-close]="false" cdkFocusInitial>
        {{ 'valoracion.diagram.unsaved.keepEditing' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
})
export class DiagramUnsavedChangesDialogComponent {}
