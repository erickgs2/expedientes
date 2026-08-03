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
