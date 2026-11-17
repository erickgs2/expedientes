/** The patient whose phone receives another patient's WhatsApp notices. */
export interface NotificationContact {
  id: string;
  fullName: string;
  phone: string;
}

export interface PatientSummary {
  id: string;
  fullName: string;
  /** Empty when the patient's notices go to `contactPatient` instead. */
  phone: string;
  /** Null when the patient had no CURP to hand at registration; it can be filled in later. */
  documentId: string | null;
  /** Set when appointment notices go to another patient's phone (a companion). */
  contactPatientId?: string | null;
  contactPatient?: NotificationContact | null;
  /** Patients whose notices this patient receives. Only on the single-patient endpoint. */
  dependents?: { id: string; fullName: string }[];
}

export interface CreatePatientRequest {
  fullName: string;
  /** May be empty when `contactPatientId` is given. */
  phone: string;
  documentId?: string;
  /** Send this patient's appointment notices to that patient's phone. */
  contactPatientId?: string;
}

/** At-a-glance counts for the clinical-history screen's shortcut widgets. */
export interface PatientSummaryStats {
  valoraciones: { count: number; lastDate: string | null };
  photos: { count: number };
  treatments: { count: number; lastDate: string | null };
  appointments: { upcomingCount: number; nextStartTime: string | null };
}

/** A patient the current user opened recently, newest first. */
export interface RecentPatient {
  patientId: string;
  patientName: string;
  /** The audited entity last opened, e.g. `HistoriaClinica`, `Treatment`. */
  entity: string;
  viewedAt: string;
}

export type PreviewConsentState = 'digital' | 'paper' | 'missing';

export interface PatientPreviewTreatmentItem {
  treatmentTypeName: string;
  products: { brand: string; lotNumber: string; expiryDate: string | null }[];
  consent: PreviewConsentState;
}

/**
 * What the patient search shows beside the list before a record is opened: enough to confirm it is
 * the right patient and to jump straight to the section needed. Every block the caller lacks the
 * permission for is `null`, decided on the server.
 */
export interface PatientPreview {
  patient: PatientSummary & { createdAt: string };
  stats: PatientSummaryStats;
  /** Whole years, from the historia clínica's birth date. `null` if unknown or not permitted. */
  age: number | null;
  /** `null` without `historia-clinica:view`. */
  hasHistoria: boolean | null;
  /** Only the fact — never which allergy. `null` without `historia-clinica:view`. */
  hasAllergies: boolean | null;
  /** `undefined` never; `null` when there is none or without `appointments:view`. */
  nextAppointment: { startTime: string; treatmentTypeNames: string[] } | null;
  /** `null` when there is none or without `treatments:view`. */
  lastTreatment: { fecha: string; items: PatientPreviewTreatmentItem[] } | null;
}

/** A photo shown as a thumbnail on the patient timeline; `path` is served under `/api/files/`. */
export interface TimelinePhoto {
  path: string;
  tag: 'BEFORE' | 'AFTER';
}

export type TimelineEvent =
  | {
      kind: 'appointment';
      id: string;
      date: string;
      status: 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
      treatmentTypeNames: string[];
      notes: string | null;
    }
  | {
      kind: 'valoracion';
      id: string;
      date: string;
      viewCount: number;
      photoCount: number;
      notes: string | null;
      photos: TimelinePhoto[];
    }
  | {
      kind: 'treatment';
      id: string;
      date: string;
      items: {
        id: string;
        treatmentTypeName: string;
        products: { brand: string; lotNumber: string; expiryDate: string | null }[];
        consent: PreviewConsentState;
        photos: TimelinePhoto[];
      }[];
    }
  | { kind: 'created'; id: string; date: string };

/**
 * Everything that happened to one patient, newest first, with upcoming appointments ahead of the
 * past. Each kind is present only when the caller may see it.
 */
export interface PatientTimeline {
  events: TimelineEvent[];
  /** Which kinds were included, so the screen offers only filters that can match. */
  included: { appointments: boolean; valoraciones: boolean; treatments: boolean };
}
