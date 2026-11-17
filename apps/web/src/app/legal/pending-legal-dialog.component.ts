import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { TranslocoModule } from '@jsverse/transloco';
import type { LegalDocumentSummary } from '@expedientes/shared-types';
import { LegalService } from './legal.service';
import { LegalDocumentDialogComponent } from './legal-document-dialog.component';

export type PendingLegalResult = 'accepted' | 'logout';

/**
 * Shown over the whole app when a new privacy notice or terms version requires acceptance: what
 * changed, a link to read it, and only two ways out, accept or sign out.
 */
@Component({
  selector: 'app-pending-legal-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatCheckboxModule, TranslocoModule],
  template: `
    <h2 mat-dialog-title>{{ 'legal.pending.title' | transloco }}</h2>
    <mat-dialog-content>
      <p>{{ 'legal.pending.intro' | transloco }}</p>
      @for (doc of docs; track doc.id) {
        <div class="doc">
          <p class="doc-title">
            {{ (doc.kind === 'PRIVACY' ? 'legal.privacyNotice' : 'legal.terms') | transloco }}
            <span class="version">v{{ doc.version }}</span>
          </p>
          <p class="summary">{{ doc.changeSummary }}</p>
          <button mat-button type="button" (click)="read(doc)">{{ 'legal.pending.read' | transloco }}</button>
        </div>
      }
      <mat-checkbox [(ngModel)]="agreed">{{ 'legal.pending.agree' | transloco }}</mat-checkbox>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close('logout')">{{ 'shell.logout' | transloco }}</button>
      <button mat-flat-button type="button" [disabled]="!agreed || saving()" (click)="accept()">
        {{ 'legal.pending.accept' | transloco }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .doc {
        padding: 10px 12px;
        border: 1px solid var(--plate-line);
        border-radius: var(--plate-radius);
        margin-bottom: 10px;
      }
      .doc-title {
        margin: 0;
        font-weight: 600;
      }
      .version {
        font-weight: 400;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .summary {
        margin: 4px 0 0;
        white-space: pre-line;
      }
    `,
  ],
})
export class PendingLegalDialogComponent {
  protected readonly docs = inject<LegalDocumentSummary[]>(MAT_DIALOG_DATA);
  protected readonly ref = inject(MatDialogRef<PendingLegalDialogComponent, PendingLegalResult>);
  private readonly legal = inject(LegalService);
  private readonly dialog = inject(MatDialog);
  protected agreed = false;
  protected readonly saving = signal(false);

  protected async read(doc: LegalDocumentSummary): Promise<void> {
    const page = await this.legal.page(doc.kind === 'PRIVACY' ? 'privacy' : 'terms', doc.version);
    this.dialog.open(LegalDocumentDialogComponent, {
      data: page.document,
      maxWidth: 720,
      width: '92vw',
      maxHeight: '86vh',
    });
  }

  protected async accept(): Promise<void> {
    this.saving.set(true);
    try {
      await this.legal.accept(this.docs.map((doc) => doc.id));
      this.ref.close('accepted');
    } finally {
      this.saving.set(false);
    }
  }
}
