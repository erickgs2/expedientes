export interface TreatmentType {
  id: string;
  name: string;
  consentTemplate: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TreatmentTypeUpdateInput {
  name?: string;
  consentTemplate?: string;
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
