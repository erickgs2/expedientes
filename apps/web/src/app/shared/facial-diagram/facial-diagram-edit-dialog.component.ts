import { Component, computed, inject, signal, viewChildren } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoModule } from '@jsverse/transloco';
import type { DiagramView, DiagramViewRecord, PermissionModule } from '@expedientes/shared-types';
import { FacialDiagramCanvasComponent } from './facial-diagram-canvas.component';
import type { DiagramDataSource, DiagramReferenceOption } from './diagram-data-source';
import { DiagramUnsavedChangesDialogComponent } from './diagram-unsaved-changes-dialog.component';
import { CLOSE_UP_VIEWS } from './diagram-geometry';

export interface FacialDiagramEditDialogData {
  /** The view the editor opens on. */
  view: DiagramView;
  /** i18n label key per view (title and close-up selector). */
  viewLabelKeys: Record<DiagramView, string>;
  permissionModule: PermissionModule;
  canEdit: boolean;
  /** Current stored data per view; a missing or `null` entry means that view is empty. */
  initialData: Partial<Record<DiagramView, Record<string, unknown> | null>>;
  dataSource: DiagramDataSource;
  referenceOptions: DiagramReferenceOption[];
}

export interface FacialDiagramEditDialogResult {
  saved: boolean;
  /** The data just saved, for every view that was saved (`null` = that view is now empty). */
  views: Partial<Record<DiagramView, Record<string, unknown> | null>>;
}

/** Server payload keys per view — the shape `DiagramDataSource.save` sends to the API. */
const VIEW_SERVER_KEYS: Record<DiagramView, string> = {
  FRONT: 'front',
  LEFT_PROFILE: 'leftProfile',
  RIGHT_PROFILE: 'rightProfile',
  EYES: 'eyes',
  NOSE: 'nose',
  LIPS: 'lips',
};

/** The front view's editor also offers its close-ups; profiles are edited on their own. */
const FRONT_FAMILY: DiagramView[] = ['FRONT', ...CLOSE_UP_VIEWS];

/**
 * Fullscreen-friendly editor for a diagram view. The inline previews stay lightweight;
 * all drawing happens here, where the canvas can use the whole dialog width — on phones this is
 * what keeps the fixed-coordinate canvas usable without page-level horizontal scrolling.
 * Saving persists ONLY this view (the API leaves omitted views untouched), then closes with the
 * serialized data so the opener can refresh its preview.
 *
 * Laid out to never scroll: the dialog has a fixed height, the toolbar keeps its natural height
 * and the canvas scales to fit whatever is left, so the tools stay visible at all times.
 *
 * Closing with unsaved changes (backdrop click, Escape or Cancel) asks before discarding them.
 *
 * Opened on the front view (or one of its close-ups), it also offers the close-ups — eyes, nose,
 * lips — through a selector. Each close-up is its own stored view with its own canvas; canvases are
 * created the first time their view is picked and then kept (hidden) so switching back and forth
 * never loses work, and Save persists every view opened in this session in one request.
 */
