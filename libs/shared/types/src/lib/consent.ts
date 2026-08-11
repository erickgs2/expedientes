import type { DiagramViewRecord } from './diagram.js';

export interface Consent {
  id: string;
  place: string;
  patientIdentification: string;
  witnessName: string | null;
  patientSignatureImagePath: string;
  witnessSignatureImagePath: string | null;
  /**
   * The date the document itself prints as its FECHA: a `YYYY-MM-DD` string resolved in the
   * clinic's local timezone at signing and frozen. Not derived from `signedAt`, which is the UTC
   * audit timestamp and would show the wrong calendar day for a late-evening signing.
   */
  signedDateSnapshot: string;
  signedAt: string;
}

/** One treatment item's full detail — returned by `GET /api/treatment-items/[id]`, the shape the
 * consent-signing page reads: `consentPreview` for display before signing, `consentDocument` (built
 * from the frozen snapshot) once signed. */
export interface TreatmentItemDetail {
  id: string;
  treatmentId: string;
  treatmentTypeId: string;
  treatmentTypeName: string;
  notes: string | null;
  patientId: string;
  patientDocumentId: string;
  /** Blocks for an unsigned item, built from live settings + catalog. Null once signed. */
  consentPreview: ConsentBlock[] | null;
  /** Blocks rebuilt from the signed snapshot. Null when unsigned. */
  consentDocument: ConsentBlock[] | null;
  consent: Consent | null;
  consentTemplateUpdatedAt: string;
  settingsUpdatedAt: string | null;
  defaultPlace: string;
  /** False when clinic settings are missing or the physician identity is blank. */
  canSign: boolean;
  diagrams: DiagramViewRecord[];
}

export type ConsentSectionKey =
  | 'description'
  | 'risks'
  | 'alternatives'
  | 'aftercare'
  | 'contraindications';

export interface ConsentSection {
  key: ConsentSectionKey;
  body: string;
}

export type ConsentSignatureRole = 'patient' | 'witness' | 'doctor';

export type ConsentBlock =
  | { kind: 'title'; text: string }
  | { kind: 'fieldLine'; label: string; value: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'sectionHeading'; text: string }
  | { kind: 'signatureBlock'; role: ConsentSignatureRole; caption: string; subCaption?: string };
