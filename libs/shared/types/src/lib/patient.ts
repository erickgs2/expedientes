export interface PatientSummary {
  id: string;
  fullName: string;
  phone: string;
  documentId: string;
}

export interface CreatePatientRequest {
  fullName: string;
  phone: string;
  documentId: string;
}
