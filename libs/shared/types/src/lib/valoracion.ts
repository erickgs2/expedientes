export type DiagramView = 'FRONT' | 'LEFT_PROFILE' | 'RIGHT_PROFILE';

export interface ValoracionDiagram {
  view: DiagramView;
  data: Record<string, unknown>;
  updatedAt: string;
}

export interface Valoracion {
  id: string;
  patientId: string;
  fecha: string;
  queQuiereElPaciente: string | null;
  queNecesitaElPaciente: string | null;
  notas: string | null;
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
