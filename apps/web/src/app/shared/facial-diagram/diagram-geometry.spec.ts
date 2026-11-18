import { closeUpToFrontTransform, composeFrontDiagram, placeOnFront } from './diagram-geometry';

describe('full face as a summary of the close-ups', () => {
  it('maps the corners of each close-up onto its crop of the face', () => {
    // EYES crop: x 282, y 290, 460×230 artwork px on a 640×320 canvas; the face shows the
    // 1024 px artwork at 480/1024, centred vertically (60 px above and below).
    const t = closeUpToFrontTransform('EYES');
    const k = 480 / 1024;
    expect(t.dx).toBeCloseTo(282 * k);
    expect(t.dy).toBeCloseTo(290 * k + 60);
    // The close-up's bottom-right corner lands on the crop's bottom-right corner.
    expect(640 * t.scale + t.dx).toBeCloseTo((282 + 460) * k);
    expect(320 * t.scale + t.dy).toBeCloseTo((290 + 230) * k + 60);
  });

  it('moves a pin to its place on the face and keeps its size', () => {
    const t = closeUpToFrontTransform('NOSE');
    const pin = { type: 'Group', left: 240, top: 300, scaleX: 1, scaleY: 1 };
    const placed = placeOnFront(pin, t);
    expect(placed['left']).toBeCloseTo(240 * t.scale + t.dx);
    expect(placed['top']).toBeCloseTo(300 * t.scale + t.dy);
    expect(placed['scaleX']).toBe(1);
  });

  it('scales strokes and lines with the face and keeps their drawn width', () => {
    const t = closeUpToFrontTransform('LIPS');
    const stroke = { type: 'Path', left: 10, top: 20, scaleX: 2, scaleY: 1 };
    const placed = placeOnFront(stroke, t);
    expect(placed['scaleX']).toBeCloseTo(2 * t.scale);
    expect(placed['scaleY']).toBeCloseTo(t.scale);
    expect(placed['strokeUniform']).toBe(true);
  });

  it('gathers every close-up and keeps marks already drawn on the full face', () => {
    const composed = composeFrontDiagram({
      FRONT: { objects: [{ type: 'Polygon', left: 1, top: 1 }] },
      EYES: { objects: [{ type: 'Group', left: 0, top: 0 }] },
      NOSE: { objects: [{ type: 'Line', left: 0, top: 0 }, { type: 'Group', left: 5, top: 5 }] },
      LIPS: null,
      LEFT_PROFILE: { objects: [{ type: 'Group', left: 0, top: 0 }] },
    });
    const objects = composed?.['objects'] as Array<Record<string, unknown>>;
    expect(objects.length).toBe(4);
    expect(objects[0]).toEqual({ type: 'Polygon', left: 1, top: 1 });
  });

  it('is empty when nothing is marked', () => {
    expect(composeFrontDiagram({ EYES: { objects: [] } })).toBeNull();
  });
});
