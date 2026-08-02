import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  SimpleChanges,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { TranslocoModule, TranslocoService } from '@jsverse/transloco';
import { Canvas, FabricImage, FabricObject, IText, PencilBrush, TPointerEvent, TPointerEventInfo, util } from 'fabric';
import type { DiagramView } from '@expedientes/shared-types';
import { AuthService } from '../../auth/auth.service';
import { createPinMarker, createStarMarker, createXMarker } from './fabric-shapes';

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 600;
const PLACEHOLDER_IMAGE_URLS: Record<DiagramView, string> = {
  FRONT: '/assets/facial-diagram-placeholder.svg',
  LEFT_PROFILE: '/assets/facial-diagram-placeholder-left.svg',
  RIGHT_PROFILE: '/assets/facial-diagram-placeholder-right.svg',
};

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
  // Not a drawable object: Fabric v6 serializes every `Group` with a nested
  // `layoutManager: { type: 'layoutManager', strategy: 'fit-content' }` descriptor (verified by
  // serializing a real marker group with the installed library). The nested-type walk below sees it,
  // so it has to be accepted or every pin/X marker this app ever saved would be dropped on load.
  // It is inert with respect to this filter's purpose: `LayoutManager.fromObject` resolves a layout
  // strategy from a registry and loads no URLs, and anything nested *inside* it is still walked.
  'layoutManager',
]);

/** True for `{}`-shaped values only — arrays, `null` and primitives are excluded. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * True when *no* plain object anywhere inside `value` declares a `type` outside
 * {@link ALLOWED_OBJECT_TYPES}.
 *
 * The walk is deliberately generic — every plain-object-valued property is inspected, not a fixed
 * list of known slots — because Fabric revives far more than a `Group`'s `objects` array. Verified
 * in `fabric/dist/index.mjs` (v6.9.1): `FabricObject._fromObject` calls `enlivenObjectEnlivables`,
 * which iterates `Object.values(serializedObject)` and revives *any* value whose `type` is in the
 * class registry (`:1938-1966`). That reaches `clipPath` (revived as any Fabric class, `Image`
 * included) and `fill`/`stroke` (revived as a `Pattern`, whose `fromObject` calls `loadImage` just
 * like `Image` does) — so a checked-only-`objects` filter still let
 * `{type:'Circle', clipPath:{type:'Image', src:'https://attacker…'}}` and
 * `{type:'Circle', fill:{type:'Pattern', source:'https://attacker…'}}` through, and both really did
 * fetch. Walking everything also covers whatever revivable slot a future Fabric version adds,
 * without this filter needing to learn its name.
 */
function findDisallowedType(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const offending = findDisallowedType(item);
      if (offending !== null) return offending;
    }
    return null;
  }
  if (!isPlainObject(value)) return null;
  if ('type' in value && !ALLOWED_OBJECT_TYPES.has(value['type'] as string)) {
    return String(value['type']);
  }
  for (const nested of Object.values(value)) {
    const offending = findDisallowedType(nested);
    if (offending !== null) return offending;
  }
  return null;
}

/**
 * `null` when `obj` is safe to hand to `util.enlivenObjects`; otherwise the first disallowed `type`
 * found anywhere inside it (returned rather than a bare boolean so the caller can log *which* type
 * was rejected — with a whole-graph walk, "Group" alone would say nothing useful about a poisoned
 * `clipPath` buried in a child).
 *
 * A top-level `Group`'s `objects` array is just one instance of the generic "array of plain objects"
 * case, not a special one.
 */
function findDisallowedDiagramType(obj: unknown): string | null {
  if (!isPlainObject(obj)) return 'not-an-object';
  return findDisallowedType(obj);
}

