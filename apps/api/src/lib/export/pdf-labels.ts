export interface PdfLabels {
  generatedOn: string;
  /** Footer on the record pages of PDFs exported on the Free plan. */
  generatedWith: string;
  /** Author and signature line under each note (NOM-004-SSA3-2012 5.10). */
  signature: {
    recordedBy: string;
    recordedAt: string;
    authorUnknown: string;
    signedBy: string;
    license: string;
    unsigned: string;
    legacy: string;
    addendum: string;
  };
  /** Annex of photos retired from the galleries (exported only when asked for). */
  retiredPhotos: {
    title: string;
    intro: string;
    valoracion: string;
    tags: { BEFORE: string; AFTER: string };
    takenOn: string;
    retiredOn: string;
    by: string;
  };
  patientInfo: { phone: string; documentId: string; recordNumber: string; age: string; years: string; sex: string };
  /** NOM-004-SSA3-2012 6.1/6.2 fields added in phase D (see lib/clinical/clinical-fields.ts). */
  clinical: {
    pathological: string;
    systems: string;
    physicalExam: string;
    assessment: string;
    evolution: string;
    vitals: string;
    bmi: string;
    fields: Record<string, string>;
    skinTypes: Record<string, string>;
    units: Record<string, string>;
    routes: Record<string, string>;
    dose: string;
  };
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
  treatments: {
    sectionTitle: string;
    visitOn: string;
    notes: string;
    consent: string;
    consentSignedOn: string;
    consentAnnexRef: string;
    consentScan: { title: string; covers: string; signedOn: string };
    consentPageOf: string;
    products: string;
    productBrand: string;
    productLot: string;
    productExpiry: string;
  };
}

