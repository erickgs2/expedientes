export interface AllergyOption {
  id: string;
  name: string;
}

export interface HistoriaClinica {
  id: string;
  patientId: string;
  fecha: string;
  ocupacion: string | null;
  fechaNacimiento: string | null;
  sexo: string | null;
  queQuiereElPaciente: string | null;
  queNecesitaElPaciente: string | null;
  atributosEmocionales: string | null;
  enfermedadesActuales: string | null;
  medicamentosAcne3Meses: string | null;
  cirugiasEsteticasAnteriores: string | null;
  rutinaCuidadoFacial: string | null;
  consumoAlcohol: string | null;
  consumoTabaco: string | null;
  consumoDrogas: string | null;
  tipoFrecuenciaEjercicio: string | null;
  vacunas: string | null;
  posibilidadEmbarazo: string | null;
  antecedentesHeredofamiliares: string | null;
  allergies: { allergy: AllergyOption }[];
}

export interface HistoriaClinicaInput {
  ocupacion?: string;
  fechaNacimiento?: string;
  sexo?: string;
  queQuiereElPaciente?: string;
  queNecesitaElPaciente?: string;
  atributosEmocionales?: string;
  enfermedadesActuales?: string;
  medicamentosAcne3Meses?: string;
  cirugiasEsteticasAnteriores?: string;
  rutinaCuidadoFacial?: string;
  consumoAlcohol?: string;
  consumoTabaco?: string;
  consumoDrogas?: string;
  tipoFrecuenciaEjercicio?: string;
  vacunas?: string;
  posibilidadEmbarazo?: string;
  antecedentesHeredofamiliares?: string;
  allergyNames?: string[];
}
