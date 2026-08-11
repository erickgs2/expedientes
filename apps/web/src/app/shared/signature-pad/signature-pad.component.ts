import { Component, ElementRef, ViewChild, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoModule } from '@jsverse/transloco';

const SIGNATURE_JPEG_QUALITY = 0.9;

@Component({
  selector: 'app-signature-pad',
  standalone: true,
  imports: [MatButtonModule, TranslocoModule],
  template: `
    <canvas
      #canvas
      class="signature-canvas"
      width="600"
      height="200"
      (pointerdown)="onPointerDown($event)"
      (pointermove)="onPointerMove($event)"
      (pointerup)="onPointerUp()"
      (pointerleave)="onPointerUp()"
    ></canvas>
    <button mat-button type="button" [disabled]="disabled()" (click)="clear()">
      {{ 'treatments.clearSignature' | transloco }}
    </button>
  `,
  styles: [
    `
      .signature-canvas {
        border: 1px solid var(--mat-sys-outline, rgba(0, 0, 0, 0.3));
        touch-action: none;
        max-width: 100%;
        display: block;
      }
    `,
  ],
})
export class SignaturePadComponent {
  readonly disabled = input(false);
  readonly hasStrokes = signal(false);

  @ViewChild('canvas') private canvasRef!: ElementRef<HTMLCanvasElement>;

  private drawing = false;
  private lastX = 0;
  private lastY = 0;
  private canvasInitialized = false;

  // The canvas defaults to a transparent background, but JPEG has no alpha channel — exporting an
  // untouched canvas straight to JPEG renders transparent pixels as black, not white. Filling it
  // opaque white before the first stroke keeps the exported signature on a white background. Only
  // done once per canvas (guarded by `canvasInitialized`), since re-filling on every stroke's
  // pointerdown would erase earlier strokes of a multi-stroke signature.
  private ensureCanvasInitialized(canvas: HTMLCanvasElement): void {
    if (this.canvasInitialized) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    this.canvasInitialized = true;
  }

  protected onPointerDown(event: PointerEvent): void {
    if (this.disabled()) return;
    const canvas = this.canvasRef.nativeElement;
    this.ensureCanvasInitialized(canvas);
    this.drawing = true;
    const rect = canvas.getBoundingClientRect();
    this.lastX = (event.clientX - rect.left) * (canvas.width / rect.width);
    this.lastY = (event.clientY - rect.top) * (canvas.height / rect.height);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.drawing) return;
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(this.lastX, this.lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    this.lastX = x;
    this.lastY = y;
    this.hasStrokes.set(true);
  }

  protected onPointerUp(): void {
    this.drawing = false;
  }

  clear(): void {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.canvasInitialized = true;
    this.hasStrokes.set(false);
  }

  toJpegBlob(): Promise<Blob | null> {
    return new Promise((resolve) =>
      this.canvasRef.nativeElement.toBlob(resolve, 'image/jpeg', SIGNATURE_JPEG_QUALITY)
    );
  }
}
