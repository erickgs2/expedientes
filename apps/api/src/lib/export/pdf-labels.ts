export interface PdfLabels {
  generatedOn: string;
  patientInfo: { phone: string; documentId: string };
  historiaClinica: {
    sectionTitle: string;
    personalInfo: string;
    medicalInfo: string;
    personalHistory: string;
    familyHistory: string;
    fields: {
      ocupacion: string;
      fechaNacimiento: string;
      sexo: string;
      alergias: string;
      queQuiereElPaciente: string;
      queNecesitaElPaciente: string;
      atributosEmocionales: string;
      enfermedadesActuales: string;
      medicamentosAcne3Meses: string;
      cirugiasEsteticasAnteriores: string;
      rutinaCuidadoFacial: string;
      consumoAlcohol: string;
      consumoTabaco: string;
      consumoDrogas: string;
      tipoFrecuenciaEjercicio: string;
      vacunas: string;
      posibilidadEmbarazo: string;
      antecedentesHeredofamiliares: string;
    };
    sexoOptions: { femenino: string; masculino: string; otro: string };
    posibilidadEmbarazoOptions: { si: string; no: string; no_aplica: string };
  };
  valoracion: { sectionTitle: string; visitOn: string; notes: string };
  treatments: { sectionTitle: string; visitOn: string; notes: string; consent: string };
}

export const PDF_LABELS: Record<'es' | 'en', PdfLabels> = {
  es: {
    generatedOn: 'Generado el',
    patientInfo: { phone: 'Teléfono', documentId: 'Documento de identidad' },
    historiaClinica: {
      sectionTitle: 'Historia clínica',
      personalInfo: 'Información del paciente',
      medicalInfo: 'Información médica',
      personalHistory: 'Antecedentes personales no patológicos',
      familyHistory: 'Antecedentes heredofamiliares',
      fields: {
        ocupacion: 'Ocupación',
        fechaNacimiento: 'Fecha de nacimiento',
        sexo: 'Sexo',
        alergias: 'Alergias',
        queQuiereElPaciente: 'Qué quiere el paciente',
        queNecesitaElPaciente: 'Qué necesita el paciente',
        atributosEmocionales: 'Atributos emocionales',
        enfermedadesActuales: 'Enfermedades actuales',
        medicamentosAcne3Meses: 'Medicamentos para acné en los últimos 3 meses',
        cirugiasEsteticasAnteriores: 'Cirugías estéticas o tratamientos estéticos anteriores',
        rutinaCuidadoFacial: 'Rutina de cuidado facial',
        consumoAlcohol: 'Consumo de alcohol',
        consumoTabaco: 'Consumo de tabaco',
        consumoDrogas: 'Consumo de drogas',
        tipoFrecuenciaEjercicio: 'Tipo y frecuencia de ejercicio',
        vacunas: 'Vacunas',
        posibilidadEmbarazo: 'Posibilidad de embarazo',
        antecedentesHeredofamiliares: 'Antecedentes heredofamiliares',
      },
      sexoOptions: { femenino: 'Femenino', masculino: 'Masculino', otro: 'Otro' },
      posibilidadEmbarazoOptions: { si: 'Sí', no: 'No', no_aplica: 'No aplica' },
    },
    valoracion: { sectionTitle: 'Valoración', visitOn: 'Visita del', notes: 'Notas' },
    treatments: {
      sectionTitle: 'Tratamientos',
      visitOn: 'Visita del',
      notes: 'Notas',
      consent: 'Consentimiento',
    },
  },
  en: {
    generatedOn: 'Generated on',
    patientInfo: { phone: 'Phone', documentId: 'Document ID' },
    historiaClinica: {
      sectionTitle: 'Medical History',
      personalInfo: 'Patient information',
      medicalInfo: 'Medical information',
      personalHistory: 'Personal history (non-pathological)',
      familyHistory: 'Family history',
      fields: {
        ocupacion: 'Occupation',
        fechaNacimiento: 'Date of birth',
        sexo: 'Sex',
        alergias: 'Allergies',
        queQuiereElPaciente: 'What the patient wants',
        queNecesitaElPaciente: 'What the patient needs',
        atributosEmocionales: 'Emotional attributes',
        enfermedadesActuales: 'Current illnesses',
        medicamentosAcne3Meses: 'Acne medications in the last 3 months',
        cirugiasEsteticasAnteriores: 'Previous cosmetic surgeries or treatments',
        rutinaCuidadoFacial: 'Facial care routine',
        consumoAlcohol: 'Alcohol use',
        consumoTabaco: 'Tobacco use',
        consumoDrogas: 'Drug use',
        tipoFrecuenciaEjercicio: 'Exercise type and frequency',
        vacunas: 'Vaccinations',
        posibilidadEmbarazo: 'Possibility of pregnancy',
        antecedentesHeredofamiliares: 'Family medical history',
      },
      sexoOptions: { femenino: 'Female', masculino: 'Male', otro: 'Other' },
      posibilidadEmbarazoOptions: { si: 'Yes', no: 'No', no_aplica: 'Not applicable' },
    },
    valoracion: { sectionTitle: 'Assessment', visitOn: 'Visit on', notes: 'Notes' },
    treatments: {
      sectionTitle: 'Treatments',
      visitOn: 'Visit on',
      notes: 'Notes',
      consent: 'Consent',
    },
  },
};
