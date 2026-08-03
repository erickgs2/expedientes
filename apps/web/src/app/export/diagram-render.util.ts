import { FabricImage, StaticCanvas, util } from 'fabric';
import type { DiagramView } from '@expedientes/shared-types';
import {
  PLACEHOLDER_IMAGE_URLS,
  findDisallowedDiagramType,
} from '../shared/facial-diagram/facial-diagram-canvas.component';

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 600;

/**
 * Renders a stored diagram (the same JSON shape `FacialDiagramCanvasComponent` loads
 * interactively) to a PNG blob, for the PDF export flow. Uses Fabric's `StaticCanvas` — a
 * non-interactive render target — against a `<canvas>` element created here and never inserted
 * into the DOM; `HTMLCanvasElement.toBlob()` works on a detached canvas, so no off-screen DOM
 * insertion is needed.
 *
 * Reuses `findDisallowedDiagramType` from the interactive canvas component directly, rather than
 * re-implementing the security allowlist that keeps a corrupted/tampered stored diagram blob from
 * reviving into arbitrary Fabric classes (see that function's own documentation) — this export
 * path handles the exact same untrusted stored data and must apply the same filter.
 *
 * Returns `null` on any failure (network/decode error loading the placeholder image, a malformed
 * stored diagram, etc.) — the caller must treat `null` as "this diagram could not be rendered" and
 * abort the export rather than silently omitting the image.
 */
export async function renderDiagramToBlob(
  view: DiagramView,
  data: Record<string, unknown>
): Promise<Blob | null> {
  const canvasEl = document.createElement('canvas');
  canvasEl.width = CANVAS_WIDTH;
  canvasEl.height = CANVAS_HEIGHT;
  const canvas = new StaticCanvas(canvasEl);

  try {
    const background = await FabricImage.fromURL(PLACEHOLDER_IMAGE_URLS[view]);
    background.set({ selectable: false, evented: false });
    background.scaleToWidth(CANVAS_WIDTH);
    canvas.backgroundImage = background;

    if (Array.isArray(data['objects'])) {
      const stored = data['objects'] as Record<string, unknown>[];
      const safe = stored.filter((obj) => findDisallowedDiagramType(obj) === null);
      const objects = await util.enlivenObjects(safe);
      objects.forEach((obj) => canvas.add(obj as never));
    }

    canvas.renderAll();

    return await new Promise<Blob | null>((resolve) => {
      canvasEl.toBlob((blob) => resolve(blob), 'image/png');
    });
  } catch (error) {
    console.error(`Failed to render diagram (${view}) for export`, error);
    return null;
  } finally {
    canvas.dispose();
  }
}
