import { FabricImage, StaticCanvas, util } from 'fabric';
import type { DiagramView } from '@expedientes/shared-types';
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  DIAGRAM_IMAGE_URLS,
  findDisallowedDiagramType,
  fitBackgroundToCanvas,
} from './facial-diagram-canvas.component';

/**
 * Renders a stored diagram (the same JSON shape `FacialDiagramCanvasComponent` loads
 * interactively) to a PNG blob. Used both for the PDF export flow and for the read-only
 * previews shown next to each view's Edit button. Uses Fabric's `StaticCanvas` — a
 * non-interactive render target — against a `<canvas>` element created here and never inserted
 * into the DOM; `HTMLCanvasElement.toBlob()` works on a detached canvas, so no off-screen DOM
 * insertion is needed.
 *
 * Reuses `findDisallowedDiagramType` from the interactive canvas component directly, rather than
 * re-implementing the security allowlist that keeps a corrupted/tampered stored diagram blob from
 * reviving into arbitrary Fabric classes (see that function's own documentation) — this render
 * path handles the exact same untrusted stored data and must apply the same filter.
 *
 * Returns `null` on any failure (network/decode error loading the base image, a malformed
 * stored diagram, etc.) — export callers must treat `null` as "this diagram could not be
 * rendered" and abort the export rather than silently omitting the image.
 */
export async function renderDiagramToBlob(
  view: DiagramView,
  data: Record<string, unknown>
): Promise<Blob | null> {
  const canvasEl = document.createElement('canvas');
  canvasEl.width = CANVAS_WIDTH;
  canvasEl.height = CANVAS_HEIGHT;
  const canvas = new StaticCanvas(canvasEl, { backgroundColor: '#ffffff' });

  try {
    const background = await FabricImage.fromURL(DIAGRAM_IMAGE_URLS[view]);
    background.set({ selectable: false, evented: false });
    fitBackgroundToCanvas(background);
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
    console.error(`Failed to render diagram (${view})`, error);
    return null;
  } finally {
    canvas.dispose();
  }
}
