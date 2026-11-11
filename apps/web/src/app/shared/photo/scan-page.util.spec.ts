import { fitWithin } from './scan-page.util';

describe('fitWithin', () => {
  it('keeps an image that already fits', () => {
    expect(fitWithin(1200, 800, 2000)).toEqual({ width: 1200, height: 800 });
  });

  it('scales a large landscape image down by its longest edge, keeping proportions', () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
  });

  it('scales a large portrait image down by its longest edge', () => {
    expect(fitWithin(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
  });

  it('never returns a zero-sized side for an extreme aspect ratio', () => {
    expect(fitWithin(10000, 10, 2000)).toEqual({ width: 2000, height: 2 });
    expect(fitWithin(100000, 10, 2000).height).toBeGreaterThanOrEqual(1);
  });
});
