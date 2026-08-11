import type { DiagramViewRecord } from './diagram.js';

export interface Consent {
  id: string;
  consentText: string;
  signatureImagePath: string;
  signedAt: string;
}

/** One treatment item's full detail — returned by `GET /api/treatment-items/[id]`, the shape the
 * consent-signing page reads: `consentTemplate` for pre-fill when unsigned, `consent` once signed. */
export interface TreatmentItemDetail {
  id: string;
  treatmentId: string;
  treatmentTypeId: string;
  treatmentTypeName: string;
  notes: string | null;
  patientId: string;
  consentTemplate: string;
  consentTemplateUpdatedAt: string;
  consent: Consent | null;
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
