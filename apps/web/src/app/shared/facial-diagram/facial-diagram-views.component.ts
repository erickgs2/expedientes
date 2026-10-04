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
      @for (view of shownViews(); track view) {
        <div class="diagram-view-card">
          <div class="diagram-view-header">
            <span class="diagram-view-label">{{ viewLabelKey(view) | transloco }}</span>
            <button mat-stroked-button type="button" (click)="openEditor(view)">
              <mat-icon>{{ canEdit ? 'edit' : 'visibility' }}</mat-icon>
              {{ (canEdit ? 'common.edit' : 'valoracion.diagram.view') | transloco }}
            </button>
          </div>
          @if (previewUrls()[view]; as url) {
            <img
              class="diagram-preview"
              [style.aspect-ratio]="aspectRatio(view)"
              [src]="url"
              [alt]="viewLabelKey(view) | transloco"
              (click)="openEditor(view)"
            />
          } @else {
            <div class="diagram-preview diagram-preview-loading" [style.aspect-ratio]="aspectRatio(view)">
              <mat-spinner diameter="32"></mat-spinner>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .diagram-views {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 16px;
      }
      .diagram-view-card {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-width: 320px;
      }
      .diagram-view-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .diagram-view-label {
        font-weight: 500;
      }
      .diagram-preview {
        width: 100%;
        object-fit: contain;
        border: 1px solid var(--mat-sys-outline-variant, #ccc);
        border-radius: 8px;
        background: #ffffff;
        cursor: pointer;
        display: block;
      }
      .diagram-preview-loading {
        display: flex;
        align-items: center;
        justify-content: center;
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
  /** Full views always; close-ups only when they hold data. */
  protected readonly shownViews = signal<DiagramView[]>(VIEW_ORDER);

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
    };
    const ref = this.dialog.open<
      FacialDiagramEditDialogComponent,
      FacialDiagramEditDialogData,
      FacialDiagramEditDialogResult
    >(FacialDiagramEditDialogComponent, {
      data,
      // Wide enough for the whole toolbar — tools, colours, widths and actions — to sit on one
      // or two rows beside the canvas rather than wrapping into a stack that pushes it off screen.
      width: 'min(96vw, 900px)',
      maxWidth: '96vw',
      // A fixed height (not just a max) so the editor can lay itself out to fit exactly: toolbar on
      // top, canvas scaled into the rest — no scrolling inside the dialog.
      height: '95dvh',
      maxHeight: '95dvh',
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