@Component({
  selector: 'app-facial-diagram-edit-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatSelectModule,
    TranslocoModule,
    FacialDiagramCanvasComponent,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.viewLabelKeys[activeView()] | transloco }}</h2>
    <mat-dialog-content class="diagram-dialog-content">
      @if (views.length > 1) {
        <mat-button-toggle-group
          class="diagram-close-ups"
          [value]="activeView()"
          [hideSingleSelectionIndicator]="true"
          [attr.aria-label]="'valoracion.diagram.closeUps.label' | transloco"
        >
          @for (view of views; track view) {
            <mat-button-toggle [value]="view" (click)="selectView(view)">
              {{ (view === 'FRONT' ? 'valoracion.diagram.closeUps.full' : data.viewLabelKeys[view]) | transloco }}
            </mat-button-toggle>
          }
        </mat-button-toggle-group>
      }
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
      @for (view of views; track view) {
        @if (openedViews().includes(view)) {
          <app-facial-diagram-canvas
            [class.inactive]="view !== activeView()"
            [view]="view"
            [permissionModule]="data.permissionModule"
            [initialDiagramData]="data.initialData[view] ?? null"
            [referenceData]="referenceData(view)"
          />
        }
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="requestClose()">{{ 'common.cancel' | transloco }}</button>
      @if (data.canEdit) {
        <button
          mat-flat-button
          color="primary"
          type="button"
          [disabled]="saving() || !activeLoaded()"
          (click)="save()"
        >
          {{ 'valoracion.diagram.save' | transloco }}
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      .diagram-dialog-content {
        flex: 1 1 auto;
        min-height: 0;
        max-height: none;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      app-facial-diagram-canvas {
        flex: 1 1 auto;
      }
      app-facial-diagram-canvas.inactive {
        display: none;
      }
      .diagram-close-ups {
        flex: none;
        align-self: flex-start;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }
      .diagram-reference {
        flex: none;
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

  private readonly dialog = inject(MatDialog);

  private readonly canvases = viewChildren(FacialDiagramCanvasComponent);

  protected readonly views: DiagramView[] = FRONT_FAMILY.includes(this.data.view)
    ? FRONT_FAMILY
    : [this.data.view];
  protected readonly activeView = signal<DiagramView>(this.data.view);
  /** Views whose canvas has been created (in order of first use). */
  protected readonly openedViews = signal<DiagramView[]>([this.data.view]);
  protected readonly activeLoaded = computed(
    () => this.canvases().find((c) => c.view === this.activeView())?.loaded() ?? false
  );

  protected readonly saving = signal(false);
  protected readonly referenceEnabled = signal(false);
  protected readonly selectedReferenceId = signal<string | null>(null);
  private readonly referenceDiagrams = signal<DiagramViewRecord[]>([]);
  /** Guards against stacking a second confirmation from a repeated backdrop click / Escape. */
  private confirmingClose = false;

  constructor() {
    // Every implicit close goes through `requestClose` so unsaved drawing is never lost silently.
    this.dialogRef.disableClose = true;
    this.dialogRef
      .backdropClick()
      .pipe(takeUntilDestroyed())
      .subscribe(() => void this.requestClose());
    this.dialogRef
      .keydownEvents()
      .pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        void this.requestClose();
      });
  }

  /** Closes without saving, first confirming with the user when the diagram has unsaved changes. */
  protected async requestClose(): Promise<void> {
    if (this.saving() || this.confirmingClose) return;
    if (this.data.canEdit && this.canvases().some((c) => c.dirty())) {
      this.confirmingClose = true;
      const discard = await firstValueFrom(
        this.dialog.open(DiagramUnsavedChangesDialogComponent).afterClosed()
      );
      this.confirmingClose = false;
      if (discard !== true) return;
    }
    this.dialogRef.close({ saved: false, views: {} });
  }

  protected selectView(view: DiagramView): void {
    this.activeView.set(view);
    this.openedViews.update((opened) => (opened.includes(view) ? opened : [...opened, view]));
  }

  protected referenceData(view: DiagramView): Record<string, unknown> | null {
    return this.referenceDiagrams().find((d) => d.view === view)?.data ?? null;
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
      // Only canvases that finished loading: one that didn't would overwrite its stored view with
      // a partial/empty object set (see `FacialDiagramCanvasComponent.loaded`).
      const views: FacialDiagramEditDialogResult['views'] = {};
      const payload: Record<string, Record<string, unknown> | null> = {};
      for (const canvas of this.canvases()) {
        if (!canvas.loaded()) continue;
        const serialized = canvas.getSerializedData();
        views[canvas.view] = serialized;
        payload[VIEW_SERVER_KEYS[canvas.view]] = serialized;
      }
      await this.data.dataSource.save(payload);
      this.dialogRef.close({ saved: true, views });
    } finally {
      this.saving.set(false);
    }
  }
}