export const PDF_LABELS: Record<'es' | 'en', PdfLabels> = {
  es: {
    generatedOn: 'Generado el',
    generatedWith: 'Generado con MedCloud',
    signature: {
      recordedBy: 'Registró',
      recordedAt: 'el',
      authorUnknown: 'autor no registrado',
      signedBy: 'Firmado electrónicamente por',
      license: 'Céd.',
      unsigned: 'Sin firma',
      legacy: 'Registro anterior a la firma electrónica',
      addendum: 'Adenda',
    },
    retiredPhotos: {
      title: 'Fotos retiradas de la galería',
      intro: 'Fotos que se quitaron de la galería del expediente. Se conservan como parte del expediente clínico.',
      valoracion: 'Valoración',
      tags: { BEFORE: 'Antes', AFTER: 'Después' },
      takenOn: 'Tomada el',
      retiredOn: 'Retirada el',
      by: 'por',
    },
    patientInfo: { phone: 'Teléfono', documentId: 'CURP', recordNumber: 'Expediente', age: 'Edad', years: 'años', sex: 'Sexo' },
    clinical: {
      pathological: 'Antecedentes personales patológicos y padecimiento actual',
      systems: 'Interrogatorio por aparatos y sistemas',
      physicalExam: 'Exploración física',
      assessment: 'Estudios, diagnóstico y plan',
      evolution: 'Nota de evolución',
      vitals: 'Signos vitales',
      bmi: 'IMC',
      fields: {
        antecedentesPersonalesPatologicos: 'Antecedentes personales patológicos',
        padecimientoActual: 'Padecimiento actual',
        interrogatorioPiel: 'Piel y anexos',
        interrogatorioCardiovascular: 'Cardiovascular',
        interrogatorioEndocrino: 'Endócrino',
        interrogatorioNeurologico: 'Neurológico',
        interrogatorioOtros: 'Otros aparatos y sistemas',
        presionSistolica: 'TA',
        frecuenciaCardiaca: 'FC',
        frecuenciaRespiratoria: 'FR',
        temperatura: 'Temp.',
        peso: 'Peso',
        talla: 'Talla',
        fototipoFitzpatrick: 'Fototipo de Fitzpatrick',
        tipoPiel: 'Tipo de piel',
        exploracionFacial: 'Exploración facial',
        lesionesCutaneas: 'Lesiones cutáneas',
        resultadosEstudios: 'Resultados de estudios',
        diagnostico: 'Diagnóstico',
        pronostico: 'Pronóstico',
        indicacionTerapeutica: 'Indicación terapéutica',
        evolucion: 'Evolución del cuadro',
        indicaciones: 'Indicaciones',
      },
      skinTypes: { normal: 'Normal', seca: 'Seca', grasa: 'Grasa', mixta: 'Mixta', sensible: 'Sensible' },
      units: { U: 'U', ml: 'ml', mg: 'mg', g: 'g' },
      routes: {
        intradermica: 'intradérmica',
        subcutanea: 'subcutánea',
        supraperiostica: 'supraperióstica',
        intramuscular: 'intramuscular',
        intralesional: 'intralesional',
        topica: 'tópica',
      },
      dose: 'Aplicación',
    },
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
      consentSignedOn: 'Consentimiento firmado el',
      consentAnnexRef: 'ver anexo',
      consentScan: {
        title: 'Consentimiento firmado en papel',
        covers: 'Cartas que ampara',
        signedOn: 'Firmado el',
      },
      consentPageOf: 'Página {{n}} de {{total}}',
      products: 'Productos utilizados',
      productBrand: 'Marca',
      productLot: 'Lote',
      productExpiry: 'Caducidad',
    },
  },
  en: {
    generatedOn: 'Generated on',
    generatedWith: 'Generated with MedCloud',
    signature: {
      recordedBy: 'Recorded by',
      recordedAt: 'on',
      authorUnknown: 'author not recorded',
      signedBy: 'Electronically signed by',
      license: 'Lic.',
      unsigned: 'Not signed',
      legacy: 'Recorded before electronic signatures',
      addendum: 'Addendum',
    },
    retiredPhotos: {
      title: 'Photos retired from the gallery',
      intro: 'Photos taken out of the record\'s gallery. They are kept as part of the clinical record.',
      valoracion: 'Assessment',
      tags: { BEFORE: 'Before', AFTER: 'After' },
      takenOn: 'Taken on',
      retiredOn: 'Retired on',
      by: 'by',
    },
    patientInfo: { phone: 'Phone', documentId: 'CURP', recordNumber: 'Record no.', age: 'Age', years: 'years', sex: 'Sex' },
    clinical: {
      pathological: 'Past medical history and present illness',
      systems: 'Review of systems',
      physicalExam: 'Physical examination',
      assessment: 'Studies, diagnosis and plan',
      evolution: 'Progress note',
      vitals: 'Vital signs',
      bmi: 'BMI',
      fields: {
        antecedentesPersonalesPatologicos: 'Past medical history',
        padecimientoActual: 'Present illness',
        interrogatorioPiel: 'Skin',
        interrogatorioCardiovascular: 'Cardiovascular',
        interrogatorioEndocrino: 'Endocrine',
        interrogatorioNeurologico: 'Neurological',
        interrogatorioOtros: 'Other systems',
        presionSistolica: 'BP',
        frecuenciaCardiaca: 'HR',
        frecuenciaRespiratoria: 'RR',
        temperatura: 'Temp.',
        peso: 'Weight',
        talla: 'Height',
        fototipoFitzpatrick: 'Fitzpatrick phototype',
        tipoPiel: 'Skin type',
        exploracionFacial: 'Facial examination',
        lesionesCutaneas: 'Skin lesions',
        resultadosEstudios: 'Study results',
        diagnostico: 'Diagnosis',
        pronostico: 'Prognosis',
        indicacionTerapeutica: 'Treatment plan',
        evolucion: 'Progress',
        indicaciones: 'Instructions',
      },
      skinTypes: { normal: 'Normal', seca: 'Dry', grasa: 'Oily', mixta: 'Combination', sensible: 'Sensitive' },
      units: { U: 'U', ml: 'ml', mg: 'mg', g: 'g' },
      routes: {
        intradermica: 'intradermal',
        subcutanea: 'subcutaneous',
        supraperiostica: 'supraperiosteal',
        intramuscular: 'intramuscular',
        intralesional: 'intralesional',
        topica: 'topical',
      },
      dose: 'Applied',
    },
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
      consentSignedOn: 'Consent signed on',
      consentAnnexRef: 'see annex',
      consentScan: {
        title: 'Consent signed on paper',
        covers: 'Letters covered',
        signedOn: 'Signed on',
      },
      consentPageOf: 'Page {{n}} of {{total}}',
      products: 'Products used',
      productBrand: 'Brand',
      productLot: 'Lot',
      productExpiry: 'Expiry',
    },
  },
};
