import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslocoModule } from '@jsverse/transloco';
import type { AddendumKind, ClinicalAddendum, DiagramView, DiagramViewRecord, PermissionModule } from '@expedientes/shared-types';
import { FacialDiagramViewsComponent } from '../facial-diagram/facial-diagram-views.component';
import type { DiagramDataSource, DiagramReferenceOption } from '../facial-diagram/diagram-data-source';
import { NoteSignatureService } from './note-signature.service';

/** Diagrams of the signed note the addendum's drawing can show underneath as a reference. */
export interface AddendumDiagramReferences {
  options(): DiagramReferenceOption[];
  get(id: string): Promise<DiagramViewRecord[]>;
}

export interface AddendumDialogData {
  kind: AddendumKind;
  id: string;
  permissionModule: PermissionModule;
  references?: AddendumDiagramReferences;
}

/**
 * Writes and signs an addendum to a signed note in one step (NOM-004-SSA3-2012 5.10): text, an
 * optional drawing made with the same diagram tool as the note, and the author's signing PIN. Says
 * plainly that the signed note stays as it is and that the addendum cannot be changed afterwards.
 * Closes with the new addendum, or nothing.
 */
@Component({
  selector: 'app-addendum-dialog',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    TranslocoModule,
    FacialDiagramViewsComponent,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'noteSignature.addendum.title' | transloco }}</h2>
    <form (ngSubmit)="submit()">
      <mat-dialog-content>
        <p class="lead">{{ 'noteSignature.addendum.lead' | transloco }}</p>
        @if (setupNeeded(); as key) {
          <p class="setup" role="alert">{{ key | transloco }}</p>
        } @else {
          <mat-form-field appearance="outline" class="text" subscriptSizing="dynamic">
            <mat-label>{{ 'noteSignature.addendum.text' | transloco }}</mat-label>
            <textarea
              matInput
              name="text"
              rows="5"
              maxlength="10000"
              cdkFocusInitial
              [ngModel]="text()"
              (ngModelChange)="text.set($event); error.set(null)"
            ></textarea>
          </mat-form-field>

          @if (drawing()) {
            <section class="drawing" [attr.aria-label]="'noteSignature.addendum.diagram' | transloco">
              <h3>{{ 'noteSignature.addendum.diagram' | transloco }}</h3>
              <app-facial-diagram-views [dataSource]="diagramSource" [permissionModule]="data.permissionModule" />
            </section>
          } @else {
            <button mat-button type="button" class="add-drawing" (click)="drawing.set(true)">
              + {{ 'noteSignature.addendum.addDiagram' | transloco }}
            </button>
          }

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
          <button mat-flat-button type="submit" [disabled]="busy() || !ready()">
            {{ 'noteSignature.addendum.sign' | transloco }}
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
        max-width: 60ch;
      }
      .text {
        width: 100%;
      }
      .drawing {
        margin: 12px 0 16px;
        padding-top: 12px;
        border-top: 1px solid var(--plate-line);
      }
      .drawing h3 {
        margin: 0 0 8px;
        font-size: 0.875rem;
        font-weight: 600;
      }
      .add-drawing {
        margin: 4px 0 16px;
      }
      .pin {
        display: block;
        width: 220px;
        margin-top: 8px;
      }
      .pin input {
        font-size: 1.25rem;
        letter-spacing: 0.3em;
        font-variant-numeric: tabular-nums;
      }
      .error {
        margin: 8px 0 0;
        color: var(--mat-sys-error);
      }
      .setup {
        margin: 8px 0 0;
      }
    `,
  ],
})
export class AddendumDialogComponent {
  protected readonly data = inject<AddendumDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<AddendumDialogComponent, ClinicalAddendum | null>);
  private readonly service = inject(NoteSignatureService);

  protected readonly text = signal('');
  protected readonly pin = signal('');
  protected readonly drawing = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly setupNeeded = signal<string | null>(null);

  /** The addendum's drawing lives here until it is signed; nothing is saved before that. */
  private readonly views = new Map<DiagramView, Record<string, unknown>>();

  protected readonly diagramSource: DiagramDataSource = {
    listReferenceOptions: async () => this.data.references?.options() ?? [],
    getReferenceViews: async (id) => (this.data.references ? this.data.references.get(id) : []),
    save: async (changes) => {
      for (const [view, value] of Object.entries(changes) as [DiagramView, Record<string, unknown> | null][]) {
        if (value && Array.isArray(value['objects']) && value['objects'].length > 0) this.views.set(view, value);
        else this.views.delete(view);
      }
      const now = new Date().toISOString();
      return [...this.views].map(([view, data]) => ({ view, data, updatedAt: now }));
    },
  };

  protected ready(): boolean {
    return /^\d{6}$/.test(this.pin()) && (this.text().trim().length > 0 || this.views.size > 0);
  }

  protected async submit(): Promise<void> {
    if (!this.ready() || this.busy()) return;
    this.busy.set(true);
    try {
      const addendum = await this.service.addAddendum(this.data.kind, this.data.id, {
        text: this.text().trim(),
        diagrams: [...this.views].map(([view, data]) => ({ view, data })),
        pin: this.pin(),
      });
      this.dialogRef.close(addendum);
    } catch (error) {
      const code = error instanceof HttpErrorResponse ? error.error?.error?.code : undefined;
      if (code === 'NO_SIGNING_PIN' || code === 'LICENSE_REQUIRED') {
        this.setupNeeded.set(`noteSignature.errors.${code}`);
      } else {
        this.pin.set('');
        this.error.set(
          code === 'WRONG_PIN' || code === 'TOO_MANY_ATTEMPTS' ? `noteSignature.errors.${code}` : 'noteSignature.errors.UNKNOWN'
        );
      }
    } finally {
      this.busy.set(false);
    }
  }
}
