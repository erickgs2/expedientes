import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoModule } from '@jsverse/transloco';
import type { LegalDocumentView } from '@expedientes/shared-types';
import { LegalDocumentViewComponent } from './legal-document-view.component';

/** A legal document read in place, so a form being filled in is not left behind. */
@Component({
  selector: 'app-legal-document-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, TranslocoModule, LegalDocumentViewComponent],
  template: `
    <mat-dialog-content>
      <p class="meta">
        {{ 'legal.version' | transloco: { version: doc.version, date: date(doc.effectiveFrom) } }}
      </p>
      <app-legal-document-view [markdown]="doc.body" />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button mat-dialog-close>{{ 'common.close' | transloco }}</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .meta {
        margin: 0 0 12px;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
    `,
  ],
})
export class LegalDocumentDialogComponent {
  protected readonly doc = inject<LegalDocumentView>(MAT_DIALOG_DATA);
  protected date(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  }
}
