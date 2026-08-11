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
    identifiesWith: 'SE IDENTIFICA CON',
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
      doctor: 'MEDICO',
    },
  },
  en: {
    title: 'INFORMED CONSENT',
    place: 'PLACE',
    date: 'DATE',
    patient: 'PATIENT',
    identifiesWith: 'IDENTIFIES WITH',
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
      doctor: 'DOCTOR',
    },
  },
};
