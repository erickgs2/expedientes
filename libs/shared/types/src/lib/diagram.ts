import type { DiagramView } from './valoracion.js';

export type { DiagramView };

/** One view's persisted diagram data, independent of what it's attached to (a Valoración visit or
 * a Treatment item) — the shape both diagram-owning models return. Structurally identical to the
 * existing `ValoracionDiagram` type; that type is left untouched (TypeScript's structural typing
 * makes the two interchangeable wherever this one is expected) so nothing about Valoración's own
 * code needs to change for this. */
export interface DiagramViewRecord {
  view: DiagramView;
  data: Record<string, unknown>;
  updatedAt: string;
}
