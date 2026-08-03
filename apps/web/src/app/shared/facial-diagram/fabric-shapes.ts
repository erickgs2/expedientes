import { Circle, Group, IText, Line, Polygon } from 'fabric';

const MARKER_COLOR = '#e53935';

export function createPinMarker(number: number, left: number, top: number): Group {
  const circle = new Circle({
    radius: 12,
    fill: MARKER_COLOR,
    stroke: '#ffffff',
    strokeWidth: 2,
    originX: 'center',
    originY: 'center',
  });
  const label = new IText(String(number), {
    fontSize: 14,
    fill: '#ffffff',
    fontWeight: 'bold',
    originX: 'center',
    originY: 'center',
    editable: false,
    selectable: false,
  });
  return new Group([circle, label], { left, top, originX: 'center', originY: 'center' });
}

export function createXMarker(left: number, top: number): Group {
  const line1 = new Line([-10, -10, 10, 10], { stroke: MARKER_COLOR, strokeWidth: 3 });
  const line2 = new Line([-10, 10, 10, -10], { stroke: MARKER_COLOR, strokeWidth: 3 });
  return new Group([line1, line2], { left, top, originX: 'center', originY: 'center' });
}

export function createStarMarker(left: number, top: number): Polygon {
  return new Polygon(starPoints(12, 5, 5), {
    left,
    top,
    fill: MARKER_COLOR,
    stroke: '#ffffff',
    strokeWidth: 1,
    originX: 'center',
    originY: 'center',
  });
}

/**
 * Computes points for a `numPoints`-pointed star centered on the origin, alternating between
 * `outerRadius` (tips) and `innerRadius` (inner vertices), starting straight up.
 */
export function starPoints(
  outerRadius: number,
  innerRadius: number,
  numPoints: number
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [];
  const step = Math.PI / numPoints;
  for (let i = 0; i < 2 * numPoints; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = i * step - Math.PI / 2;
    points.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
  }
  return points;
}
