import type { FabricImage } from 'fabric';
import type { DiagramView } from '@expedientes/shared-types';

/** Logical canvas size of the full-face views. Serialized object coordinates live in this space. */
export const CANVAS_WIDTH = 480;
export const CANVAS_HEIGHT = 600;

/**
 * Base images drawn under every diagram — one shared set (the clinic's facial-muscle art) used by
 * both Valoración and Treatments diagrams. The close-ups reuse the front artwork, cropped.
 */
export const DIAGRAM_IMAGE_URLS: Record<DiagramView, string> = {
  FRONT: '/assets/facial-diagram-placeholder.svg',
  LEFT_PROFILE: '/assets/facial-diagram-placeholder-left.svg',
  RIGHT_PROFILE: '/assets/facial-diagram-placeholder-right.svg',
  EYES: '/assets/facial-diagram-placeholder.svg',
  NOSE: '/assets/facial-diagram-placeholder.svg',
  LIPS: '/assets/facial-diagram-placeholder.svg',
};

export type CloseUpView = 'EYES' | 'NOSE' | 'LIPS';

/** Close-ups of the front view, in the order they are offered. */
export const CLOSE_UP_VIEWS: CloseUpView[] = ['EYES', 'NOSE', 'LIPS'];

export function isCloseUpView(view: DiagramView): view is CloseUpView {
  return (CLOSE_UP_VIEWS as DiagramView[]).includes(view);
}

/**
 * Region of the 1024×1024 front artwork each close-up shows, in artwork pixels. Each rectangle has
 * exactly its canvas's aspect ratio (see {@link DIAGRAM_CANVAS_SIZES}), so the crop fills the
 * canvas without distortion. Measured against `facial-diagram-placeholder.svg`: eyes span roughly
 * x 320–700 / y 340–470 (brows to under-eye), the nose x 460–565 / y 400–570, the lips
 * x 420–605 / y 585–680 — each rectangle adds margin for the surrounding area treated with it.
 */
const CLOSE_UP_CROPS: Record<CloseUpView, { x: number; y: number; width: number; height: number }> = {
  EYES: { x: 282, y: 290, width: 460, height: 230 },
  NOSE: { x: 412, y: 365, width: 200, height: 250 },
  LIPS: { x: 352, y: 535, width: 320, height: 200 },
};

/**
 * Logical canvas size per view. Close-ups are shaped like the feature they show (the eye area is
 * wide, the nose tall) instead of reusing the portrait full-face canvas.
 */
export const DIAGRAM_CANVAS_SIZES: Record<DiagramView, { width: number; height: number }> = {
  FRONT: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
  LEFT_PROFILE: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
  RIGHT_PROFILE: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
  EYES: { width: 640, height: 320 },
  NOSE: { width: 480, height: 600 },
  LIPS: { width: 640, height: 400 },
};

/**
 * Positions `background` for `view`. Full views scale the square (1024×1024) artwork to fit
 * entirely inside the 480×600 canvas and center it — without this it would sit top-aligned with
 * dead space below. Close-ups scale it up so the view's crop rectangle exactly fills the canvas;
 * everything outside the rectangle falls off-canvas and is clipped.
 */
export function fitBackgroundToCanvas(background: FabricImage, view: DiagramView): void {
  const { width, height } = DIAGRAM_CANVAS_SIZES[view];
  if (isCloseUpView(view)) {
    const crop = CLOSE_UP_CROPS[view];
    // Crops are artwork pixels; the loaded image may report a different intrinsic size.
    const unit = background.width / 1024;
    const scale = width / (crop.width * unit);
    background.scale(scale);
    background.set({ left: -crop.x * unit * scale, top: -crop.y * unit * scale });
    return;
  }
  const scale = Math.min(width / background.width, height / background.height);
  background.scale(scale);
  background.set({
    left: (width - background.width * scale) / 2,
    top: (height - background.height * scale) / 2,
  });
}
