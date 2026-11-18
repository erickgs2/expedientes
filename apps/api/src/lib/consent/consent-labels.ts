import type { ConsentDocumentLabels } from './build-consent-document';

/**
 * Consents are always assembled in Spanish (`CONSENT_LABELS.es`) for the signing screen, because
 * the consent is signed in Spanish regardless of the UI language. The English set exists for
 * exports/previews that explicitly request it — hence a bundle keyed by language rather than a
 * single constant.
 */
export const CONSENT_LABELS: Record<'es' | 'en', ConsentDocumentLabels> = {
  es: {
    title: 'CONSENTIMIENTO INFORMADO',
    place: 'LUGAR',
    date: 'FECHA',
    patient: 'PACIENTE',
    identifiesWith: 'REGISTRO DE POBLACION (CURP)',
    sections: {
      description: 'PROCEDIMIENTO',
      risks: 'RIESGOS Y COMPLICACIONES',
      alternatives: 'ALTERNATIVAS DE TRATAMIENTO',
      aftercare: 'CUIDADOS POSTERIORES',
      contraindications: 'CONTRAINDICACIONES',
    },
    signatures: {
      patient: 'PACIENTE',
      witness: 'TESTIGO',
      secondWitness: 'TESTIGO',
      doctor: 'MEDICO',
    },
  },
  en: {
    title: 'INFORMED CONSENT',
    place: 'PLACE',
    date: 'DATE',
    patient: 'PATIENT',
    identifiesWith: 'POPULATION REGISTRY ID (CURP)',
    sections: {
      description: 'PROCEDURE',
      risks: 'RISKS AND COMPLICATIONS',
      alternatives: 'TREATMENT ALTERNATIVES',
      aftercare: 'AFTERCARE',
      contraindications: 'CONTRAINDICATIONS',
    },
    signatures: {
      patient: 'PATIENT',
      witness: 'WITNESS',
      secondWitness: 'WITNESS',
      doctor: 'DOCTOR',
    },
  },
};

/**
 * NOM-004-SSA3-2012 10.1.1 lists, among a consent letter's minimum content, the authorization to
 * attend contingencies and emergencies derived from the authorized act. Printed on every new letter
 * after the declarations and frozen onto the Consent row when it is signed; it is not part of the
 * editable declarations, so no clinic can remove it by editing its text.
 *
 * Draft wording pending legal review.
 */
export const CONSENT_CONTINGENCY_CLAUSE =
  'ASIMISMO, AUTORIZO A {{doctorTitle}} {{doctorName}} Y A SU EQUIPO PARA ATENDER LAS CONTINGENCIAS Y URGENCIAS QUE SE DERIVEN DEL ACTO AUTORIZADO, CONFORME A SU CRITERIO PROFESIONAL Y EN BENEFICIO DE MI SALUD.';
