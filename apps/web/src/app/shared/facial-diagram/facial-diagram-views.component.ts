import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@jsverse/transloco';
import type { DiagramView, DiagramViewRecord, PermissionModule } from '@expedientes/shared-types';
import { AuthService } from '../../auth/auth.service';
import { renderDiagramToBlob } from './diagram-render.util';
import { CLOSE_UP_VIEWS, DIAGRAM_CANVAS_SIZES } from './diagram-geometry';
import {
  FacialDiagramEditDialogComponent,
  type FacialDiagramEditDialogData,
  type FacialDiagramEditDialogResult,
} from './facial-diagram-edit-dialog.component';
import type { DiagramDataSource, DiagramReferenceOption } from './diagram-data-source';

const VIEW_ORDER: DiagramView[] = ['FRONT', 'LEFT_PROFILE', 'RIGHT_PROFILE'];
const ALL_VIEWS: DiagramView[] = [...VIEW_ORDER, ...CLOSE_UP_VIEWS];

const VIEW_LABEL_KEYS: Record<DiagramView, string> = {
  FRONT: 'valoracion.diagram.views.front',
  LEFT_PROFILE: 'valoracion.diagram.views.leftProfile',
  RIGHT_PROFILE: 'valoracion.diagram.views.rightProfile',
  EYES: 'valoracion.diagram.views.eyes',
  NOSE: 'valoracion.diagram.views.nose',
  LIPS: 'valoracion.diagram.views.lips',
};

/**
 * Shows a lightweight read-only preview per view (rendered to a PNG off-screen), with an
 * Edit/View button that opens the interactive canvas in a large dialog. Drawing never happens
 * inline — on phones the fixed-coordinate canvas needs the dialog's full width, and previews keep
 * the page scrollable without touch/draw conflicts.
 *
 * The three full views are always shown; close-ups (eyes, nose, lips — created from the front
 * view's editor) only appear once they have annotations, so an unused close-up adds no clutter.
 */
