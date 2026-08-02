export type DiagramView = 'FRONT' | 'LEFT_PROFILE' | 'RIGHT_PROFILE';

export interface ValoracionDiagram {
  view: DiagramView;
  data: Record<string, unknown>;
  updatedAt: string;
}

/**
 * A Valoración *without* its diagrams — the shape returned by the list endpoint
 * (`GET /api/patients/:patientId/valoracion`), which deliberately skips the `diagrams` relation so
 * it never ships a full diagram JSON blob per row. Use this for anything whose data came from
 * `ValoracionService.list()`; reaching for `.diagrams` there is a compile error rather than a
 * silent `undefined`.
 */
export interface ValoracionSummary {
  id: string;
  patientId: string;
  fecha: string;
  queQuiereElPaciente: string | null;
  queNecesitaElPaciente: string | null;
  notas: string | null;
}

/** A Valoración with its diagrams — returned by the get, create, update and diagram endpoints. */
export interface Valoracion extends ValoracionSummary {
  diagrams: ValoracionDiagram[];
}

export interface ValoracionUpdateInput {
  fecha?: string;
  queQuiereElPaciente?: string | null;
  queNecesitaElPaciente?: string | null;
  notas?: string | null;
}

export interface ValoracionDiagramsUpdateInput {
  views: {
    front?: Record<string, unknown> | null;
    leftProfile?: Record<string, unknown> | null;
    rightProfile?: Record<string, unknown> | null;
  };
}
