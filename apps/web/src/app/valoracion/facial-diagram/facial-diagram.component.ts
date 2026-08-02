import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { Canvas, FabricImage, FabricObject, IText, PencilBrush, TPointerEvent, TPointerEventInfo, util } from 'fabric';
import { AuthService } from '../../auth/auth.service';
import { ValoracionService } from '../valoracion.service';
import { createPinMarker, createStarMarker, createXMarker } from './fabric-shapes';

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 600;
const PLACEHOLDER_IMAGE_URL = '/assets/facial-diagram-placeholder.svg';

type DiagramTool = 'select' | 'pencil' | 'pin' | 'x' | 'star' | 'text';

const DRAW_COLORS = ['#000000', '#e53935', '#1e88e5', '#43a047'];
const DRAW_WIDTHS = [2, 4, 6];

/** i18n keys for the accessible names of {@link DRAW_COLORS}, keyed by the same hex values. */
const DRAW_COLOR_LABEL_KEYS: Record<string, string> = {
  '#000000': 'valoracion.diagram.colors.black',
  '#e53935': 'valoracion.diagram.colors.red',
  '#1e88e5': 'valoracion.diagram.colors.blue',
  '#43a047': 'valoracion.diagram.colors.green',
};

/**
 * Object `type` values we are willing to hand to `util.enlivenObjects` when restoring a stored
 * diagram — i.e. exactly the shapes this component can create (`Circle`/`IText` inside pin groups,
 * `Group` for pin/X markers, `Polygon` for stars, `Line` inside X markers, `Path` for pencil
 * strokes).
 *
 * Anything else is dropped rather than revived, so a corrupted or tampered-with stored blob cannot
 * make the canvas instantiate arbitrary Fabric classes — notably an `{type:'image', src:'https://…'}`
 * entry, which would otherwise trigger a browser fetch to an attacker-controlled URL on load.
 *
 * Fabric v6.9.1 serializes `type` from the *static* `constructor.type`, which is PascalCase
 * (verified: `_defineProperty(Circle, 'type', 'Circle')` etc. in `fabric/dist/index.mjs`), so that
 * is what our own saves contain. `ClassRegistry.setClass` additionally registers a lowercase alias
 * for every class (plus `i-text` for `IText`), and `getClass` matches exactly without normalizing,
 * so those legacy spellings also revive successfully and are accepted here too.
 */
const ALLOWED_OBJECT_TYPES = new Set([
  'Circle',
  'Group',
  'IText',
  'Line',
  'Polygon',
  'Path',
  // Legacy lowercase aliases still resolvable through Fabric's class registry.
  'circle',
  'group',
  'itext',
  'i-text',
  'line',
  'polygon',
  'path',
]);

/**
 * True when `obj` and every object nested inside it (a `Group`'s children are revived recursively
 * by `enlivenObjects`) has an allowed `type`. Recursing matters: without it a blob shaped like
 * `{type:'Group', objects:[{type:'image', src:'https://attacker…'}]}` would pass a top-level-only
 * check and still cause a fetch when the group's children were revived.
 */
function isAllowedDiagramObject(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false;
  const record = obj as Record<string, unknown>;
  if (!ALLOWED_OBJECT_TYPES.has(record['type'] as string)) return false;
  const children = record['objects'];
  if (children === undefined) return true;
  return Array.isArray(children) && children.every(isAllowedDiagramObject);
}