@Component({
  selector: 'app-facial-diagram-views',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, MatProgressSpinnerModule, TranslocoModule],
  template: `
    <div class="diagram-views">
      @for (view of fullViews; track view) {
        <button type="button" class="view-card" [class.has-marks]="countFor(view) > 0" (click)="openEditor(view)">
          <span class="preview" [style.aspect-ratio]="aspectRatio(view)">
            @if (previewUrls()[view]; as url) {
              <img [src]="url" [alt]="viewLabelKey(view) | transloco" />
            } @else {
              <mat-spinner diameter="32"></mat-spinner>
            }
          </span>
          <span class="card-foot">
            <span class="label">{{ viewLabelKey(view) | transloco }}</span>
            <span class="count">
              @if (countFor(view) > 0) {
                {{ 'diagramEditor.marks' | transloco: { n: countFor(view) } }}
              } @else {
                {{ (canEdit ? 'diagramEditor.noMarksEdit' : 'diagramEditor.noMarks') | transloco }}
              }
            </span>
          </span>
        </button>
      }
    </div>
    <div class="close-ups" role="group" [attr.aria-label]="'valoracion.diagram.closeUps.label' | transloco">
      <span class="close-ups-label">{{ 'valoracion.diagram.closeUps.label' | transloco }}:</span>
      @for (view of closeUps; track view) {
        @if (countFor(view) > 0) {
          <button type="button" class="close-up has-marks" (click)="openEditor(view)">
            {{ viewLabelKey(view) | transloco }} · {{ 'diagramEditor.marks' | transloco: { n: countFor(view) } }}
          </button>
        } @else if (canEdit) {
          <button type="button" class="close-up" (click)="openEditor(view)">
            + {{ viewLabelKey(view) | transloco }}
          </button>
        }
      }
    </div>
  `,
  styles: [
    `
      .diagram-views {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }
      .view-card {
        display: flex;
        flex-direction: column;
        padding: 0;
        border: 1px solid var(--plate-line);
        border-radius: 14px;
        background: var(--mat-sys-surface);
        color: inherit;
        font: inherit;
        text-align: left;
        overflow: hidden;
        cursor: pointer;
        transition: border-color 150ms ease-out;
      }
      .view-card:hover,
      .view-card:focus-visible {
        border-color: var(--plate-line-strong);
      }
      .view-card.has-marks {
        border: 1.5px solid var(--plate-mark);
      }
      .preview {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        max-height: 260px;
        background: #ffffff;
      }
      .preview img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }
      .card-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 10px 14px;
        border-top: 1px solid var(--plate-line);
      }
      .label {
        font-weight: 600;
      }
      .count {
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .has-marks .count {
        color: var(--mat-sys-primary);
        font-weight: 600;
      }
      .close-ups {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        margin-top: 12px;
      }
      .close-ups-label {
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .close-up {
        min-height: 40px;
        padding: 0 14px;
        border: 1px dashed var(--plate-line-strong);
        border-radius: 20px;
        background: transparent;
        color: var(--mat-sys-on-surface-variant);
        font: inherit;
        font-size: 13px;
        cursor: pointer;
      }
      .close-up.has-marks {
        border-style: solid;
        color: var(--mat-sys-on-surface);
        font-weight: 600;
      }
    `,
  ],
})
export class FacialDiagramViewsComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) dataSource!: DiagramDataSource;
  @Input({ required: true }) permissionModule!: PermissionModule;
  @Input() diagrams: DiagramViewRecord[] = [];

  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);

  protected canEdit = false;
  protected readonly fullViews = VIEW_ORDER;
  protected readonly closeUps = CLOSE_UP_VIEWS;
  /** Views with a rendered preview: the full ones always, close-ups once they hold data. */
  protected readonly shownViews = signal<DiagramView[]>(VIEW_ORDER);
  /** Annotation count per view, refreshed with the previews. */
  private readonly counts = signal<Partial<Record<DiagramView, number>>>({});

  protected readonly previewUrls = signal<Partial<Record<DiagramView, string>>>({});
  private readonly pastOptions = signal<DiagramReferenceOption[]>([]);

  /**
   * Live copy of each view's data: starts from the `diagrams` input, then tracks in-session saves
   * made through the edit dialog so previews and re-opened editors reflect the latest state
   * without a page reload.
   */
  private currentData: Partial<Record<DiagramView, Record<string, unknown> | null>> = {};

  async ngOnInit(): Promise<void> {
    this.canEdit = this.auth.hasPermission(this.permissionModule, 'edit');
    void this.renderAllPreviews();
    this.pastOptions.set(await this.dataSource.listReferenceOptions());
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['diagrams'] || changes['diagrams'].firstChange) return;
    // A new diagrams input replaces any in-session state (e.g. the parent reloaded the record).
    this.currentData = {};
    void this.renderAllPreviews();
  }

  ngOnDestroy(): void {
    Object.values(this.previewUrls()).forEach((url) => URL.revokeObjectURL(url));
  }

  protected viewLabelKey(view: DiagramView): string {
    return VIEW_LABEL_KEYS[view];
  }

  protected aspectRatio(view: DiagramView): string {
    const { width, height } = DIAGRAM_CANVAS_SIZES[view];
    return `${width} / ${height}`;
  }

  private updateShownViews(): void {
    this.shownViews.set([
      ...VIEW_ORDER,
      ...CLOSE_UP_VIEWS.filter((view) => this.dataFor(view) !== null),
    ]);
    this.counts.set(
      Object.fromEntries(
        ALL_VIEWS.map((view) => {
          const objects = this.dataFor(view)?.['objects'];
          return [view, Array.isArray(objects) ? objects.length : 0];
        })
      )
    );
  }

  protected countFor(view: DiagramView): number {
    return this.counts()[view] ?? 0;
  }

  private dataFor(view: DiagramView): Record<string, unknown> | null {
    if (view in this.currentData) return this.currentData[view] ?? null;
    return this.diagrams.find((d) => d.view === view)?.data ?? null;
  }

  private async renderAllPreviews(): Promise<void> {
    this.updateShownViews();
    await Promise.all(this.shownViews().map((view) => this.renderPreview(view)));
  }

  private async renderPreview(view: DiagramView): Promise<void> {
    const blob = await renderDiagramToBlob(view, this.dataFor(view) ?? {});
    if (!blob) return; // keep whatever preview (or spinner) is currently shown
    const url = URL.createObjectURL(blob);
    const previous = this.previewUrls()[view];
    this.previewUrls.update((urls) => ({ ...urls, [view]: url }));
    if (previous) URL.revokeObjectURL(previous);
  }

  protected openEditor(view: DiagramView): void {
    const data: FacialDiagramEditDialogData = {
      view,
      viewLabelKeys: VIEW_LABEL_KEYS,
      permissionModule: this.permissionModule,
      canEdit: this.canEdit,
      initialData: Object.fromEntries(ALL_VIEWS.map((v) => [v, this.dataFor(v)])),
      dataSource: this.dataSource,
      referenceOptions: this.pastOptions(),
      previewUrls: this.previewUrls(),
    };
    const ref = this.dialog.open<
      FacialDiagramEditDialogComponent,
      FacialDiagramEditDialogData,
      FacialDiagramEditDialogResult
    >(FacialDiagramEditDialogComponent, {
      data,
      // Full screen: tools, canvas and the views/annotations panel side by side, with the canvas
      // scaled into whatever room is left.
      width: '100vw',
      maxWidth: '100vw',
      height: '100dvh',
      maxHeight: '100dvh',
      panelClass: 'diagram-editor-panel',
      autoFocus: false,
    });
    ref.afterClosed().subscribe((result) => {
      if (!result?.saved) return;
      const savedViews = Object.keys(result.views) as DiagramView[];
      for (const saved of savedViews) {
        this.currentData[saved] = result.views[saved] ?? null;
      }
      this.updateShownViews();
      for (const saved of savedViews) {
        void this.renderPreview(saved);
      }
    });
  }
}
