export interface PatientSummary {
  id: string;
  fullName: string;
  phone: string;
  /** Null when the patient had no CURP to hand at registration; it can be filled in later. */
  documentId: string | null;
}

export interface CreatePatientRequest {
  fullName: string;
  phone: string;
  documentId?: string;
}
