import { Component, computed, inject, signal, viewChildren } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoModule } from '@jsverse/transloco';
import type { DiagramView, DiagramViewRecord, PermissionModule } from '@expedientes/shared-types';
import { FacialDiagramCanvasComponent, type AnnotationKind } from './facial-diagram-canvas.component';
import { ActivePatientStore } from '../../patient-drive/active-patient.store';
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
  /** Rendered previews per view, for the editor's view thumbnails. */
  previewUrls?: Partial<Record<DiagramView, string>>;
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
/** Every view, so the editor can move between all of them; full views first, then close-ups. */
const ALL_VIEWS: DiagramView[] = ['FRONT', 'LEFT_PROFILE', 'RIGHT_PROFILE', ...CLOSE_UP_VIEWS];

/** i18n key per annotation kind, for the annotation list. */
const ANNOTATION_KIND_KEYS: Record<AnnotationKind, string> = {
  pin: 'diagramEditor.kind.pin',
  x: 'diagramEditor.kind.x',
  star: 'diagramEditor.kind.star',
  line: 'diagramEditor.kind.line',
  stroke: 'diagramEditor.kind.stroke',
  text: 'diagramEditor.kind.text',
};

/**
 * Full-screen diagram editor. Top bar: what is being edited, undo/redo, unsaved state, Cancel and
 * Save. Left: the tools with their names, then colour and line width. Centre: the canvas with a
 * zoom control. Right: every view as a thumbnail with its annotation count, the active view's
 * annotations as a list (select or delete one), and the reference visit with its transparency.
 *
 * Every view can be opened from here; each canvas is created the first time its view is picked
 * and then kept (hidden) so switching back and forth never loses work, and Save persists every
 * view opened in this session in one request (the API leaves the others untouched).
 *
 * Closing with unsaved changes (Escape or Cancel) asks before discarding them.
 */