@Component({
  selector: 'app-facial-diagram-canvas',
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
export class FacialDiagramCanvasComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input({ required: true }) view!: DiagramView;
  @Input() initialDiagramData: Record<string, unknown> | null = null;
  @Input() referenceData: Record<string, unknown> | null = null;

  @ViewChild('canvasEl') private readonly canvasEl!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvasWrapper') private readonly canvasWrapper!: ElementRef<HTMLDivElement>;

  private readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);

  protected readonly canvasWidth = CANVAS_WIDTH;
  protected readonly canvasHeight = CANVAS_HEIGHT;
  /**
   * `false` until the stored diagram has finished loading onto the canvas. Saving before that (or
   * after a failed load) would PATCH whatever partial/empty state the canvas happens to hold,
   * destroying the annotations actually on record — so the Save button stays disabled until this
   * flips true, and it only flips true on a successful load.
   */
  readonly loaded = signal(false);
  protected canEdit = false;

  protected readonly drawColors = DRAW_COLORS;
  protected readonly drawWidths = DRAW_WIDTHS;
  protected readonly activeTool = signal<DiagramTool>('select');
  protected readonly drawColor = signal(DRAW_COLORS[0]);
  protected readonly drawWidth = signal(DRAW_WIDTHS[0]);
  private pinCounter = 1;
  /** Overlay objects from a referenced past visit — never saved, never cleared by "Clear all". */
  private referenceObjects: FabricObject[] = [];
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

  ngOnChanges(changes: SimpleChanges): void {
    // Only react once the canvas actually exists — `ngOnChanges` can fire before
    // `ngAfterViewInit` finishes constructing it (e.g. on the very first input binding).
    // `ngAfterViewInit`'s own tail end applies whatever `referenceData` is already set by the time
    // it finishes loading, so an early change here is not lost, just deferred.
    if (!changes['referenceData'] || !this.canvas) return;
    void this.applyReferenceOverlay();
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
      if (!target || target.text.trim()) return;
      // Deferred, NOT removed inline: this handler runs while Fabric is still inside
      // `IText.exitEditing`, which after firing `text:editing:exited` re-reads `this.canvas` to fire
      // `object:modified` when the text changed (`fabric/dist/index.mjs:21244-21258`). Removing the
      // object here nulls `target.canvas`, so that follow-up line would throw an uncaught
      // TypeError — aborting whatever click ended the edit — whenever a note that *had* text was
      // cleared to empty. A microtask lets `exitEditing` finish first; what gets removed is
      // unchanged, only when.
      queueMicrotask(() => {
        if (this.destroyed) return;
        this.canvas.remove(target);
        this.canvas.requestRenderAll();
      });
    });

    try {
      const background = await FabricImage.fromURL(PLACEHOLDER_IMAGE_URLS[this.view]);
      if (this.destroyed) return;
      background.set({ selectable: false, evented: false });
      background.scaleToWidth(this.canvasWidth);
      this.canvas.backgroundImage = background;

      if (this.initialDiagramData && Array.isArray(this.initialDiagramData['objects'])) {
        const stored = this.initialDiagramData['objects'] as Record<string, unknown>[];
        const safe = stored.filter((obj) => {
          const offendingType = findDisallowedDiagramType(obj);
          if (offendingType !== null) {
            console.warn(
              'Ignoring unsupported diagram object',
              obj?.['type'],
              'because of nested type',
              offendingType
            );
          }
          return offendingType === null;
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

      if (this.referenceData) {
        await this.applyReferenceOverlay();
      }
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
    this.canvas
      .getObjects()
      .filter((obj) => !this.referenceObjects.includes(obj))
      .forEach((obj) => this.canvas.remove(obj));
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

  /**
   * Serializes this view's current canvas state, or `null` if nothing has been drawn — the
   * parent uses `null` to mean "clear this view" when the user emptied out a previously-saved
   * diagram, and omits the view entirely (not `null`) when this canvas never finished loading, so
   * a slow/failed load can never overwrite good stored data for this view.
   */
  getSerializedData(): { version: number; objects: object[]; nextPinNumber: number } | null {
    const objects = this.canvas
      .getObjects()
      .filter((obj) => !this.referenceObjects.includes(obj))
      .map((obj) => obj.toObject());
    if (objects.length === 0) return null;
    return { version: 1, objects, nextPinNumber: this.pinCounter };
  }

  /**
   * Replaces whatever reference overlay is currently shown with the one for `this.referenceData` —
   * removing the old overlay's objects first, then (if new data is present) reviving the new one's
   * objects through the same security allowlist used for the primary diagram (this is stored data
   * from another record, still untrusted input), marking them non-interactive and translucent, and
   * sending them behind everything already on the canvas so the current visit's own annotations —
   * including ones added after this call — always stay visibly on top.
   */
  private async applyReferenceOverlay(): Promise<void> {
    this.referenceObjects.forEach((obj) => this.canvas.remove(obj));
    this.referenceObjects = [];

    if (!this.referenceData || !Array.isArray(this.referenceData['objects'])) {
      this.canvas.requestRenderAll();
      return;
    }

    const stored = this.referenceData['objects'] as Record<string, unknown>[];
    const safe = stored.filter((obj) => findDisallowedDiagramType(obj) === null);
    const objects = await util.enlivenObjects(safe);
    if (this.destroyed) return;

    objects.forEach((obj) => {
      const fabricObj = obj as FabricObject;
      fabricObj.set({ selectable: false, evented: false, opacity: 0.35 });
      this.canvas.add(fabricObj);
      this.canvas.sendObjectToBack(fabricObj);
      this.referenceObjects.push(fabricObj);
    });
    this.canvas.requestRenderAll();
  }
}
