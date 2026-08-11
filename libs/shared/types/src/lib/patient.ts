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

/** At-a-glance counts for the clinical-history screen's shortcut widgets. */
export interface PatientSummaryStats {
  valoraciones: { count: number; lastDate: string | null };
  photos: { count: number };
  treatments: { count: number; lastDate: string | null };
  appointments: { upcomingCount: number; nextStartTime: string | null };
}
