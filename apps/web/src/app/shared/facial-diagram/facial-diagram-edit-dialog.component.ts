import { Component, inject, signal, viewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoModule } from '@jsverse/transloco';
import type { DiagramView, DiagramViewRecord, PermissionModule } from '@expedientes/shared-types';
import { FacialDiagramCanvasComponent } from './facial-diagram-canvas.component';
import type { DiagramDataSource, DiagramReferenceOption } from './diagram-data-source';

export interface FacialDiagramEditDialogData {
  view: DiagramView;
  viewLabelKey: string;
  permissionModule: PermissionModule;
  canEdit: boolean;
  initialData: Record<string, unknown> | null;
  dataSource: DiagramDataSource;
  referenceOptions: DiagramReferenceOption[];
}

export interface FacialDiagramEditDialogResult {
  saved: boolean;
  data: Record<string, unknown> | null;
}

/** Server payload keys per view — the shape `DiagramDataSource.save` sends to the API. */
const VIEW_SERVER_KEYS: Record<DiagramView, string> = {
  FRONT: 'front',
  LEFT_PROFILE: 'leftProfile',
  RIGHT_PROFILE: 'rightProfile',
};

/**
 * Fullscreen-friendly editor for a single diagram view. The inline previews stay lightweight;
 * all drawing happens here, where the canvas can use the whole dialog width — on phones this is
 * what keeps the fixed-coordinate canvas usable without page-level horizontal scrolling.
 * Saving persists ONLY this view (the API leaves omitted views untouched), then closes with the
 * serialized data so the opener can refresh its preview.
 */
@Component({
  selector: 'app-facial-diagram-edit-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatSelectModule,
    TranslocoModule,
    FacialDiagramCanvasComponent,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.viewLabelKey | transloco }}</h2>
    <mat-dialog-content>
      @if (data.referenceOptions.length > 0) {
        <div class="diagram-reference">
          <mat-checkbox [checked]="referenceEnabled()" (change)="toggleReference($event.checked)">
            {{ 'valoracion.diagram.reference.toggle' | transloco }}
          </mat-checkbox>
          @if (referenceEnabled()) {
            <mat-form-field appearance="outline" class="diagram-reference-select" subscriptSizing="dynamic">
              <mat-label>{{ 'valoracion.diagram.reference.pick' | transloco }}</mat-label>
              <mat-select
                [value]="selectedReferenceId()"
                (selectionChange)="selectReference($event.value)"
              >
                @for (option of data.referenceOptions; track option.id) {
                  <mat-option [value]="option.id">{{ option.label }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }
        </div>
      }
      <app-facial-diagram-canvas
        #canvasRef
        [view]="data.view"
        [permissionModule]="data.permissionModule"
        [initialDiagramData]="data.initialData"
        [referenceData]="referenceData()"
      />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">{{ 'common.cancel' | transloco }}</button>
      @if (data.canEdit) {
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="saving() || !canvasRef.loaded()"
          (click)="save()"
        >
          {{ 'valoracion.diagram.save' | transloco }}
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: [
    `
      .diagram-reference {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 12px;
      }
      .diagram-reference-select {
        width: 220px;
      }
    `,
  ],
})
export class FacialDiagramEditDialogComponent {
  // Dialog data is injected before the field initializers below that depend on it (this app's
  // MAT_DIALOG_DATA ordering convention).
  protected readonly data = inject<FacialDiagramEditDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<FacialDiagramEditDialogComponent, FacialDiagramEditDialogResult>>(MatDialogRef);

  private readonly canvas = viewChild.required<FacialDiagramCanvasComponent>('canvasRef');

  protected readonly saving = signal(false);
  protected readonly referenceEnabled = signal(false);
  protected readonly selectedReferenceId = signal<string | null>(null);
  private readonly referenceDiagrams = signal<DiagramViewRecord[]>([]);

  protected referenceData(): Record<string, unknown> | null {
    return this.referenceDiagrams().find((d) => d.view === this.data.view)?.data ?? null;
  }

  protected toggleReference(checked: boolean): void {
    this.referenceEnabled.set(checked);
    if (!checked) {
      this.selectedReferenceId.set(null);
      this.referenceDiagrams.set([]);
    }
  }

  protected async selectReference(id: string | null): Promise<void> {
    this.selectedReferenceId.set(id);
    // Cleared *before* the await so a slow fetch never shows the previous option's overlay under
    // the newly-selected option's label; a failed fetch falls back to "no overlay" the same way.
    this.referenceDiagrams.set([]);
    if (!id) return;
    const views = await this.data.dataSource.getReferenceViews(id);
    // Discard a stale response if the user picked something else while this was in flight.
    if (this.selectedReferenceId() !== id) return;
    this.referenceDiagrams.set(views);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    try {
      const serialized = this.canvas().getSerializedData();
      await this.data.dataSource.save({ [VIEW_SERVER_KEYS[this.data.view]]: serialized });
      this.dialogRef.close({ saved: true, data: serialized });
    } finally {
      this.saving.set(false);
    }
  }
}
