import { findDisallowedDiagramType } from './facial-diagram-canvas.component';

/**
 * Pure input/output tests over plain objects — no Fabric canvas, no TestBed, no DOM. This is the
 * allowlist that decides what a stored diagram blob is allowed to revive into, and it is applied to
 * two untrusted sources: this visit's own stored diagram and a referenced past visit's.
 */
describe('findDisallowedDiagramType', () => {
  it('accepts a pin marker group, one of the shapes this component actually creates', () => {
    expect(
      findDisallowedDiagramType({ type: 'Group', objects: [{ type: 'Circle' }, { type: 'IText' }] })
    ).toBeNull();
  });

  it('accepts the layoutManager descriptor Fabric v6 serializes into every Group', () => {
    expect(
      findDisallowedDiagramType({
        type: 'Group',
        layoutManager: { type: 'layoutManager', strategy: 'fit-content' },
        objects: [{ type: 'Line' }],
      })
    ).toBeNull();
  });

  it('rejects a top-level Image, which would fetch an attacker-controlled URL on load', () => {
    expect(
      findDisallowedDiagramType({ type: 'Image', src: 'https://attacker.example/x' })
    ).not.toBeNull();
  });

  it('rejects an Image smuggled through a nested clipPath', () => {
    expect(
      findDisallowedDiagramType({
        type: 'Circle',
        clipPath: { type: 'Image', src: 'https://attacker.example/x' },
      })
    ).not.toBeNull();
  });

  it('rejects a Pattern smuggled through a nested fill', () => {
    expect(
      findDisallowedDiagramType({
        type: 'Circle',
        fill: { type: 'Pattern', source: 'https://attacker.example/x' },
      })
    ).not.toBeNull();
  });
});
