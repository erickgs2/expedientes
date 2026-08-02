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
import { TranslocoModule } from '@jsverse/transloco';
import { Canvas, FabricImage, FabricObject, util } from 'fabric';
import { AuthService } from '../../auth/auth.service';
import { ValoracionService } from '../valoracion.service';

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 600;
const PLACEHOLDER_IMAGE_URL = '/assets/facial-diagram-placeholder.svg';

@Component({
  selector: 'app-facial-diagram',
  standalone: true,
  imports: [MatButtonModule, TranslocoModule],
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
        <div class="diagram-actions">
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
    `,
  ],
})
export class FacialDiagramComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input({ required: true }) valoracionId!: string;
  @Input() initialDiagramData: Record<string, unknown> | null = null;

  @ViewChild('canvasEl') private readonly canvasEl!: ElementRef<HTMLCanvasElement>;

  private readonly valoracionService = inject(ValoracionService);
  private readonly auth = inject(AuthService);

  protected readonly canvasWidth = CANVAS_WIDTH;
  protected readonly canvasHeight = CANVAS_HEIGHT;
  protected readonly saving = signal(false);
  protected canEdit = false;

  protected canvas!: Canvas;

  ngOnInit(): void {
    this.canEdit = this.auth.hasPermission('valoracion', 'edit');
  }

  async ngAfterViewInit(): Promise<void> {
    this.canvas = new Canvas(this.canvasEl.nativeElement, {
      isDrawingMode: false,
      selection: this.canEdit,
    });

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

    this.canvas.on('mouse:down', () => this.canvasEl.nativeElement.parentElement?.focus());

    this.canvas.requestRenderAll();
  }

  ngOnDestroy(): void {
    this.canvas?.dispose();
  }

  protected onKeyDown(event: KeyboardEvent): void {
    // Placeholder for Task 6's delete-selected handling.
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
