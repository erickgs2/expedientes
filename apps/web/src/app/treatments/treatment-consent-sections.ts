import type { TreatmentType } from '@expedientes/shared-types';
import { CONSENT_SECTION_EXAMPLES } from '@expedientes/shared-types';

/** The five consent sections a treatment type carries, in the order they print on the consent. */
export type ConsentSectionKey =
  | 'consentDescription'
  | 'consentRisks'
  | 'consentAlternatives'
  | 'consentAftercare'
  | 'consentContraindications';

export interface ConsentSectionMeta {
  key: ConsentSectionKey;
  /** Full field label, e.g. "Riesgos y complicaciones". */
  labelKey: string;
  /** Short label for compact lists, e.g. "Riesgos". */
  shortKey: string;
  /** Heading printed on the consent PDF — Spanish always, like the consent itself. */
  pdfHeading: string;
  /** Worked example shown as placeholder and offered as a starting point. */
  example: string;
  required: boolean;
}

export const CONSENT_SECTIONS: readonly ConsentSectionMeta[] = [
  {
    key: 'consentDescription',
    labelKey: 'treatmentCatalog.consentDescription',
    shortKey: 'treatmentCatalog.sectionShort.description',
    pdfHeading: 'PROCEDIMIENTO',
    example: CONSENT_SECTION_EXAMPLES.description,
    required: true,
  },
  {
    key: 'consentRisks',
    labelKey: 'treatmentCatalog.consentRisks',
    shortKey: 'treatmentCatalog.sectionShort.risks',
    pdfHeading: 'RIESGOS Y COMPLICACIONES',
    example: CONSENT_SECTION_EXAMPLES.risks,
    required: false,
  },
  {
    key: 'consentAlternatives',
    labelKey: 'treatmentCatalog.consentAlternatives',
    shortKey: 'treatmentCatalog.sectionShort.alternatives',
    pdfHeading: 'ALTERNATIVAS DE TRATAMIENTO',
    example: CONSENT_SECTION_EXAMPLES.alternatives,
    required: false,
  },
  {
    key: 'consentAftercare',
    labelKey: 'treatmentCatalog.consentAftercare',
    shortKey: 'treatmentCatalog.sectionShort.aftercare',
    pdfHeading: 'CUIDADOS POSTERIORES',
    example: CONSENT_SECTION_EXAMPLES.aftercare,
    required: false,
  },
  {
    key: 'consentContraindications',
    labelKey: 'treatmentCatalog.consentContraindications',
    shortKey: 'treatmentCatalog.sectionShort.contraindications',
    pdfHeading: 'CONTRAINDICACIONES',
    example: CONSENT_SECTION_EXAMPLES.contraindications,
    required: false,
  },
];

/** Whether each section has text, in print order. */
export function sectionFlags(
  type: Pick<TreatmentType, ConsentSectionKey> | Record<ConsentSectionKey, string | null | undefined>
): boolean[] {
  return CONSENT_SECTIONS.map((s) => !!type[s.key]?.trim());
}

/**
 * The text after "Ejemplo:" in a worked example — the part that reads like real consent content.
 * The lead-in before it is guidance for whoever fills the form, not something to print.
 */
export function exampleBody(example: string): string {
  const marker = 'Ejemplo:';
  const at = example.indexOf(marker);
  return at === -1 ? example.trim() : example.slice(at + marker.length).trim();
}
