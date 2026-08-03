import { starPoints } from './fabric-shapes';

describe('starPoints', () => {
  it('returns twice as many points as numPoints (tip + inner vertex per point)', () => {
    expect(starPoints(12, 5, 5)).toHaveLength(10);
  });

  it('alternates between outer and inner radius, starting with an outer tip', () => {
    const points = starPoints(12, 5, 5);
    const radiusOf = (p: { x: number; y: number }) => Math.hypot(p.x, p.y);
    expect(radiusOf(points[0])).toBeCloseTo(12);
    expect(radiusOf(points[1])).toBeCloseTo(5);
    expect(radiusOf(points[2])).toBeCloseTo(12);
  });

  it('starts pointing straight up (negative y, zero x)', () => {
    const [first] = starPoints(12, 5, 5);
    expect(first.x).toBeCloseTo(0);
    expect(first.y).toBeCloseTo(-12);
  });
});
