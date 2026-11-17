export interface TreatmentType {
  id: string;
  name: string;
  consentDescription: string;
  consentRisks: string | null;
  consentAlternatives: string | null;
  consentAftercare: string | null;
  consentContraindications: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Returned only by `GET /api/treatment-types?include=usage` (the catalog screen). */
export interface TreatmentTypeUsage {
  /** Distinct patients with at least one treatment of this type. */
  patientCount: number;
  /** ISO date of the most recent treatment visit that used it, or null if never used. */
  lastUsedAt: string | null;
}

export interface TreatmentTypeWithUsage extends TreatmentType {
  /** Absent when the server could not compute usage; the catalog then hides those details. */
  usage?: TreatmentTypeUsage;
}

export interface TreatmentTypeUpdateInput {
  name?: string;
  consentDescription?: string;
  consentRisks?: string | null;
  consentAlternatives?: string | null;
  consentAftercare?: string | null;
  consentContraindications?: string | null;
  active?: boolean;
}

/** A treatment visit without its items — the shape returned by the list endpoint, denormalizing
 * just the treatment type names for a lightweight history summary. */
export interface TreatmentSummary {
  id: string;
  patientId: string;
  fecha: string;
  treatmentTypeNames: string[];
}

export interface TreatmentItem {
  id: string;
  treatmentTypeId: string;
  treatmentTypeName: string;
  notes: string | null;
  hasConsent: boolean;
  /** How far the item has got, for the treatment screen's step cards. */
  progress?: TreatmentItemProgress;
}

export interface TreatmentItemProgress {
  /** Diagram views (front, profiles, close-ups) that hold annotations. */
  diagramViews: number;
  products: number;
  photosBefore: number;
  photosAfter: number;
}

/** A treatment visit with its full item detail — returned by the get and item-update endpoints. */
export interface Treatment {
  id: string;
  patientId: string;
  fecha: string;
  items: TreatmentItem[];
}

export interface TreatmentItemsUpdateInput {
  items: { treatmentTypeId: string; notes: string | null }[];
}
