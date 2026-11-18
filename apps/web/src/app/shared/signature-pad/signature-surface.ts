/**
 * The drawing logic of a signature canvas, shared by the inline pad and the enlarged dialog: white
 * background (JPEG has no alpha, so transparency would export black), round black strokes whose
 * width scales with the canvas so a signature drawn large reads the same once shrunk.
 */
export class SignatureSurface {
  private drawing = false;
  private lastX = 0;
  private lastY = 0;
  private initialized = false;
  strokes = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly lineWidth: number
  ) {}

  /** Paints the white ground once, before the first stroke, without erasing later strokes. */
  private ensureGround(): void {
    if (this.initialized) return;
    const ctx = this.canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.initialized = true;
  }

  private point(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (event.clientY - rect.top) * (this.canvas.height / rect.height),
    };
  }

  down(event: PointerEvent): void {
    this.ensureGround();
    this.drawing = true;
    // Keeps the stroke when the finger slides off the canvas edge and back.
    (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
    const { x, y } = this.point(event);
    this.lastX = x;
    this.lastY = y;
  }

  /** Returns true when a stroke segment was drawn. */
  move(event: PointerEvent): boolean {
    if (!this.drawing) return false;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return false;
    const { x, y } = this.point(event);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = this.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(this.lastX, this.lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    this.lastX = x;
    this.lastY = y;
    this.strokes = true;
    return true;
  }

  up(): void {
    this.drawing = false;
  }

  clear(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.initialized = true;
    this.strokes = false;
  }

  /** Replaces the drawing with another canvas's, scaled to fit (same 3:1 shape). */
  copyFrom(source: HTMLCanvasElement, hasStrokes: boolean): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, this.canvas.width, this.canvas.height);
    this.initialized = true;
    this.strokes = hasStrokes;
  }
}