@Component({
  selector: 'app-facial-diagram-edit-dialog',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatTooltipModule,
    TranslocoModule,
    FacialDiagramCanvasComponent,
  ],
  template: `
    <div class="editor" [class.read-only]="!data.canEdit">
      <header class="topbar">
        <div class="title">
          <p class="eyebrow">
            {{ 'diagramEditor.title' | transloco }}
            @if (patientName) {
              · {{ patientName }}
            }
          </p>
          <h2>{{ data.viewLabelKeys[activeView()] | transloco }}</h2>
        </div>
        @if (data.canEdit) {
          <div class="history">
            <button
              mat-icon-button
              type="button"
              [disabled]="!active()?.canUndo()"
              (click)="active()?.undo()"
              [matTooltip]="'diagramEditor.undo' | transloco"
              [attr.aria-label]="'diagramEditor.undo' | transloco"
            >
              <mat-icon>undo</mat-icon>
            </button>
            <button
              mat-icon-button
              type="button"
              [disabled]="!active()?.canRedo()"
              (click)="active()?.redo()"
              [matTooltip]="'diagramEditor.redo' | transloco"
              [attr.aria-label]="'diagramEditor.redo' | transloco"
            >
              <mat-icon>redo</mat-icon>
            </button>
          </div>
          <span class="dirty" aria-live="polite">
            @if (dirtyCount() > 0) {
              {{ 'diagramEditor.unsaved' | transloco: { n: dirtyCount() } }}
            }
          </span>
        }
        <div class="actions">
          <button mat-button type="button" (click)="requestClose()">
            {{ (data.canEdit ? 'common.cancel' : 'diagramEditor.close') | transloco }}
          </button>
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
        </div>
      </header>

      <div class="body">
        @if (data.canEdit && active(); as c) {
          <nav class="rail" [attr.aria-label]="'diagramEditor.tools' | transloco">
            @for (tool of c.toolDefs; track tool.id) {
              <button
                type="button"
                class="tool"
                [class.is-active]="c.activeTool() === tool.id"
                [attr.aria-pressed]="c.activeTool() === tool.id"
                (click)="c.setTool(tool.id)"
              >
                <mat-icon aria-hidden="true">{{ tool.icon }}</mat-icon>
                <span>{{ tool.labelKey | transloco }}</span>
              </button>
            }
            <span class="rail-divider"></span>
            <p class="rail-label">{{ 'diagramEditor.color' | transloco }}</p>
            <div class="swatches">
              @for (color of c.drawColors; track color) {
                <button
                  type="button"
                  class="swatch"
                  [style.background]="color"
                  [class.is-active]="c.drawColor() === color"
                  [attr.aria-pressed]="c.drawColor() === color"
                  [attr.aria-label]="c.colorLabel(color) | transloco"
                  (click)="c.setColor(color)"
                ></button>
              }
            </div>
            <p class="rail-label">{{ 'diagramEditor.width' | transloco }}</p>
            <div class="widths">
              @for (width of c.drawWidths; track width) {
                <button
                  type="button"
                  class="width"
                  [class.is-active]="c.drawWidth() === width"
                  [attr.aria-pressed]="c.drawWidth() === width"
                  [attr.aria-label]="'diagramEditor.widthPx' | transloco: { n: width }"
                  (click)="c.setWidth(width)"
                >
                  <span [style.width.px]="width * 2 + 4" [style.height.px]="width * 2 + 4"></span>
                </button>
              }
            </div>
          </nav>
        }

        <main class="stage">
          <div class="canvases">
            @for (view of views; track view) {
              @if (openedViews().includes(view)) {
                <app-facial-diagram-canvas
                  [class.inactive]="view !== activeView()"
                  [view]="view"
                  [permissionModule]="data.permissionModule"
                  [initialDiagramData]="data.initialData[view] ?? null"
                  [referenceData]="referenceData(view)"
                  [referenceOpacity]="referenceOpacity()"
                  [showToolbar]="false"
                />
              }
            }
          </div>
          @if (active(); as c) {
            <div class="zoom" role="group" [attr.aria-label]="'diagramEditor.zoom' | transloco">
              <button mat-icon-button type="button" [disabled]="c.zoom() <= 1" (click)="c.setZoom(c.zoom() - 0.25)" [attr.aria-label]="'diagramEditor.zoomOut' | transloco">
                <mat-icon>remove</mat-icon>
              </button>
              <button type="button" class="zoom-value" (click)="c.setZoom(1)" [attr.aria-label]="'diagramEditor.zoomReset' | transloco">
                {{ c.zoom() * 100 }}%
              </button>
              <button mat-icon-button type="button" [disabled]="c.zoom() >= 3" (click)="c.setZoom(c.zoom() + 0.25)" [attr.aria-label]="'diagramEditor.zoomIn' | transloco">
                <mat-icon>add</mat-icon>
              </button>
            </div>
          }
        </main>

        <aside class="panel">
          <section>
            <h3>{{ 'diagramEditor.views' | transloco }}</h3>
            <div class="views">
              @for (view of views; track view) {
                <button
                  type="button"
                  class="view"
                  [class.is-active]="view === activeView()"
                  [attr.aria-pressed]="view === activeView()"
                  (click)="selectView(view)"
                >
                  @if (data.previewUrls?.[view]; as url) {
                    <img [src]="url" alt="" />
                  } @else {
                    <span class="view-blank"></span>
                  }
                  <span class="view-label">{{ shortLabel(view) | transloco }}</span>
                  @if (countFor(view) > 0) {
                    <span class="view-count">{{ countFor(view) }}</span>
                  }
                </button>
              }
            </div>
          </section>

          @if (active(); as c) {
            <section>
              <h3>{{ 'diagramEditor.annotations' | transloco: { n: c.annotations().length } }}</h3>
              @if (c.annotations().length === 0) {
                <p class="muted">{{ 'diagramEditor.noAnnotations' | transloco }}</p>
              } @else {
                <ul class="annotations">
                  @for (a of c.annotations(); track a.index) {
                    <li [class.is-selected]="c.selectedIndex() === a.index">
                      <button type="button" class="annotation" (click)="c.selectAnnotation(a.index)" [disabled]="!data.canEdit">
                        <span class="marker" [style.background]="a.color" aria-hidden="true"></span>
                        <span class="annotation-label">
                          {{ kindKey(a.kind) | transloco }}
                          @if (a.label) {
                            <span class="muted">· {{ a.label }}</span>
                          }
                        </span>
                      </button>
                      @if (data.canEdit) {
                        <button
                          mat-icon-button
                          type="button"
                          class="remove"
                          (click)="c.removeAnnotation(a.index)"
                          [attr.aria-label]="('diagramEditor.remove' | transloco) + ': ' + (kindKey(a.kind) | transloco) + ' ' + a.label"
                        >
                          <mat-icon>close</mat-icon>
                        </button>
                      }
                    </li>
                  }
                </ul>
                @if (data.canEdit) {
                  <button mat-button type="button" class="danger" (click)="c.clearAll()">
                    <mat-icon>delete_sweep</mat-icon>{{ 'diagramEditor.clearView' | transloco }}
                  </button>
                }
              }
            </section>
          }

          @if (data.referenceOptions.length > 0) {
            <section>
              <h3>{{ 'diagramEditor.reference' | transloco }}</h3>
              <mat-checkbox [checked]="referenceEnabled()" (change)="toggleReference($event.checked)">
                {{ 'valoracion.diagram.reference.toggle' | transloco }}
              </mat-checkbox>
              @if (referenceEnabled()) {
                <mat-form-field appearance="outline" class="full-width" subscriptSizing="dynamic">
                  <mat-label>{{ 'valoracion.diagram.reference.pick' | transloco }}</mat-label>
                  <mat-select [value]="selectedReferenceId()" (selectionChange)="selectReference($event.value)">
                    @for (option of data.referenceOptions; track option.id) {
                      <mat-option [value]="option.id">{{ option.label }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
                <label class="opacity">
                  {{ 'diagramEditor.opacity' | transloco }}
                  <input
                    type="range"
                    min="10"
                    max="90"
                    step="5"
                    [value]="referenceOpacity() * 100"
                    (input)="setOpacity($event)"
                  />
                </label>
              }
            </section>
          }
        </aside>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .editor {
        height: 100%;
        display: flex;
        flex-direction: column;
        background: var(--mat-sys-surface-container-low);
        color: var(--mat-sys-on-surface);
      }
      .topbar {
        flex: none;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px 12px;
        padding: 8px 16px;
        border-bottom: 1px solid var(--plate-line);
        background: var(--mat-sys-surface);
      }
      .title {
        flex: 1 1 200px;
        min-width: 0;
      }
      .eyebrow {
        margin: 0;
        font-size: 12px;
        color: var(--mat-sys-on-surface-variant);
      }
      .title h2 {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 700;
      }
      .history {
        display: flex;
        gap: 2px;
      }
      .dirty {
        font-size: 13px;
        font-weight: 600;
        color: var(--mat-sys-primary);
      }
      .actions {
        display: flex;
        gap: 8px;
      }
      .body {
        flex: 1;
        min-height: 0;
        display: grid;
        grid-template-columns: 96px minmax(0, 1fr) 300px;
        grid-template-areas: 'rail stage panel';
      }
      .read-only .body {
        grid-template-columns: minmax(0, 1fr) 300px;
        grid-template-areas: 'stage panel';
      }
      .rail {
        grid-area: rail;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 4px;
        padding: 12px 8px;
        overflow-y: auto;
        border-right: 1px solid var(--plate-line);
        background: var(--mat-sys-surface);
      }
      .tool {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        min-height: 60px;
        padding: 6px 4px;
        border: 0;
        border-radius: var(--plate-radius);
        background: transparent;
        color: var(--mat-sys-on-surface-variant);
        font: inherit;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        text-align: center;
      }
      .tool:hover {
        background: var(--mat-sys-surface-container-low);
      }
      .tool.is-active {
        background: var(--mat-sys-inverse-surface);
        color: var(--mat-sys-inverse-on-surface);
        font-weight: 600;
      }
      .rail-divider {
        height: 1px;
        margin: 6px 4px;
        background: var(--plate-line);
      }
      .rail-label {
        margin: 4px 0 0;
        text-align: center;
        font-size: 11px;
        color: var(--mat-sys-on-surface-variant);
      }
      .swatches,
      .widths {
        display: grid;
        grid-template-columns: repeat(2, 36px);
        justify-content: center;
        gap: 6px;
      }
      .swatch {
        width: 32px;
        height: 32px;
        margin: 2px;
        border: 1px solid var(--plate-line-strong);
        border-radius: 50%;
        cursor: pointer;
      }
      .swatch.is-active {
        outline: 3px solid var(--mat-sys-on-surface);
        outline-offset: 2px;
      }
      .width {
        width: 36px;
        height: 36px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid transparent;
        border-radius: 50%;
        background: transparent;
        cursor: pointer;
      }
      .width span {
        border-radius: 50%;
        background: var(--mat-sys-on-surface);
      }
      .width.is-active {
        border-color: var(--mat-sys-on-surface);
        background: var(--mat-sys-surface-container-low);
      }
      .stage {
        grid-area: stage;
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 16px;
      }
      .canvases {
        flex: 1;
        min-height: 0;
        width: 100%;
        display: flex;
        flex-direction: column;
      }
      app-facial-diagram-canvas {
        flex: 1 1 auto;
      }
      app-facial-diagram-canvas.inactive {
        display: none;
      }
      .zoom {
        flex: none;
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 2px;
        border: 1px solid var(--plate-line);
        border-radius: 24px;
        background: var(--mat-sys-surface);
      }
      .zoom-value {
        min-width: 56px;
        min-height: 40px;
        border: 0;
        background: transparent;
        font: inherit;
        font-size: 13px;
        font-variant-numeric: tabular-nums;
        color: inherit;
        cursor: pointer;
      }
      .panel {
        grid-area: panel;
        min-height: 0;
        overflow-y: auto;
        border-left: 1px solid var(--plate-line);
        background: var(--mat-sys-surface);
      }
      .panel section {
        padding: 14px 16px;
        border-bottom: 1px solid var(--plate-line);
      }
      .panel h3 {
        margin: 0 0 10px;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--mat-sys-on-surface-variant);
      }
      .views {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      .view {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 6px;
        border: 1px solid var(--plate-line);
        border-radius: 8px;
        background: var(--mat-sys-surface);
        color: var(--mat-sys-on-surface-variant);
        font: inherit;
        font-size: 11px;
        cursor: pointer;
      }
      .view.is-active {
        border: 2px solid var(--plate-mark);
        color: var(--mat-sys-on-surface);
        font-weight: 600;
      }
      .view img,
      .view-blank {
        width: 100%;
        aspect-ratio: 1;
        object-fit: contain;
        border-radius: 4px;
        background: #ffffff;
      }
      .view-blank {
        background: var(--mat-sys-surface-container-low);
      }
      .view-count {
        position: absolute;
        top: 4px;
        right: 4px;
        min-width: 18px;
        height: 18px;
        padding: 0 4px;
        border-radius: 9px;
        background: var(--plate-mark);
        color: #ffffff;
        font-size: 11px;
        font-weight: 600;
        line-height: 18px;
        text-align: center;
      }
      .annotations {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .annotations li {
        display: flex;
        align-items: center;
        border-radius: 8px;
      }
      .annotations li.is-selected {
        background: var(--mat-sys-surface-container-low);
        box-shadow: inset 3px 0 0 var(--plate-mark);
      }
      .annotation {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 44px;
        padding: 0 8px;
        border: 0;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }
      .annotation:disabled {
        cursor: default;
      }
      .annotation-label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .marker {
        flex: none;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 1px solid var(--plate-line-strong);
      }
      .muted {
        margin: 0;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .danger {
        margin-top: 6px;
        color: var(--mat-sys-error);
      }
      .full-width {
        width: 100%;
        margin-top: 8px;
      }
      .opacity {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-top: 12px;
        font-size: 13px;
        color: var(--mat-sys-on-surface-variant);
      }
      .opacity input {
        width: 100%;
      }
      /* Tablet portrait and phones: tools as a scrolling strip on top, the panel below the canvas. */
      @media (max-width: 899px) {
        .body,
        .read-only .body {
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }
        .rail {
          flex-direction: row;
          align-items: center;
          overflow-x: auto;
          overflow-y: hidden;
          border-right: 0;
          border-bottom: 1px solid var(--plate-line);
        }
        .tool {
          flex: none;
          min-width: 64px;
        }
        .rail-divider {
          width: 1px;
          height: 40px;
          margin: 0 4px;
        }
        .rail-label {
          display: none;
        }
        .swatches,
        .widths {
          display: flex;
          flex: none;
        }
        .stage {
          flex: none;
          height: 70dvh;
        }
        .panel {
          border-left: 0;
          border-top: 1px solid var(--plate-line);
          overflow: visible;
        }
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

  protected readonly views: DiagramView[] = ALL_VIEWS;
  protected readonly patientName = inject(ActivePatientStore).patient()?.fullName ?? '';
  protected readonly referenceOpacity = signal(0.35);
  protected readonly activeView = signal<DiagramView>(this.data.view);
  /** Views whose canvas has been created (in order of first use). */
  protected readonly openedViews = signal<DiagramView[]>([this.data.view]);
  /** The canvas of the view on screen. */
  protected readonly active = computed(() => this.canvases().find((c) => c.view === this.activeView()));
  protected readonly activeLoaded = computed(() => this.active()?.loaded() ?? false);
  /** Views with changes not yet saved. */
  protected readonly dirtyCount = computed(() => this.canvases().filter((c) => c.dirty()).length);

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

  /** Annotation count per view: live for opened views, from the stored data otherwise. */
  protected countFor(view: DiagramView): number {
    const canvas = this.canvases().find((c) => c.view === view);
    if (canvas?.loaded()) return canvas.annotations().length;
    const objects = this.data.initialData[view]?.['objects'];
    return Array.isArray(objects) ? objects.length : 0;
  }

  /** Close-ups are labelled by the part alone in the thumbnail grid. */
  protected shortLabel(view: DiagramView): string {
    return this.data.viewLabelKeys[view];
  }

  protected kindKey(kind: AnnotationKind): string {
    return ANNOTATION_KIND_KEYS[kind];
  }

  protected setOpacity(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value)) this.referenceOpacity.set(value / 100);
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
