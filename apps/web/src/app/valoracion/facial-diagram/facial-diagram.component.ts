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

@Component({
  selector: 'app-facial-diagram',
  standalone: true,
  imports: [MatButtonModule, MatButtonToggleModule, TranslocoModule],
  template: `
    <div class="diagram-container">
      <div
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
                  [attr.aria-label]="color"
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
          <button mat-flat-button color="primary" type="button" [disabled]="saving()" (click)="save()">
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

  private readonly valoracionService = inject(ValoracionService);
  private readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);

  protected readonly canvasWidth = CANVAS_WIDTH;
  protected readonly canvasHeight = CANVAS_HEIGHT;
  protected readonly saving = signal(false);
  protected canEdit = false;
  protected clearAllConfirmMessage = '';

  protected readonly drawColors = DRAW_COLORS;
  protected readonly drawWidths = DRAW_WIDTHS;
  protected readonly activeTool = signal<DiagramTool>('select');
  protected readonly drawColor = signal(DRAW_COLORS[0]);
  protected readonly drawWidth = signal(DRAW_WIDTHS[0]);
  private pinCounter = 1;

  protected canvas!: Canvas;

  ngOnInit(): void {
    this.canEdit = this.auth.hasPermission('valoracion', 'edit');
    this.clearAllConfirmMessage = this.transloco.translate('valoracion.diagram.confirmClearAll');
  }

  async ngAfterViewInit(): Promise<void> {
    this.canvas = new Canvas(this.canvasEl.nativeElement, {
      isDrawingMode: false,
      selection: this.canEdit,
    });

    this.canvas.freeDrawingBrush = new PencilBrush(this.canvas);
    this.applyBrushSettings();

    const background = await FabricImage.fromURL(PLACEHOLDER_IMAGE_URL);
    background.set({ selectable: false, evented: false });
    background.scaleToWidth(this.canvasWidth);
    this.canvas.backgroundImage = background;

    if (this.initialDiagramData && Array.isArray(this.initialDiagramData['objects'])) {
      const objects = await util.enlivenObjects(
        this.initialDiagramData['objects'] as Record<string, unknown>[]
      );
      objects.forEach((obj) => this.canvas.add(obj as FabricObject));
    }

    if (!this.canEdit) {
      this.canvas.forEachObject((obj) => obj.set({ selectable: false, evented: false }));
    }

    this.canvas.on('mouse:down', (opt: TPointerEventInfo<TPointerEvent>) => {
      this.canvasEl.nativeElement.parentElement?.focus();
      this.onCanvasMouseDown(opt);
    });

    this.canvas.requestRenderAll();
  }

  ngOnDestroy(): void {
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
    if (!confirm(this.clearAllConfirmMessage)) return;
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

  private applyBrushSettings(): void {
    if (!this.canvas.freeDrawingBrush) return;
    this.canvas.freeDrawingBrush.color = this.drawColor();
    this.canvas.freeDrawingBrush.width = this.drawWidth();
  }

  private onCanvasMouseDown(opt: TPointerEventInfo<TPointerEvent>): void {
    const tool = this.activeTool();
    if (tool === 'select' || tool === 'pencil') return;

    const pointer = this.canvas.getPointer(opt.e);

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
        diagramData: { objects },
      });
    } finally {
      this.saving.set(false);
    }
  }
}
