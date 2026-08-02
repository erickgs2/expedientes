export interface Valoracion {
  id: string;
  patientId: string;
  fecha: string;
  queQuiereElPaciente: string | null;
  queNecesitaElPaciente: string | null;
  notas: string | null;
  diagramData: Record<string, unknown> | null;
  diagramUpdatedAt: string | null;
}

export interface ValoracionUpdateInput {
  fecha?: string;
  queQuiereElPaciente?: string | null;
  queNecesitaElPaciente?: string | null;
  notas?: string | null;
}

export interface ValoracionDiagramUpdateInput {
  diagramData: Record<string, unknown>;
}