@Component({
  selector: 'app-facial-diagram',
  standalone: true,
  imports: [MatButtonModule, MatButtonToggleModule, TranslocoModule],
  template: `
    <div class="diagram-container">
      <div
        #canvasWrapper
        class="diagram-canvas-wrapper"
        tabindex="0"
        (keydown)="onKeyDown($event)"
      >
        <canvas #canvasEl [width]="canvasWidth" [height]="canvasHeight"></canvas>
      </div>
      @if (canEdit) {
        <div class="diagram-toolbar">
          <mat-button-toggle-group [value]="activeTool()">
            <mat-button-toggle value="select" (click)="setTool('select')">
              {{ 'valoracion.diagram.tools.select' | transloco }}
            </mat-button-toggle>
            <mat-button-toggle value="pencil" (click)="setTool('pencil')">
              {{ 'valoracion.diagram.tools.pencil' | transloco }}
            </mat-button-toggle>
            <mat-button-toggle value="pin" (click)="setTool('pin')">
              {{ 'valoracion.diagram.tools.pin' | transloco }}
            </mat-button-toggle>
            <mat-button-toggle value="x" (click)="setTool('x')">
              {{ 'valoracion.diagram.tools.x' | transloco }}
            </mat-button-toggle>
            <mat-button-toggle value="star" (click)="setTool('star')">
              {{ 'valoracion.diagram.tools.star' | transloco }}
            </mat-button-toggle>
            <mat-button-toggle value="text" (click)="setTool('text')">
              {{ 'valoracion.diagram.tools.text' | transloco }}
            </mat-button-toggle>
          </mat-button-toggle-group>
          @if (activeTool() === 'pencil') {
            <div class="diagram-brush-options">
              @for (color of drawColors; track color) {
                <button
                  type="button"
                  class="color-swatch"
                  [style.background]="color"
                  [class.selected]="drawColor() === color"
                  [attr.aria-label]="colorLabel(color) | transloco"
                  (click)="setColor(color)"
                ></button>
              }
              <mat-button-toggle-group [value]="drawWidth()">
                @for (width of drawWidths; track width) {
                  <mat-button-toggle [value]="width" (click)="setWidth(width)">
                    {{ width }}px
                  </mat-button-toggle>
                }
              </mat-button-toggle-group>
            </div>
          }
        </div>
        <div class="diagram-actions">
          <button mat-stroked-button type="button" (click)="deleteSelected()">
            {{ 'valoracion.diagram.deleteSelected' | transloco }}
          </button>
          <button mat-stroked-button type="button" (click)="clearAll()">
            {{ 'valoracion.diagram.clearAll' | transloco }}
          </button>
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="saving() || !loaded()"
            (click)="save()"
          >
            {{ 'valoracion.diagram.save' | transloco }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .diagram-canvas-wrapper {
        display: inline-block;
        border: 1px solid var(--mat-sys-outline-variant, #ccc);
        outline: none;
        touch-action: none;
      }
      .diagram-actions {
        margin-top: 8px;
      }
      .diagram-toolbar {
        margin-top: 8px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .diagram-brush-options {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .color-swatch {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 2px solid transparent;
        cursor: pointer;
      }
      .color-swatch.selected {
        border-color: var(--mat-sys-primary, #000);
      }
    `,
  ],
})
export class FacialDiagramComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input({ required: true }) valoracionId!: string;
  @Input() initialDiagramData: Record<string, unknown> | null = null;

  @ViewChild('canvasEl') private readonly canvasEl!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasWrapper') private readonly canvasWrapper!: ElementRef<HTMLDivElement>;

  private readonly valoracionService = inject(ValoracionService);
  private readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);

  protected readonly canvasWidth = CANVAS_WIDTH;
  protected readonly canvasHeight = CANVAS_HEIGHT;
  protected readonly saving = signal(false);
  /**
   * `false` until the stored diagram has finished loading onto the canvas. Saving before that (or
   * after a failed load) would PATCH whatever partial/empty state the canvas happens to hold,
   * destroying the annotations actually on record — so the Save button stays disabled until this
   * flips true, and it only flips true on a successful load.
   */
  protected readonly loaded = signal(false);
  protected canEdit = false;

  protected readonly drawColors = DRAW_COLORS;
  protected readonly drawWidths = DRAW_WIDTHS;
  protected readonly activeTool = signal<DiagramTool>('select');
  protected readonly drawColor = signal(DRAW_COLORS[0]);
  protected readonly drawWidth = signal(DRAW_WIDTHS[0]);
  private pinCounter = 1;
  /**
   * Set at the very top of `ngOnDestroy`. The load sequence awaits network/decode work, so the
   * component can be destroyed (and the canvas disposed) while those promises are still pending;
   * every continuation re-checks this before touching `this.canvas`.
   */
  private destroyed = false;

  protected canvas!: Canvas;

  ngOnInit(): void {
    this.canEdit = this.auth.hasPermission('valoracion', 'edit');
  }

  async ngAfterViewInit(): Promise<void> {
    this.canvas = new Canvas(this.canvasEl.nativeElement, {
      isDrawingMode: false,
      selection: this.canEdit,
    });

    this.canvas.freeDrawingBrush = new PencilBrush(this.canvas);
    this.applyBrushSettings();

    // Wire canvas events up *before* the first await, so a load failure (or a slow load) still
    // leaves the canvas interactive rather than silently inert.
    this.canvas.on('mouse:down', (opt: TPointerEventInfo<TPointerEvent>) => {
      // Focus the wrapper directly: Fabric v6 inserts its own `div.canvas-container` between the
      // canvas and this wrapper, so walking up via `parentElement` would hit that generated (and
      // untabbable) div instead and keydown would never reach `onKeyDown`.
      this.canvasWrapper.nativeElement.focus();
      this.onCanvasMouseDown(opt);
    });

    // Drop text notes that were opened but left empty, so a stray click with the text tool doesn't
    // persist a zero-width IText. Scoped to empty text objects only.
    this.canvas.on('text:editing:exited', ({ target }) => {
      if (target && !target.text.trim()) {
        this.canvas.remove(target);
        this.canvas.requestRenderAll();
      }
    });

    try {
      const background = await FabricImage.fromURL(PLACEHOLDER_IMAGE_URL);
      if (this.destroyed) return;
      background.set({ selectable: false, evented: false });
      background.scaleToWidth(this.canvasWidth);
      this.canvas.backgroundImage = background;

      if (this.initialDiagramData && Array.isArray(this.initialDiagramData['objects'])) {
        const stored = this.initialDiagramData['objects'] as Record<string, unknown>[];
        const safe = stored.filter((obj) => {
          const allowed = isAllowedDiagramObject(obj);
          if (!allowed) {
            console.warn('Ignoring unsupported diagram object', obj?.['type']);
          }
          return allowed;
        });
        const objects = await util.enlivenObjects(safe);
        if (this.destroyed) return;
        objects.forEach((obj) => this.canvas.add(obj as FabricObject));
      }

      // Restore the pin counter so numbering continues past the pins already on the diagram.
      // Records saved before this field existed simply keep starting at 1, exactly as before.
      const nextPinNumber = this.initialDiagramData?.['nextPinNumber'];
      if (typeof nextPinNumber === 'number' && Number.isFinite(nextPinNumber) && nextPinNumber > 0) {
        this.pinCounter = Math.floor(nextPinNumber);
      }

      if (!this.canEdit) {
        this.canvas.forEachObject((obj) => obj.set({ selectable: false, evented: false }));
      }

      this.canvas.requestRenderAll();
      // Only on the success path: leaving this false keeps Save disabled, so a broken load can
      // never overwrite the stored diagram with an empty/partial object set.
      this.loaded.set(true);
    } catch (error) {
      console.error('Failed to load facial diagram', error);
      if (!this.destroyed) {
        this.canvas.requestRenderAll();
      }
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.canvas?.dispose();
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return;
    const active = this.canvas?.getActiveObject();
    if (!active) return;
    if ((active as IText).isEditing) return;
    event.preventDefault();
    this.deleteSelected();
  }

  protected deleteSelected(): void {
    this.canvas.getActiveObjects().forEach((obj) => this.canvas.remove(obj));
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }

  protected clearAll(): void {
    // Resolved fresh on each use so a live language switch is reflected; `translate` is synchronous
    // once the active bundle is loaded, which it is by the time this button can be clicked.
    if (!confirm(this.transloco.translate('valoracion.diagram.confirmClearAll'))) return;
    [...this.canvas.getObjects()].forEach((obj) => this.canvas.remove(obj));
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
  }

  protected setTool(tool: DiagramTool): void {
    this.activeTool.set(tool);
    this.canvas.isDrawingMode = tool === 'pencil';
    if (tool === 'pencil') {
      this.applyBrushSettings();
    }
  }

  protected setColor(color: string): void {
    this.drawColor.set(color);
    this.applyBrushSettings();
  }

  protected setWidth(width: number): void {
    this.drawWidth.set(width);
    this.applyBrushSettings();
  }

  /** i18n key for a swatch's accessible name, so screen readers announce "Red", not "#e53935". */
  protected colorLabel(color: string): string {
    return DRAW_COLOR_LABEL_KEYS[color] ?? color;
  }

  private applyBrushSettings(): void {
    if (!this.canvas.freeDrawingBrush) return;
    this.canvas.freeDrawingBrush.color = this.drawColor();
    this.canvas.freeDrawingBrush.width = this.drawWidth();
  }

  private onCanvasMouseDown(opt: TPointerEventInfo<TPointerEvent>): void {
    const tool = this.activeTool();
    if (tool === 'select' || tool === 'pencil') return;

    // `getPointer` is deprecated in Fabric v6; `getScenePoint` returns the same `Point` in scene
    // coordinates, which stays correct if zoom/pan is added later.
    const pointer = this.canvas.getScenePoint(opt.e);

    if (tool === 'text') {
      const note = new IText('', {
        left: pointer.x,
        top: pointer.y,
        fontSize: 14,
        fill: '#000000',
        backgroundColor: 'rgba(255,255,255,0.85)',
      });
      this.canvas.add(note);
      this.setTool('select');
      this.canvas.setActiveObject(note);
      note.enterEditing();
      this.canvas.requestRenderAll();
      return;
    }

    const marker =
      tool === 'pin'
        ? createPinMarker(this.pinCounter++, pointer.x, pointer.y)
        : tool === 'x'
        ? createXMarker(pointer.x, pointer.y)
        : createStarMarker(pointer.x, pointer.y);

    this.canvas.add(marker);
    this.canvas.requestRenderAll();
    this.setTool('select');
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    try {
      const objects = this.canvas.getObjects().map((obj) => obj.toObject());
      await this.valoracionService.updateDiagram(this.valoracionId, {
        diagramData: { version: 1, objects, nextPinNumber: this.pinCounter },
      });
    } finally {
      this.saving.set(false);
    }
  }
}
