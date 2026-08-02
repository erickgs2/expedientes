export interface Valoracion {
  id: string;
  patientId: string;
  fecha: string;
  queQuiereElPaciente: string | null;
  queNecesitaElPaciente: string | null;
  notas: string | null;
}

export interface ValoracionUpdateInput {
  fecha?: string;
  queQuiereElPaciente?: string | null;
  queNecesitaElPaciente?: string | null;
  notas?: string | null;
}
